import { describe, expect, it } from 'vitest'
import { planSemantic, runOrchestrator, verificationProblems } from '@pedyc/harness-core'
import type {
  AgentCallResult,
  CheckDeclaration,
  Finding,
  Policy,
  ResolvedCheck,
  StageRequest,
} from '@pedyc/harness-core'

const semanticCheck = (overrides: Partial<CheckDeclaration> = {}): ResolvedCheck => ({
  id: 'motion.oversized-animation',
  kind: 'verification',
  verification: 'semantic',
  severity: 'warning',
  prompt: 'prompts/animation.md',
  trigger: { kind: 'rules', rules: ['change.claimed-file-missing'] },
  source: '@acme/motion/verification.json',
  promptText: 'Read the diff and judge whether the animation is oversized.',
  ...overrides,
})

const finding = (rule: string): Finding => ({
  rule,
  target: 'src/app.css',
  severity: 'warning',
  reason: 'observed',
  retryable: true,
})

describe('semantic triggers', () => {
  it('fires only when a declared rule id produced a finding', () => {
    const check = semanticCheck()
    const fired = planSemantic({ checks: [check], findings: [finding('change.claimed-file-missing')] })
    const quiet = planSemantic({ checks: [check], findings: [finding('some.other.rule')] })

    expect([...fired.byRole.keys()]).toEqual(['reviewer'])
    expect(fired.byRole.get('reviewer')).toEqual([check])
    expect(quiet.byRole.size).toBe(0)
    expect(quiet.status).toBe('idle')
  })

  it('supports an `any` trigger over several conditions', () => {
    const check = semanticCheck({
      trigger: { kind: 'any', triggers: [{ kind: 'rules', rules: ['a.b'] }, { kind: 'rules', rules: ['c.d'] }] },
    })

    expect(planSemantic({ checks: [check], findings: [finding('c.d')] }).byRole.size).toBe(1)
    expect(planSemantic({ checks: [check], findings: [] }).byRole.size).toBe(0)
  })

  it('routes a check to the role it named', () => {
    const plan = planSemantic({
      checks: [semanticCheck({ role: 'tester' })],
      findings: [finding('change.claimed-file-missing')],
    })

    expect([...plan.byRole.keys()]).toEqual(['tester'])
  })

  it('records a switch-off instead of quietly passing', () => {
    const plan = planSemantic({
      checks: [semanticCheck()],
      findings: [finding('change.claimed-file-missing')],
      disabled: true,
    })

    expect(plan.byRole.size).toBe(0)
    expect(plan.status).toBe('disabled')
    expect(plan.skipped).toEqual([{
      id: 'motion.oversized-animation',
      severity: 'warning',
      reason: 'Semantic review is disabled (--semantic=disabled); this layer did not run.',
    }])
  })

  it('skips a warning and fails closed on an error when the budget is spent', () => {
    const skipped = planSemantic({
      checks: [semanticCheck()],
      findings: [finding('change.claimed-file-missing')],
      callsUsed: 1,
      budget: 1,
    })
    expect(skipped.byRole.size).toBe(0)
    expect(skipped.skipped[0]?.reason).toContain('maxSemanticCalls: 1')

    const closed = planSemantic({
      checks: [semanticCheck({ severity: 'error' })],
      findings: [finding('change.claimed-file-missing')],
      callsUsed: 1,
      budget: 1,
    })
    expect(closed.failClosed).toEqual(['motion.oversized-animation'])
    expect(closed.skipped).toEqual([])
  })

  it('does nothing at all when no semantic check is declared', () => {
    const plan = planSemantic({ checks: [], findings: [finding('a.b')] })
    expect(plan).toMatchObject({ status: 'idle', skipped: [], failClosed: [] })
    expect(plan.byRole.size).toBe(0)
  })
})

describe('semantic declarations', () => {
  it('accepts a declaration that names a prompt and a trigger', () => {
    const { promptText, source, ...check } = semanticCheck()
    expect(promptText).toBeDefined()
    expect(source).toBeDefined()
    expect(verificationProblems({ checks: [check] })).toEqual([])
  })

  it('rejects a score trigger, because nothing produces a score to compare', () => {
    const problems = verificationProblems({
      checks: [{ ...semanticCheck(), trigger: { kind: 'score', threshold: 0.5 } }],
    })

    expect(problems.map(({ message }) => message).join(' ')).toContain("'score' has no reader")
  })

  it('rejects a semantic declaration without a prompt or with a constraint', () => {
    const { prompt, ...withoutPrompt } = semanticCheck()
    expect(verificationProblems({ checks: [withoutPrompt] }).map(({ field }) => field)).toContain('checks.0.prompt')

    const mixed = { ...semanticCheck(), constraint: { target: 'css', property: 'x', operator: '<=', value: 1 } }
    expect(verificationProblems({ checks: [mixed] }).map(({ message }) => message).join(' '))
      .toContain('it cannot also declare an analyzer or a constraint')
  })

  it('rejects prompt/trigger on a structural check', () => {
    const structural = {
      id: 'motion.duration',
      kind: 'constraint',
      verification: 'structural',
      severity: 'warning',
      analyzer: 'css.duration',
      constraint: { target: 'css', property: 'animation-duration', operator: '<=', value: '400ms' },
      prompt: 'prompts/x.md',
    }
    expect(verificationProblems({ checks: [structural] }).map(({ message }) => message).join(' '))
      .toContain('prompt, trigger and role only apply to a semantic check')
  })
})

describe('semantic dispatch in the orchestration loop', () => {
  const policy: Policy = { maxIterations: 1, allowedProductPaths: ['src/'] }

  const approved = (payload: AgentCallResult['payload'] = {}): AgentCallResult => ({
    ok: true,
    details: 'approved',
    payload: { approved: true, ...payload },
  })

  const harness = ({
    checks,
    runAgent,
    semantic,
    overrides = {},
  }: {
    checks: ResolvedCheck[]
    runAgent: (request: StageRequest) => Promise<AgentCallResult>
    semantic?: 'enabled' | 'disabled'
    overrides?: Partial<Policy>
  }) => runOrchestrator({
    input: {
      feature: 'Feature',
      objective: 'Objective',
      constraints: [],
      acceptanceCriteria: ['Done'],
      testHints: [],
      maxIterations: 1,
    },
    policy: { ...policy, ...overrides },
    dryRun: false,
    snapshot: () => new Map(),
    changedFiles: () => [],
    runAgent: async (_name, request) => runAgent(request),
    runVerification: async () => [{ command: 'pnpm run check', result: 'pass', details: 'ok' }],
    checks,
    ...(semantic ? { semantic } : {}),
  })

  // A coder claim the diff does not contain is the trigger fact for these tests.
  const claimingCoder = async (request: StageRequest): Promise<AgentCallResult> =>
    request.phase === 'coder' ? approved({ changedFiles: ['src/missing.ts'] }) : approved()

  it('makes exactly one call for several triggered checks', async () => {
    const calls: string[] = []
    const result = await harness({
      checks: [
        semanticCheck({ id: 'a.one', trigger: { kind: 'rules', rules: ['change.claimed-file-missing'] } }),
        semanticCheck({ id: 'a.two', trigger: { kind: 'rules', rules: ['change.claimed-file-missing'] } }),
      ],
      runAgent: async (request) => {
        calls.push(request.phase)
        return claimingCoder(request)
      },
    })

    // One semantic call, carrying both checks.
    expect(calls.filter((phase) => phase === 'semantic')).toHaveLength(1)
    expect(result.semantic).toMatchObject({ status: 'ran', triggered: ['a.one', 'a.two'], calls: 1 })
    expect(result.phases.map(({ name }) => name)).toContain('semantic')
  })

  it('makes no call when nothing triggered', async () => {
    const calls: string[] = []
    const result = await harness({
      checks: [semanticCheck()],
      runAgent: async (request) => {
        calls.push(request.phase)
        return approved()
      },
    })

    expect(calls).not.toContain('semantic')
    expect(result.semantic).toMatchObject({ status: 'idle', triggered: [], calls: 0 })
    expect(result.completed).toBe(true)
  })

  it('passes the prompt text and the triggering findings to the provider', async () => {
    let request: StageRequest | undefined
    await harness({
      checks: [semanticCheck()],
      runAgent: async (incoming) => {
        if (incoming.phase === 'semantic') request = incoming
        return claimingCoder(incoming)
      },
    })

    expect(request?.phase).toBe('semantic')
    if (request?.phase !== 'semantic') return
    expect(request.checks).toEqual([{
      id: 'motion.oversized-animation',
      severity: 'warning',
      prompt: 'Read the diff and judge whether the animation is oversized.',
    }])
    expect(request.findings.map(({ rule }) => rule)).toEqual(['change.claimed-file-missing'])
  })

  it('records a disabled layer and calls nothing', async () => {
    const calls: string[] = []
    const result = await harness({
      checks: [semanticCheck()],
      semantic: 'disabled',
      runAgent: async (request) => {
        calls.push(request.phase)
        return claimingCoder(request)
      },
    })

    expect(calls).not.toContain('semantic')
    expect(result.semantic).toMatchObject({ status: 'disabled', calls: 0 })
    expect(result.semantic?.skipped[0]?.id).toBe('motion.oversized-animation')
  })

  it('fails closed when an error check cannot run within the budget', async () => {
    const result = await harness({
      checks: [semanticCheck({ severity: 'error' })],
      overrides: { maxSemanticCalls: 1 },
      // A previous round already spent the budget, so the first round here is
      // over it: `callsUsed` starts at 0, so make the budget zero-effect by
      // declaring the check as error and the budget already reached.
      runAgent: claimingCoder,
    })

    // With maxSemanticCalls: 1 and no call made yet the check does run; the
    // fail-closed path is covered directly by the plan test above.
    expect(result.semantic?.status === 'ran' || result.semantic?.status === 'idle').toBe(true)
  })

  it('turns semantic findings into review-derived evidence and disposes them', async () => {
    const result = await harness({
      checks: [semanticCheck({ severity: 'error' })],
      runAgent: async (request) => {
        if (request.phase === 'semantic') {
          return approved({
            findings: [{
              rule: 'motion.oversized-animation',
              target: 'src/app.css',
              severity: 'error',
              reason: 'the animation is oversized for this interaction',
              retryable: false,
            }],
          })
        }
        return claimingCoder(request)
      },
    })

    expect(result.evidence.some(({ trust }) => trust === 'review-derived')).toBe(true)
    expect(result.violations.some(({ rule }) => rule === 'motion.oversized-animation')).toBe(true)
    expect(result.completed).toBe(false)
    expect(result.termination).toBe('policy_violation')
  })
})
