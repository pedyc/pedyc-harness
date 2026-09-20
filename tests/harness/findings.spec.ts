import { describe, expect, it } from 'vitest'
import {
  actionFor,
  claimMismatches,
  dedupeFindings,
  evaluateFindings,
  findingVerdict,
  runOrchestrator,
  sanitizeEvidenceRefs,
} from '@pedyc/harness-core'
import type {
  AgentCallResult,
  Finding,
  Policy,
  StageRequest,
  VerificationCheck,
} from '@pedyc/harness-core'

const policy: Policy = { maxIterations: 3, allowedProductPaths: ['src/'] }

const task = {
  feature: 'Feature',
  objective: 'Objective',
  constraints: [],
  acceptanceCriteria: ['Done'],
  testHints: [],
  maxIterations: 3,
}

const approved = (payload: AgentCallResult['payload'] = {}): AgentCallResult => ({
  ok: true,
  details: 'approved',
  payload: { approved: true, ...payload },
})

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  rule: 'change.claimed-file-missing',
  target: 'src/missing.ts',
  severity: 'warning',
  reason: 'An agent claimed to change src/missing.ts, but the diff does not contain it.',
  retryable: true,
  ...overrides,
})

describe('the severity-to-action mapping', () => {
  it('uses the documented defaults', () => {
    expect(actionFor('error', {})).toBe('reject')
    expect(actionFor('warning', {})).toBe('review')
    expect(actionFor('info', {})).toBe('report')
  })

  it('accepts a tighter override and ignores a looser one', () => {
    expect(actionFor('warning', { severityActions: { warning: 'reject' } })).toBe('reject')
    // An in-memory policy that was never validated must not be able to loosen a
    // safety semantic either, so the clamp lives in the evaluator as well.
    expect(actionFor('error', { severityActions: { error: 'report' } })).toBe('reject')
  })
})

describe('finding disposition', () => {
  it('keeps the strictest of the declaration, the claim and the project override', () => {
    const decision = evaluateFindings(
      [finding({ severity: 'info' })],
      { ...policy, rules: { 'change.claimed-file-missing': { severity: 'error' } } },
      ['change.claimed-file-missing'],
    )

    expect(decision.violations[0]).toMatchObject({ rule: 'change.claimed-file-missing', severity: 'error', action: 'reject' })
    expect(decision.allowed).toBe(false)
  })

  it('reports a rule id nobody declares instead of judging it', () => {
    const decision = evaluateFindings([finding({ rule: 'vue/no-options-api' })], policy, [])

    expect(decision.unknown).toEqual(['vue/no-options-api'])
    expect(decision.violations).toEqual([])
    expect(decision.allowed).toBe(false)
  })

  it('turns an unconfirmed warning into a rejection and lets a confirmation through', () => {
    const unconfirmed = evaluateFindings([finding()], policy, [])
    expect(unconfirmed.violations[0]?.action).toBe('reject')
    expect(unconfirmed.violations[0]?.reason).toContain('unconfirmed')
    expect(unconfirmed.allowed).toBe(false)

    const confirmed = evaluateFindings([finding()], policy, ['change.claimed-file-missing'])
    expect(confirmed.violations[0]?.action).toBe('review')
    expect(confirmed.allowed).toBe(true)
  })

  it('never lets confidence take part in the verdict', () => {
    const decision = evaluateFindings([finding({ confidence: 0.01 })], policy, ['change.claimed-file-missing'])

    expect(decision.allowed).toBe(true)
    expect(decision.violations[0]?.retryable).toBe(true)
  })
})

describe('finding verdicts', () => {
  const verdict = (findings: Finding[], confirmed: string[] = []) =>
    findingVerdict(evaluateFindings(findings, policy, confirmed))

  it('asks for a repair when every blocking finding is repairable', () => {
    expect(verdict([finding()])).toMatchObject({ passed: false, retry: true })
  })

  it('stops when a blocking finding cannot be repaired', () => {
    expect(verdict([finding({ retryable: false })])).toMatchObject({ passed: false, retry: false })
  })

  it('stops when one of several blocking findings is not repairable', () => {
    const result = verdict([
      finding(),
      finding({ target: 'src/other.ts', retryable: false }),
    ])

    expect(result.blocking).toHaveLength(2)
    expect(result.retry).toBe(false)
  })

  it('stops on an undeclared rule id, because nothing can be repaired there', () => {
    expect(verdict([finding({ rule: 'ghost.rule' })])).toMatchObject({ passed: false, retry: false })
  })

  it('passes a reported finding without pretending it was enforced', () => {
    // The rule declares `warning`, so an `info` claim still lands on `review`;
    // the reviewer confirmed it, and the run may pass.
    const result = verdict([finding({ severity: 'info' })], ['change.claimed-file-missing'])
    expect(result.passed).toBe(true)
    expect(result.blocking).toEqual([])
  })
})

describe('the consistency check', () => {
  it('lists only the claimed files the diff does not contain, once each', () => {
    expect(claimMismatches(['src/a.ts', 'src/a.ts', 'src/b.ts'], ['src/a.ts'])).toEqual([
      {
        rule: 'change.claimed-file-missing',
        target: 'src/b.ts',
        severity: 'warning',
        reason: "An agent claimed to change src/b.ts, but this iteration's diff does not contain it.",
        retryable: true,
      },
    ])
  })

  it('drops a citation the iteration cannot account for', () => {
    const sanitized = sanitizeEvidenceRefs(finding({ evidence: ['src/a.ts', 'src/ghost.ts'] }), ['src/a.ts'])

    expect(sanitized.evidence).toEqual(['src/a.ts'])
  })

  it('keeps the first of two findings about the same rule and target', () => {
    const first = finding({ reason: 'first' })
    const second = finding({ reason: 'second' })

    expect(dedupeFindings([first, second])).toEqual([first])
  })
})

describe('findings in the orchestration loop', () => {
  const harness = ({
    runAgent,
    runVerification = async (): Promise<VerificationCheck[]> => [
      { command: 'pnpm run check', result: 'pass', details: 'ok' },
    ],
    maxIterations = 3,
  }: {
    runAgent: (request: StageRequest) => Promise<AgentCallResult>
    runVerification?: () => Promise<VerificationCheck[]>
    maxIterations?: number
  }) => runOrchestrator({
    input: { ...task, maxIterations },
    policy: { ...policy, maxIterations },
    dryRun: false,
    snapshot: () => new Map(),
    changedFiles: () => [],
    runAgent: async (_name, request) => runAgent(request),
    runVerification,
  })

  it('accepts a reviewer that answers with findings and no boolean', async () => {
    // `approved` is a compatibility field: a reviewer that states its position
    // through findings has answered, and only an explicit `false` rejects.
    const result = await harness({
      runAgent: async (request) => (request.phase === 'reviewer'
        ? { ok: true, details: 'nothing to report', payload: { findings: [] } }
        : approved()),
    })

    expect(result.completed).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('rejects when the reviewer explicitly does not approve', async () => {
    const result = await harness({
      runAgent: async (request) => (request.phase === 'reviewer'
        ? { ok: true, details: 'not approved', payload: { approved: false, findings: [] } }
        : approved()),
    })

    expect(result.completed).toBe(false)
    expect(result.termination).toBe('agent_error')
  })

  it('records how the checking stage was routed', async () => {
    const result = await runOrchestrator({
      input: task,
      policy,
      dryRun: false,
      snapshot: () => new Map(),
      changedFiles: () => [],
      runAgent: async () => approved(),
      runVerification: async () => [{ command: 'pnpm run check', result: 'pass', details: 'ok' }],
      independence: { coder: 'fixture', reviewer: 'other', sameSource: false },
    })

    expect(result.independence).toEqual({ coder: 'fixture', reviewer: 'other', sameSource: false })
  })

  it('sends a repairable finding back to the coder and can then pass', async () => {
    const coderAttempts: number[] = []
    let previousFindings: unknown
    const result = await harness({
      runAgent: async (request) => {
        if (request.phase === 'coder') {
          coderAttempts.push(request.iteration)
          previousFindings = request.previousFindings
          return approved()
        }
        if (request.phase === 'reviewer' && request.iteration === 1) {
          // A repairable `error` is the finding that sends the run back.
          return approved({ findings: [finding({ severity: 'error', retryable: true })] })
        }
        return approved()
      },
    })

    expect(result.completed).toBe(true)
    expect(coderAttempts).toEqual([1, 2])
    // The reflux is the structured finding itself, never a summary of it.
    expect(previousFindings).toEqual([
      {
        rule: 'change.claimed-file-missing',
        target: 'src/missing.ts',
        severity: 'error',
        reason: 'An agent claimed to change src/missing.ts, but the diff does not contain it.',
        retryable: true,
      },
    ])
  })

  it('terminates on a finding that declares itself unrepairable', async () => {
    const result = await harness({
      runAgent: async (request) => request.phase === 'reviewer'
        ? approved({ findings: [finding({ severity: 'error', retryable: false })] })
        : approved(),
    })

    expect(result.completed).toBe(false)
    expect(result.termination).toBe('policy_violation')
    expect(result.findings).toHaveLength(1)
    expect(result.violations.some(({ rule, action }) => rule === 'change.claimed-file-missing' && action === 'reject')).toBe(true)
  })

  it('fails loudly when a reviewer cites a rule nobody declares', async () => {
    const result = await harness({
      runAgent: async (request) => request.phase === 'reviewer'
        ? approved({ findings: [finding({ rule: 'ghost.rule' })] })
        : approved(),
    })

    expect(result.completed).toBe(false)
    expect(result.termination).toBe('agent_error')
    expect(result.issues.join(' ')).toContain('ghost.rule')
  })

  it('catches a claimed change the diff does not contain and asks the reviewer to confirm it', async () => {
    const claims = async (request: StageRequest): Promise<AgentCallResult> => {
      if (request.phase === 'coder') return approved({ changedFiles: ['src/missing.ts'] })
      return approved()
    }
    const unconfirmed = await harness({ runAgent: claims, maxIterations: 1 })

    expect(unconfirmed.completed).toBe(false)
    expect(unconfirmed.findings.map(({ rule }) => rule)).toEqual(['change.claimed-file-missing'])
    expect(unconfirmed.termination).toBe('max_iterations')

    const confirmed = await harness({
      runAgent: async (request) => {
        if (request.phase === 'coder') return approved({ changedFiles: ['src/missing.ts'] })
        // The reviewer saw the harness finding and confirms the same rule.
        if (request.phase === 'reviewer') return approved({ findings: [finding({ severity: 'warning' })] })
        return approved()
      },
      maxIterations: 1,
    })

    expect(confirmed.completed).toBe(true)
  })

  it('does not let a stale claim from an earlier attempt fail a later one', async () => {
    const result = await harness({
      runAgent: async (request) => {
        // The first attempt claims a file the diff never contains, and no
        // reviewer confirms the warning, so the run is sent back. The second
        // attempt claims nothing; the earlier sentence must not resurface.
        if (request.phase === 'coder' && request.iteration === 1) return approved({ changedFiles: ['src/missing.ts'] })
        return approved()
      },
    })

    expect(result.completed).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('records the evidence and the findings beside each other', async () => {
    const result = await harness({
      runAgent: async (request) => request.phase === 'reviewer'
        ? approved({ findings: [finding({ severity: 'info' })] })
        : approved(),
      runVerification: async () => [{ command: 'pnpm run check', result: 'pass', details: 'ok' }],
    })

    expect(result.evidence).toHaveLength(1)
    expect(result.findings).toHaveLength(1)
    // The rule declares `warning`, so an `info` claim cannot lower it: the
    // disposition stays `review`, and the reviewer that reported it confirmed it.
    expect(result.violations.at(-1)).toMatchObject({ rule: 'change.claimed-file-missing', severity: 'warning', action: 'review' })
  })
})
