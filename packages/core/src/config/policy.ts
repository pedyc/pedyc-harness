import { asRecord } from './json.js'
import type { ConfigProblem } from './json.js'

/**
 * Checks a policy document read from disk or declared inline in the manifest.
 *
 * The document is untrusted JSON, so this takes `unknown` and reports every
 * problem it finds rather than throwing. Validation lives in the config layer
 * because deciding whether a document is acceptable configuration is a
 * different job from deciding whether a specific change is allowed; the latter
 * stays in the runtime policy engine.
 */
export const policyProblems = (policy: unknown): ConfigProblem[] => {
  const candidate = asRecord(policy)
  if (!candidate) return [{ message: 'Policy must be an object.' }]

  const problems: ConfigProblem[] = []
  if (!Array.isArray(candidate.allowedProductPaths) || candidate.allowedProductPaths.length === 0) {
    problems.push({
      field: 'allowedProductPaths',
      message: 'Harness policy must define at least one allowedProductPaths entry.',
    })
  }
  if (!Number.isInteger(candidate.maxIterations) || (candidate.maxIterations as number) < 1) {
    problems.push({ field: 'maxIterations', message: 'Harness policy maxIterations must be a positive integer.' })
  }
  if (!Array.isArray(candidate.protectedPaths)) {
    problems.push({ field: 'protectedPaths', message: 'Harness policy protectedPaths must be an array.' })
  }
  if (!Array.isArray(candidate.requiredChecks)) {
    problems.push({ field: 'requiredChecks', message: 'Harness policy requiredChecks must be an array.' })
  }
  return problems
}

/** The first problem, or `null` when the document may be treated as a `Policy`. */
export const validatePolicy = (policy: unknown): string | null =>
  policyProblems(policy)[0]?.message ?? null
