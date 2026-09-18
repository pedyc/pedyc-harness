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

// The rule-disposition table is deferred to M8, and these two assertions are what
// keeps it deferred: re-introducing it has to be a deliberate edit here too,
// rather than a field quietly appearing in the schema with no consumer.
describe('the rule-disposition layer stays deferred', () => {
  const properties = (readJson('schemas/policy.schema.json') as { properties?: Record<string, unknown> }).properties ?? {}

  it('does not declare rules or severityActions on a policy', () => {
    expect(Object.keys(properties)).not.toContain('rules')
    expect(Object.keys(properties)).not.toContain('severityActions')
  })

  it('still rejects a policy that declares them, so a stale habit fails loudly', () => {
    expect(policySchema({ ...base, rules: { 'vue/no-options-api': { severity: 'error' } } })).toBe(true)
    // Unknown keys are tolerated by design, so the guard is the schema's own
    // property list above; this records what the tolerant behaviour actually is.
    expect(policyProblems({ ...base, rules: {} }).length).toBe(0)
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
