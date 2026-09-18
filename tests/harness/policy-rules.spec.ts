import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  actionFor,
  compileSchema,
  defaultActionFor,
  knownRules,
  policyProblems,
  validatePolicy,
} from '@pedyc/harness-core'
import type { Policy } from '@pedyc/harness-core'

const root = resolve(import.meta.dirname, '../..')
const readJson = (path: string): object => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as object

const policySchema = compileSchema(readJson('schemas/policy.schema.json'))
const harnessSchema = compileSchema(readJson('schemas/harness.schema.json'))

const base: Policy = {
  allowedProductPaths: ['src/'],
  maxIterations: 1,
  protectedPaths: [],
  requiredChecks: [],
}

const fieldsOf = (policy: unknown): Array<string | undefined> =>
  policyProblems(policy).map(({ field }) => field)

describe('severity disposition', () => {
  it('fixes the default mapping from ADR-004 §2.2', () => {
    expect(defaultActionFor('error')).toBe('reject')
    expect(defaultActionFor('warning')).toBe('review')
    expect(defaultActionFor('info')).toBe('report')
  })

  it('resolves the default action for a severity', () => {
    expect(actionFor('error')).toBe('reject')
    expect(actionFor('info')).toBe('report')
  })

  it('lets a project tighten a severity, and applies the tighter action', () => {
    const policy: Policy = { ...base, severityActions: { warning: 'reject', info: 'review' } }
    expect(validatePolicy(policy)).toBeNull()
    expect(actionFor('warning', policy)).toBe('reject')
    expect(actionFor('info', policy)).toBe('review')
  })

  it('refuses to relax a severity', () => {
    const problems = policyProblems({ ...base, severityActions: { error: 'report' } })
    expect(problems.map(({ field }) => field)).toEqual(['severityActions.error'])
    expect(problems[0]?.message).toContain('may only be tightened')
  })

  it('refuses to relax a warning to a report', () => {
    expect(policyProblems({ ...base, severityActions: { warning: 'report' } })[0]?.message)
      .toContain("would relax 'warning' from 'review' to 'report'")
  })

  it('refuses a severity or action that does not exist', () => {
    expect(fieldsOf({ ...base, severityActions: { critical: 'reject' } })).toEqual(['severityActions.critical'])
    expect(fieldsOf({ ...base, severityActions: { info: 'block' } })).toEqual(['severityActions.info'])
  })

  it('refuses a severityActions table that is not an object', () => {
    expect(fieldsOf({ ...base, severityActions: ['report'] })).toEqual(['severityActions'])
  })
})

describe('rule dispositions', () => {
  it('ships no rule ids yet, which is why every id a project writes is unknown', () => {
    expect(knownRules).toEqual([])
  })

  it('rejects a rule id that no rule declares, instead of ignoring it', () => {
    const problems = policyProblems({ ...base, rules: { 'vue/no-options-api': { severity: 'error' } } })
    expect(problems.map(({ field }) => field)).toEqual(['rules.vue/no-options-api'])
    expect(problems[0]?.message).toContain('unknown rule id')
  })

  it('accepts an empty rules table', () => {
    expect(validatePolicy({ ...base, rules: {} })).toBeNull()
  })

  it('refuses a rules table that is not keyed by rule id', () => {
    expect(fieldsOf({ ...base, rules: ['vue/no-options-api'] })).toEqual(['rules'])
  })
})

// Two definitions of one contract drift silently unless something compares them.
// The schema is the published shape; `policyProblems` is what actually runs. These
// samples assert they agree, so adding a field to one and forgetting the other fails
// here instead of in a user's project.
describe('the policy schema and the policy validator agree', () => {
  const samples: Array<[string, unknown]> = [
    ['a minimal policy', base],
    ['the command fields', { ...base, forbiddenCommands: ['npm publish'], allowedAgentCommands: [] }],
    ['onViolation: report', { ...base, onViolation: 'report' }],
    ['a change budget and a timeout', { ...base, maxChangedFiles: 5, agentTimeoutMs: 1000 }],
    ['a tightening severityActions table', { ...base, severityActions: { warning: 'reject' } }],
    ['a missing allowedProductPaths', { ...base, allowedProductPaths: undefined }],
    ['an empty allowedProductPaths', { ...base, allowedProductPaths: [] }],
    ['a maxIterations of zero', { ...base, maxIterations: 0 }],
    ['a non-integer maxIterations', { ...base, maxIterations: 1.5 }],
    ['an unknown onViolation', { ...base, onViolation: 'ignore' }],
    ['an unknown severity key', { ...base, severityActions: { critical: 'reject' } }],
    ['an unknown action', { ...base, severityActions: { info: 'block' } }],
    ['a maxChangedFiles of zero', { ...base, maxChangedFiles: 0 }],
    ['a shape that is not an object', 'not a policy'],
  ]

  it.each(samples)('%s is judged the same way by both', (_name, policy) => {
    expect(policyProblems(policy).length === 0, JSON.stringify(policySchema.errors ?? [])).toBe(policySchema(policy))
  })

  // The one deliberate asymmetry, stated rather than left to be discovered: the
  // schema cannot know which rule ids exist, so it accepts any and the validator
  // rejects every one until a rule implementation declares it.
  it('is deliberately more permissive than the validator about rule ids', () => {
    const policy = { ...base, rules: { 'vue/no-options-api': { severity: 'error' } } }
    expect(policySchema(policy)).toBe(true)
    expect(validatePolicy(policy)).toContain('unknown rule id')
  })
})

describe('the manifest no longer defines rules', () => {
  it('accepts a manifest that declares presets', () => {
    expect(harnessSchema({ version: 1, presets: ['@pedyc/harness-preset-vue'] })).toBe(true)
  })

  it('rejects a manifest that declares rules, because Policy.rules is the only home', () => {
    expect(harnessSchema({ version: 1, rules: ['vue/no-options-api'] })).toBe(false)
  })
})
