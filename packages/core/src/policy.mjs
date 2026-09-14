export const validatePolicy = (policy) => {
  if (!policy || typeof policy !== 'object') return 'Policy must be an object.'
  if (!Array.isArray(policy.allowedProductPaths) || policy.allowedProductPaths.length === 0) {
    return 'Harness policy must define at least one allowedProductPaths entry.'
  }
  if (!Number.isInteger(policy.maxIterations) || policy.maxIterations < 1) {
    return 'Harness policy maxIterations must be a positive integer.'
  }
  if (!Array.isArray(policy.protectedPaths)) return 'Harness policy protectedPaths must be an array.'
  if (!Array.isArray(policy.requiredChecks)) return 'Harness policy requiredChecks must be an array.'
  return null
}

export const findOutOfScopeChanges = (files, policy) => files.filter((file) =>
  !policy.allowedProductPaths.some((allowedPath) => file.startsWith(allowedPath)),
)

export const isCommandAllowed = (command, policy) =>
  !policy.allowedAgentCommands?.length || policy.allowedAgentCommands.includes(command)
