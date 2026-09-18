import {
  describeFileViolations,
  evaluateFiles,
  findOutOfScopeChanges,
  refusedFiles,
  runOrchestrator,
} from '@pedyc/harness-core'
import type { Policy, RunAgent } from '@pedyc/harness-core'

const policy = (overrides: Partial<Policy> = {}): Policy => ({
  maxIterations: 1,
  allowedProductPaths: ['src/'],
  protectedPaths: [],
  ...overrides,
})

const task = {
  feature: 'Feature',
  objective: 'Objective',
  constraints: [],
  acceptanceCriteria: ['Done'],
  testHints: [],
  maxIterations: 1,
}

// Every agent approves, including the reviewer and the tester. Anything that
// still fails a run below therefore failed because of the harness's own policy
// judgment, not because an agent objected.
const approvingAgent: RunAgent = async (name) =>
  name === 'tester' || name === 'reviewer'
    ? { ok: true, details: 'approved', payload: { approved: true } }
    : { ok: true, details: 'ok', payload: {} }

const runWith = (changed: string[], overrides: Partial<Policy> = {}) =>
  runOrchestrator({
    input: task,
    policy: policy(overrides),
    dryRun: false,
    snapshot: () => new Map(),
    changedFiles: () => changed,
    runAgent: approvingAgent,
    runVerification: async () => [{ command: 'build', result: 'pass', details: 'ok' }],
  })

const reviewerDetails = (phases: Array<{ name: string; details: string }>): string | undefined =>
  phases.find(({ name }) => name === 'reviewer')?.details

describe('policy evaluator: file rules', () => {
  it('allows a change inside allowedProductPaths', () => {
    const decision = evaluateFiles(['src/app.ts'], policy())
    expect(decision.allowed).toBe(true)
    expect(decision.violations).toEqual([])
  })

  it('refuses a protected path even when it is inside allowedProductPaths', () => {
    const decision = evaluateFiles(['src/generated/client.ts'], policy({ protectedPaths: ['src/generated/'] }))
    expect(decision.allowed).toBe(false)
    expect(decision.violations.map(({ rule }) => rule)).toEqual(['protectedPaths'])
    expect(decision.violations[0]?.reason).toContain("inside protected path 'src/generated/'")
    expect(refusedFiles(decision.violations)).toEqual(['src/generated/client.ts'])
  })

  it('refuses a file outside allowedProductPaths', () => {
    const decision = evaluateFiles(['lib/util.ts'], policy())
    expect(decision.allowed).toBe(false)
    expect(decision.violations.map(({ rule }) => rule)).toEqual(['allowedProductPaths'])
    expect(describeFileViolations(decision.violations)).toBe('Out-of-scope files changed: lib/util.ts')
  })

  it('emits both rules when a file breaks both, and leads with protected', () => {
    const decision = evaluateFiles(['.harness/policy.json'], policy({ protectedPaths: ['.harness/'] }))
    expect(decision.allowed).toBe(false)
    expect(decision.violations.map(({ rule }) => rule).sort())
      .toEqual(['allowedProductPaths', 'protectedPaths'])
    expect(describeFileViolations(decision.violations)).toBe(
      'Protected files changed: .harness/policy.json; Out-of-scope files changed: .harness/policy.json',
    )
  })

  it('reports every refused file once, whatever refused it', () => {
    const decision = evaluateFiles(
      ['.harness/policy.json', 'src/app.ts', '.harness/policy.json'],
      policy({ protectedPaths: ['.harness/'] }),
    )
    expect(refusedFiles(decision.violations)).toEqual(['.harness/policy.json'])
  })

  it('keeps findOutOfScopeChanges reporting only the allowedProductPaths rule', () => {
    const value = policy({ protectedPaths: ['src/generated/'] })
    // Refused by the protected rule, but not "out of scope": it is inside the
    // allowed set, which is the whole reason the two rules are reported apart.
    expect(findOutOfScopeChanges(['src/generated/client.ts'], value)).toEqual([])
    expect(findOutOfScopeChanges(['.harness/policy.json'], value)).toEqual(['.harness/policy.json'])
  })
})

describe('policy evaluator: orchestration', () => {
  it('passes a change under a protected path when nothing protects it', async () => {
    const result = await runWith(['src/generated/client.ts'])
    expect(result.completed).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('fails a run on a protected path even when every agent approves', async () => {
    const result = await runWith(['src/generated/client.ts'], { protectedPaths: ['src/generated/'] })
    expect(result.completed).toBe(false)
    expect(reviewerDetails(result.phases)).toBe('Protected files changed: src/generated/client.ts')
    expect(result.issues).toContain('Protected files changed: src/generated/client.ts')
  })

  it('keeps the documented out-of-scope wording for an outside change', async () => {
    const result = await runWith(['lib/util.ts'])
    expect(result.completed).toBe(false)
    expect(reviewerDetails(result.phases)).toBe('Out-of-scope files changed: lib/util.ts')
  })

  it('reports both reasons when a change breaks both file rules', async () => {
    const result = await runWith(['.harness/policy.json'], { protectedPaths: ['.harness/'] })
    expect(result.completed).toBe(false)
    expect(reviewerDetails(result.phases)).toBe(
      'Protected files changed: .harness/policy.json; Out-of-scope files changed: .harness/policy.json',
    )
  })
})
