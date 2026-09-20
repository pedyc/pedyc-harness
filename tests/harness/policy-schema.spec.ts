import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileSchema, policyProblems } from '@pedyc/harness-core'
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

// Two definitions of one contract drift silently unless something compares them.
// The schema is the published shape; `policyProblems` is what actually runs.
// These samples assert they agree, so adding a field to one and forgetting the
// other fails here instead of in a user's project.
describe('the policy schema and the policy validator agree', () => {
  const samples: Array<[string, unknown]> = [
    ['a minimal policy', base],
    ['the command fields', { ...base, forbiddenCommands: ['npm publish'], allowedAgentCommands: [] }],
    ['onViolation: report', { ...base, onViolation: 'report' }],
    ['a change budget and a timeout', { ...base, maxChangedFiles: 5, agentTimeoutMs: 1000 }],
    ['a missing allowedProductPaths', { ...base, allowedProductPaths: undefined }],
    ['an empty allowedProductPaths', { ...base, allowedProductPaths: [] }],
    ['a maxIterations of zero', { ...base, maxIterations: 0 }],
    ['a non-integer maxIterations', { ...base, maxIterations: 1.5 }],
    ['an unknown onViolation', { ...base, onViolation: 'ignore' }],
    ['a maxChangedFiles of zero', { ...base, maxChangedFiles: 0 }],
    ['a string where an array belongs', { ...base, forbiddenCommands: 'npm publish' }],
    ['a shape that is not an object', 'not a policy'],
  ]

  it.each(samples)('%s is judged the same way by both', (_name, policy) => {
    expect(policyProblems(policy).length === 0, JSON.stringify(policySchema.errors ?? [])).toBe(policySchema(policy))
  })
})

// Every field of the disposition layer is now consumed, so the samples include
// it: the schema describes the shape, `policyProblems` also rejects an override
// that loosens a declared rule, and both sides are asserted to agree on shape.
describe('the rule-disposition layer', () => {
  const tightening: Array<[string, unknown]> = [
    ['no rule overrides at all', { ...base, rules: {} }],
    ['a rule raised from warning to error', { ...base, rules: { 'change.claimed-file-missing': { severity: 'error' } } }],
    ['a rule action raised from review to reject', { ...base, rules: { 'change.claimed-file-missing': { action: 'reject' } } }],
    ['a warning raised to reject for the whole table', { ...base, severityActions: { warning: 'reject' } }],
    ['an info kept at report', { ...base, severityActions: { info: 'report' } }],
    ['a rules value that is not an object', { ...base, rules: { 'change.claimed-file-missing': 'error' } }],
    ['a rules entry with an unknown field', { ...base, rules: { 'change.claimed-file-missing': { level: 'error' } } }],
    ['an unknown severity', { ...base, rules: { 'change.claimed-file-missing': { severity: 'fatal' } } }],
    ['an unknown severityActions key', { ...base, severityActions: { fatal: 'reject' } }],
    ['a severityActions value that is not an action', { ...base, severityActions: { warning: 'ignore' } }],
  ]

  it.each(tightening)('%s is judged the same way by both', (_name, policy) => {
    expect(policyProblems(policy).length === 0, JSON.stringify(policySchema.errors ?? [])).toBe(policySchema(policy))
  })

  it('rejects a rule id no implementation declares', () => {
    const problems = policyProblems({ ...base, rules: { 'vue/no-options-api': { severity: 'error' } } })

    expect(problems).toHaveLength(1)
    expect(problems[0]?.field).toBe('rules.vue/no-options-api')
    expect(problems[0]?.message).toContain('unknown rule id')
  })

  it('refuses to loosen a rule, because safety semantics only ever tighten', () => {
    const loosened = policyProblems({
      ...base,
      rules: { 'change.claimed-file-missing': { severity: 'info', action: 'report' } },
    })

    expect(loosened.map(({ message }) => message).join(' ')).toContain("cannot loosen rule 'change.claimed-file-missing' from 'warning' to 'info'")
    // The action floor comes from the severity the *rule* declared, not from the
    // severity the project asked for, so lowering the severity cannot smuggle a
    // looser action through either.
    expect(loosened.map(({ message }) => message).join(' ')).toContain("cannot loosen rule 'change.claimed-file-missing' from 'review' to 'report'")
  })

  it('refuses to loosen the default disposition of a severity', () => {
    const loosened = policyProblems({ ...base, severityActions: { error: 'report' } })

    expect(loosened).toEqual([
      {
        field: 'severityActions.error',
        message: "Harness policy cannot loosen the default disposition of 'error' from 'reject' to 'report'.",
      },
    ])
  })
})

describe('the manifest never defined rules', () => {
  it('accepts a manifest that declares presets', () => {
    expect(harnessSchema({ version: 1, presets: ['@pedyc/harness-preset-vue'] })).toBe(true)
  })

  it('rejects a manifest that declares rules, because there is no manifest-level home', () => {
    expect(harnessSchema({ version: 1, rules: ['vue/no-options-api'] })).toBe(false)
  })
})
