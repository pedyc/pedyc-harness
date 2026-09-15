import type { CommandPolicy, Policy } from '../contracts/index.js'

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : null

/**
 * Checks a policy document read from disk.
 *
 * The document is untrusted JSON, so this takes `unknown` and reports the first
 * problem as a message instead of throwing. A caller that gets `null` back may
 * treat the document as a `Policy`.
 */
export const validatePolicy = (policy: unknown): string | null => {
  const candidate = asRecord(policy)
  if (!candidate) return 'Policy must be an object.'
  if (!Array.isArray(candidate.allowedProductPaths) || candidate.allowedProductPaths.length === 0) {
    return 'Harness policy must define at least one allowedProductPaths entry.'
  }
  if (!Number.isInteger(candidate.maxIterations) || (candidate.maxIterations as number) < 1) {
    return 'Harness policy maxIterations must be a positive integer.'
  }
  if (!Array.isArray(candidate.protectedPaths)) return 'Harness policy protectedPaths must be an array.'
  if (!Array.isArray(candidate.requiredChecks)) return 'Harness policy requiredChecks must be an array.'
  return null
}

/** Names the files the coder touched that the policy does not allow. */
export const findOutOfScopeChanges = (files: string[], policy: Policy): string[] =>
  files.filter((file) =>
    !policy.allowedProductPaths.some((allowedPath) => file.startsWith(allowedPath)),
  )

/** Whether an agent may run a command. An empty allow list means "no restriction". */
export const isCommandAllowed = (command: string, policy: CommandPolicy): boolean =>
  !policy.allowedAgentCommands?.length || policy.allowedAgentCommands.includes(command)
