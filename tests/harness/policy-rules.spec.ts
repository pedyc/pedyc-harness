import { actionFor, defaultActionFor, knownRules, policyProblems, validatePolicy } from '@pedyc/harness-core'
import type { Policy } from '@pedyc/harness-core'

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
