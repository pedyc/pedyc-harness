import { describe, expect, it } from 'vitest'
import { judgeScope, runOrchestrator } from '@pedyc/harness-core'
import type { AgentCallResult, Policy, StageRequest } from '@pedyc/harness-core'

const policy: Policy = {
  maxIterations: 2,
  allowedProductPaths: ['src/'],
  protectedPaths: ['.harness/'],
}

const task = {
  feature: 'Feature',
  objective: 'Objective',
  constraints: [],
  acceptanceCriteria: ['Done'],
  testHints: [],
  maxIterations: 2,
}

const approved = (payload: AgentCallResult['payload'] = {}): AgentCallResult => ({
  ok: true,
  details: 'approved',
  payload: { approved: true, ...payload },
})

const harness = ({
  changed,
  runAgent = async () => approved(),
}: {
  changed: string[]
  runAgent?: (request: StageRequest) => Promise<AgentCallResult>
}) => runOrchestrator({
  input: task,
  policy,
  dryRun: false,
  snapshot: () => new Map(),
  changedFiles: () => changed,
  runAgent: async (_name, request) => runAgent(request),
  runVerification: async () => [{ command: 'pnpm run check', result: 'pass', details: 'ok' }],
})

describe('the scope judgment', () => {
  it('passes when every change stays inside the allowed set', () => {
    expect(judgeScope(['src/app.ts'], policy)).toMatchObject({
      allowed: true,
      refusedFiles: [],
    })
    expect(judgeScope(['src/app.ts'], policy).details).toContain('1 changed file')
  })

  it('reports a protected hit as itself, not as "out of scope"', () => {
    // The protected directory is inside the allowed set here, which is the
    // realistic case and the reason the two rules are reported apart.
    const judgment = judgeScope(['.harness/policy.json'], {
      ...policy,
      allowedProductPaths: ['src/', '.harness/'],
    })

    expect(judgment.allowed).toBe(false)
    expect(judgment.refusedFiles).toEqual(['.harness/policy.json'])
    expect(judgment.details).toBe('Protected files changed: .harness/policy.json')
  })

  it('reports an out-of-scope change and the violations behind it', () => {
    const judgment = judgeScope(['outside/file.ts'], policy)

    expect(judgment.allowed).toBe(false)
    expect(judgment.details).toContain('Out-of-scope files changed: outside/file.ts')
    expect(judgment.violations.map(({ rule }) => rule)).toEqual(['allowedProductPaths'])
  })
})

describe('scope in the orchestration loop', () => {
  it('is recorded as its own phase and result field', async () => {
    const result = await harness({ changed: ['src/app.ts'] })

    expect(result.completed).toBe(true)
    expect(result.scope).toMatchObject({ allowed: true, refusedFiles: [] })
    expect(result.phases.map(({ name }) => name)).toEqual(['planner', 'coder', 'tester', 'scope', 'reviewer'])
    expect(result.phases.find(({ name }) => name === 'scope')?.status).toBe('passed')
  })

  it('refuses a change the reviewer approved, and says which of the two failed', async () => {
    const result = await harness({
      changed: ['outside/file.ts'],
      runAgent: async () => approved(),
    })

    expect(result.completed).toBe(false)
    expect(result.termination).toBe('policy_violation')
    // Two independent facts: the reviewer's own verdict was a pass, and the
    // harness's scope judgment was not.
    expect(result.phases.find(({ name }) => name === 'reviewer')?.status).toBe('passed')
    expect(result.phases.find(({ name }) => name === 'scope')).toMatchObject({ status: 'failed' })
    expect(result.scope?.allowed).toBe(false)
    expect(result.issues.join(' ')).toContain('Out-of-scope files changed: outside/file.ts')
  })

  it('never retries a refusal, even when a finding is repairable', async () => {
    let coderCalls = 0
    const result = await harness({
      changed: ['outside/file.ts'],
      runAgent: async (request) => {
        if (request.phase === 'coder') coderCalls += 1
        if (request.phase === 'reviewer') {
          return approved({
            findings: [{
              rule: 'change.claimed-file-missing',
              target: 'src/missing.ts',
              severity: 'error',
              reason: 'claimed file missing',
              retryable: true,
            }],
          })
        }
        return approved()
      },
    })

    expect(coderCalls).toBe(1)
    expect(result.termination).toBe('policy_violation')
  })

  it('omits the scope judgment on a dry run, which judges nothing', async () => {
    const result = await runOrchestrator({
      input: task,
      policy,
      dryRun: true,
      snapshot: () => new Map(),
      changedFiles: () => ['outside/file.ts'],
      runAgent: async () => approved(),
      runVerification: async () => [],
    })

    expect(result.scope).toBeUndefined()
    expect(result.phases.map(({ name }) => name)).toEqual(['planner', 'coder', 'tester', 'reviewer'])
  })
})
