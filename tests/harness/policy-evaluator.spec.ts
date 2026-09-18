import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createProviderRunner,
  describeFileViolations,
  evaluateCommand,
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

describe('policy evaluator: command rules', () => {
  const forbidding = (patterns: string[]) => ({ forbiddenCommands: patterns })

  it('matches a forbidden pattern against the executable and its arguments', () => {
    expect(evaluateCommand('npm', ['publish'], forbidding(['npm publish'])).allowed).toBe(false)
  })

  it('matches a forbidden pattern that the command extends with more arguments', () => {
    expect(evaluateCommand('npm', ['publish', '--tag', 'beta'], forbidding(['npm publish'])).allowed).toBe(false)
  })

  it('does not match a longer token that merely starts the same way', () => {
    expect(evaluateCommand('npm', ['publish-notes'], forbidding(['npm publish'])).allowed).toBe(true)
  })

  it('matches through a wrapper, because the tokens only have to appear contiguously', () => {
    expect(evaluateCommand('sudo', ['npm', 'publish'], forbidding(['npm publish'])).allowed).toBe(false)
  })

  it('normalises the executable, so a path or a Windows shim still matches', () => {
    expect(evaluateCommand('/usr/bin/npm', ['publish'], forbidding(['npm publish'])).allowed).toBe(false)
    expect(evaluateCommand('npm.cmd', ['publish'], forbidding(['npm publish'])).allowed).toBe(false)
  })

  it('does not interpret a quoted shell string, which is a recorded boundary', () => {
    expect(evaluateCommand('sh', ['-c', '"npm publish"'], forbidding(['npm publish'])).allowed).toBe(true)
  })

  it('leaves an unrelated command alone', () => {
    expect(evaluateCommand('pnpm', ['run', 'build'], forbidding(['npm publish'])).allowed).toBe(true)
  })

  it('keeps allowedAgentCommands an exact member list, and lets a denial outrank it', () => {
    expect(evaluateCommand('node', ['scripts/x.mjs'], { allowedAgentCommands: ['node'] }).allowed).toBe(true)
    const notAllowed = evaluateCommand('curl', ['https://example.test'], { allowedAgentCommands: ['node'] })
    expect(notAllowed.allowed).toBe(false)
    expect(notAllowed.violations.map(({ rule }) => rule)).toEqual(['allowedAgentCommands'])
    const denied = evaluateCommand('npm', ['publish'], {
      allowedAgentCommands: ['npm'],
      forbiddenCommands: ['npm publish'],
    })
    expect(denied.allowed).toBe(false)
    expect(denied.violations.map(({ rule }) => rule)).toEqual(['forbiddenCommands'])
  })
})

describe('policy evaluator: onViolation', () => {
  it('defaults to escalating a protected-path violation', () => {
    const decision = evaluateFiles(['src/generated/client.ts'], policy({ protectedPaths: ['src/generated/'] }))
    expect(decision.violations[0]?.action).toBe('reject')
    expect(refusedFiles(decision.violations)).toEqual(['src/generated/client.ts'])
  })

  it('records a protected-path violation without escalating it when the project reports', () => {
    const decision = evaluateFiles(
      ['src/generated/client.ts'],
      policy({ protectedPaths: ['src/generated/'], onViolation: 'report' }),
    )
    expect(decision.allowed).toBe(false)
    expect(decision.violations[0]?.action).toBe('report')
    expect(refusedFiles(decision.violations)).toEqual([])
  })

  it('never relaxes a command refusal into an execution, whatever the mode', () => {
    const decision = evaluateCommand('npm', ['publish'], {
      forbiddenCommands: ['npm publish'],
      onViolation: 'report',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.violations[0]?.action).toBe('report')
  })

  it('passes a run that reports a protected file, and still records the judgment', async () => {
    const result = await runWith(
      ['src/generated/client.ts'],
      { protectedPaths: ['src/generated/'], onViolation: 'report' },
    )
    expect(result.completed).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.violations.map(({ rule, action }) => `${rule}:${action}`)).toEqual(['protectedPaths:report'])
  })
})

describe('policy evaluator: provider commands', () => {
  it('refuses a forbidden provider command before it can have a side effect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-forbidden-'))
    const sideEffect = join(root, 'side-effect.txt')
    const runner = createProviderRunner({
      root,
      agents: {
        providers: {
          probe: {
            command: 'node',
            args: ['-e', `require('fs').writeFileSync(${JSON.stringify(sideEffect)}, 'ran')`],
          },
        },
        coder: { mode: 'external', provider: 'probe' },
      },
      policy: { forbiddenCommands: ['node -e'] },
      validator: () => true,
      ajv: { errorsText: () => '' },
    })

    const result = await runner('coder', {
      phase: 'coder',
      input: task,
      implementationPlan: [],
      iteration: 1,
      previousVerification: [],
    })

    expect(result.ok).toBe(false)
    expect(result.violations?.[0]?.rule).toBe('forbiddenCommands')
    // The proof that the refusal happened before execution, not after it.
    expect(existsSync(sideEffect)).toBe(false)
  })

  it('still refuses the same command under onViolation: report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-forbidden-report-'))
    const sideEffect = join(root, 'side-effect.txt')
    const runner = createProviderRunner({
      root,
      agents: {
        providers: {
          probe: {
            command: 'node',
            args: ['-e', `require('fs').writeFileSync(${JSON.stringify(sideEffect)}, 'ran')`],
          },
        },
        coder: { mode: 'external', provider: 'probe' },
      },
      policy: { forbiddenCommands: ['node -e'], onViolation: 'report' },
      validator: () => true,
      ajv: { errorsText: () => '' },
    })

    const result = await runner('coder', {
      phase: 'coder',
      input: task,
      implementationPlan: [],
      iteration: 1,
      previousVerification: [],
    })

    expect(result.ok).toBe(false)
    // `report` changes the disposition, never the side-effect control.
    expect(result.violations?.[0]?.action).toBe('report')
    expect(existsSync(sideEffect)).toBe(false)
  })
})
