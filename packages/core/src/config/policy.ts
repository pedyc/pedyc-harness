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
 *
 * Every field checked here is a field something reads. That is deliberate: a
 * schema-level field nobody consumes is how `protectedPaths` and
 * `forbiddenCommands` came to be accepted for two milestones without doing
 * anything, so a new field arrives with its consumer or not at all.
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
  // The command fields are enforced at run time, so a malformed one must fail
  // here rather than silently enforce nothing. `includes` on a string would even
  // pass by substring, which is a hole rather than a mistake.
  if (candidate.forbiddenCommands !== undefined && !Array.isArray(candidate.forbiddenCommands)) {
    problems.push({ field: 'forbiddenCommands', message: 'Harness policy forbiddenCommands must be an array.' })
  }
  if (candidate.allowedAgentCommands !== undefined && !Array.isArray(candidate.allowedAgentCommands)) {
    problems.push({ field: 'allowedAgentCommands', message: 'Harness policy allowedAgentCommands must be an array.' })
  }
  if (candidate.onViolation !== undefined && candidate.onViolation !== 'fail' && candidate.onViolation !== 'report') {
    problems.push({ field: 'onViolation', message: "Harness policy onViolation must be 'fail' or 'report'." })
  }
  if (
    candidate.agentTimeoutMs !== undefined
    && (!Number.isInteger(candidate.agentTimeoutMs) || (candidate.agentTimeoutMs as number) < 1)
  ) {
    problems.push({ field: 'agentTimeoutMs', message: 'Harness policy agentTimeoutMs must be a positive integer.' })
  }
  if (
    candidate.maxChangedFiles !== undefined
    && (!Number.isInteger(candidate.maxChangedFiles) || (candidate.maxChangedFiles as number) < 1)
  ) {
    problems.push({ field: 'maxChangedFiles', message: 'Harness policy maxChangedFiles must be a positive integer.' })
  }
  return problems
}

/** The first problem, or `null` when the document may be treated as a `Policy`. */
export const validatePolicy = (policy: unknown): string | null =>
  policyProblems(policy)[0]?.message ?? null
