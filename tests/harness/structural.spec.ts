import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzerDeclarations,
  builtInAnalyzers,
  compareConstraint,
  loadHarnessConfig,
  mergeChecks,
  runOrchestrator,
  runStructuralChecks,
  verificationProblems,
} from '@pedyc/harness-core'
import type {
  AgentCallResult,
  Analyzer,
  CheckDeclaration,
  Constraint,
  Policy,
} from '@pedyc/harness-core'

const constraint = (overrides: Partial<Constraint> = {}): Constraint => ({
  target: 'css',
  property: 'animation-duration',
  operator: '<=',
  value: '400ms',
  ...overrides,
})

const declaration = (overrides: Partial<CheckDeclaration> = {}): CheckDeclaration => ({
  id: 'motion.animation-duration',
  kind: 'constraint',
  verification: 'structural',
  severity: 'warning',
  analyzer: 'css.duration',
  constraint: constraint(),
  ...overrides,
})

const stylesheet = (content: string) => ({
  files: ['src/app.css'],
  readFile: () => content,
})

describe('the analyzer declaration and the implementation agree', () => {
  it('ships exactly the analyzers the config layer validates against', () => {
    expect(Object.keys(builtInAnalyzers).sort()).toEqual(Object.keys(analyzerDeclarations).sort())
  })
})

describe('declarative constraint comparison', () => {
  it('compares durations across compatible time units', () => {
    expect(compareConstraint(constraint(), '1s')).toEqual({ violated: true })
    expect(compareConstraint(constraint(), '400ms')).toEqual({ violated: false })
    expect(compareConstraint(constraint({ operator: '>=', value: '1s' }), '1500ms')).toEqual({ violated: false })
    expect(compareConstraint(constraint({ operator: '<', value: 1 }), 1)).toEqual({ violated: true })
  })

  it('refuses a comparison it cannot make instead of passing it', () => {
    expect(compareConstraint(constraint({ value: '400px' }), '1s')).toEqual({
      error: "units 's' and 'px' are not comparable",
    })
    expect(compareConstraint(constraint(), 'auto')).toMatchObject({
      error: expect.stringContaining('needs numeric values'),
    })
  })

  it('compares strings with == and lists with in / not-in', () => {
    const text = constraint({ property: 'display', operator: '==', value: 'flex' })
    expect(compareConstraint(text, 'flex')).toEqual({ violated: false })
    expect(compareConstraint(text, 'block')).toEqual({ violated: true })

    const listed = constraint({ property: 'display', operator: 'in', value: ['flex', 'grid'] })
    expect(compareConstraint(listed, 'grid')).toEqual({ violated: false })
    expect(compareConstraint(listed, 'block')).toEqual({ violated: true })

    const notListed = constraint({ property: 'display', operator: 'not-in', value: ['flex'] })
    expect(compareConstraint(notListed, 'flex')).toEqual({ violated: true })
  })
})

describe('structural verification', () => {
  it('turns a violated constraint into a finding about the changed file', () => {
    const outcome = runStructuralChecks({ checks: [declaration()], ...stylesheet('a { animation-duration: 1s; }') })

    expect(outcome.errors).toEqual([])
    expect(outcome.findings).toEqual([
      {
        rule: 'motion.animation-duration',
        target: 'src/app.css',
        severity: 'warning',
        reason: 'animation-duration is 1s in src/app.css, which violates <= 400ms.',
        retryable: true,
        evidence: ['src/app.css'],
      },
    ])
    expect(outcome.facts).toEqual([
      { analyzer: 'css.duration', file: 'src/app.css', property: 'animation-duration', value: '1s' },
    ])
  })

  it('reports no finding when the declared property does not appear', () => {
    const outcome = runStructuralChecks({ checks: [declaration()], ...stylesheet('a { color: red; }') })

    expect(outcome.findings).toEqual([])
    expect(outcome.errors).toEqual([])
  })

  it('fails a constraint whose analyzer is not registered', () => {
    const outcome = runStructuralChecks({
      checks: [declaration({ analyzer: 'css.missing' })],
      ...stylesheet('a { animation-duration: 1s; }'),
    })

    expect(outcome.errors).toEqual(["Check 'motion.animation-duration' names analyzer 'css.missing', which is not registered."])
    expect(outcome.findings).toEqual([])
  })

  it('works with an analyzer and a declaration that come from different places', () => {
    // The engine only knows the id it was handed: this analyzer is not a
    // built-in, which is the seam a preset-provided analyzer would use.
    const thirdParty: Analyzer = ({ files }) => files
      .filter((file) => file.endsWith('.vue'))
      .map((file) => ({ analyzer: 'vue.template-size', file, property: 'template-lines', value: 900 }))

    const outcome = runStructuralChecks({
      checks: [{
        id: 'team.small-components',
        kind: 'constraint',
        verification: 'structural',
        severity: 'error',
        analyzer: 'vue.template-size',
        constraint: { target: 'text', property: 'template-lines', operator: '<=', value: 300 },
      }],
      files: ['src/App.vue'],
      readFile: () => null,
      analyzers: { 'vue.template-size': thirdParty },
    })

    expect(outcome.findings[0]).toMatchObject({ rule: 'team.small-components', severity: 'error', target: 'src/App.vue' })
  })
})

describe('verification documents', () => {
  it('accepts a structural check a project or preset may declare', () => {
    expect(verificationProblems({ checks: [declaration()] })).toEqual([])
  })

  it('names the field when a declaration cannot be evaluated', () => {
    const problems = verificationProblems({
      checks: [
        declaration({ id: 'a.bad-operator', constraint: constraint({ operator: '<', value: ['1s'] }) }),
        declaration({ id: 'a.unknown-analyzer', analyzer: 'ghost' }),
        declaration({ id: 'a.no-analyzer', analyzer: undefined }),
        declaration({ id: 'a.semantic-heuristic', verification: 'heuristic' }),
        declaration({ id: 'a.command', verification: 'command' }),
      ],
    })

    const messages = problems.map(({ field, message }) => `${field}: ${message}`).join('\n')
    expect(messages).toContain('checks.0.constraint.value: checks.0.constraint.value must be a string or a number')
    expect(messages).toContain("checks.1.analyzer: checks.1.analyzer 'ghost' is not implemented")
    expect(messages).toContain('checks.2.analyzer must name the analyzer')
    expect(messages).toContain("checks.3.verification 'heuristic' has no reader")
    expect(messages).toContain('declare it in policy.requiredChecks instead')
  })

  it('rejects a malformed document and an empty declaration list', () => {
    expect(verificationProblems({ checks: [] })).toEqual([
      { field: 'checks', message: 'A verification document must declare at least one check.' },
    ])
    expect(verificationProblems({ checks: [declaration(), declaration()] }).map(({ message }) => message))
      .toContain("Check id 'motion.animation-duration' is declared twice in one document.")
  })

  it('reports a rule id declared twice with different bodies instead of picking one', () => {
    const { checks, conflicts } = mergeChecks([
      { label: '@acme/preset/verification.json', value: { checks: [declaration()] } },
      { label: '.harness/verification.json', value: { checks: [declaration({ severity: 'error' })] } },
    ])

    expect(checks).toHaveLength(1)
    expect(conflicts).toEqual([{
      id: 'motion.animation-duration',
      first: '@acme/preset/verification.json',
      second: '.harness/verification.json',
    }])
  })
})

describe('declared checks in the resolved configuration', () => {
  const project = async (policy: Record<string, unknown>, checks: unknown) => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-checks-'))
    await mkdir(join(root, '.harness'), { recursive: true })
    const write = (name: string, value: unknown) =>
      writeFile(join(root, '.harness', name), `${JSON.stringify(value, null, 2)}\n`)
    await write('harness.json', { version: 1, verification: 'verification.json' })
    await write('verification.json', checks)
    await write('policy.json', policy)
    await write('agents.json', {
      providers: {},
      planner: { mode: 'internal' },
      coder: { mode: 'internal' },
      tester: { mode: 'internal' },
      reviewer: { mode: 'internal' },
    })
    return root
  }

  const policy = (rules?: Record<string, unknown>) => ({
    allowedProductPaths: ['src/'],
    maxIterations: 1,
    protectedPaths: [],
    requiredChecks: [],
    ...(rules ? { rules } : {}),
  })

  it('reads the declared checks and lets policy address them', async () => {
    const root = await project(policy({ 'motion.animation-duration': { severity: 'error' } }), { checks: [declaration()] })

    const loaded = loadHarnessConfig(root)

    expect(loaded.ok, loaded.ok ? '' : JSON.stringify(loaded.errors)).toBe(true)
    if (!loaded.ok) return
    expect(loaded.config.checks).toEqual([{ ...declaration(), source: '.harness/verification.json' }])
    expect(loaded.config.sources.some(({ kind, active }) => kind === 'verification' && active)).toBe(true)
  })

  it('rejects a policy rule for a check nobody declared', async () => {
    const root = await project(policy({ 'motion.animation-duration': { severity: 'error' } }), { checks: [declaration()] })
    await writeFile(
      join(root, '.harness/policy.json'),
      `${JSON.stringify(policy({ 'ghost.rule': { severity: 'error' } }), null, 2)}\n`,
    )

    const loaded = loadHarnessConfig(root)

    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.errors[0]?.message).toContain("unknown rule id 'ghost.rule'")
  })
})

describe('structural findings in the orchestration loop', () => {
  const policy: Policy = { maxIterations: 1, allowedProductPaths: ['src/'] }

  const approved = (payload: AgentCallResult['payload'] = {}): AgentCallResult => ({
    ok: true,
    details: 'approved',
    payload: { approved: true, ...payload },
  })

  const run = (checks: CheckDeclaration[]) => runOrchestrator({
    input: {
      feature: 'Feature',
      objective: 'Objective',
      constraints: [],
      acceptanceCriteria: ['Done'],
      testHints: [],
      maxIterations: 1,
    },
    policy,
    dryRun: false,
    snapshot: () => new Map([['src/app.css', 'a { animation-duration: 1s; }']]),
    changedFiles: () => ['src/app.css'],
    runAgent: async () => approved(),
    runVerification: async () => [{ command: 'pnpm run check', result: 'pass', details: 'ok' }],
    checks,
  })

  it('records analyzer evidence and disposes the finding through the rule', async () => {
    const result = await run([declaration()])

    expect(result.completed).toBe(false)
    expect(result.findings.map(({ rule }) => rule)).toEqual(['motion.animation-duration'])
    expect(result.evidence.find(({ trust }) => trust === 'analyzer-derived')).toMatchObject({
      source: 'css.duration',
      verification: 'structural',
      details: 'src/app.css: animation-duration = 1s',
    })
    // The rule declares `warning`, no reviewer confirmed it, so the disposition
    // is a rejection the coder could repair — with no attempts left, the run
    // ends on the iteration budget rather than pretending it passed.
    expect(result.termination).toBe('max_iterations')
  })

  it('stops the run when a declared constraint cannot be evaluated', async () => {
    const result = await run([declaration({ analyzer: 'css.missing' })])

    expect(result.completed).toBe(false)
    expect(result.termination).toBe('policy_violation')
    expect(result.issues.join(' ')).toContain("names analyzer 'css.missing'")
  })

  it('passes when the declared constraint holds', async () => {
    const result = await runOrchestrator({
      input: {
        feature: 'Feature',
        objective: 'Objective',
        constraints: [],
        acceptanceCriteria: ['Done'],
        testHints: [],
        maxIterations: 1,
      },
      policy,
      dryRun: false,
      snapshot: () => new Map([['src/app.css', 'a { animation-duration: 200ms; }']]),
      changedFiles: () => ['src/app.css'],
      runAgent: async () => approved(),
      runVerification: async () => [{ command: 'pnpm run check', result: 'pass', details: 'ok' }],
      checks: [declaration()],
    })

    expect(result.completed).toBe(true)
    expect(result.findings).toEqual([])
  })
})
