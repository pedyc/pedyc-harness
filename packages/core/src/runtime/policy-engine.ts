import type { CommandPolicy, Policy } from '../contracts/index.js'

// Deciding whether a document is acceptable configuration moved to the config
// layer, but `./policy` is a published subpath, so the name stays exported here.
export { validatePolicy } from '../config/policy.js'

/** Names the files the coder touched that the policy does not allow. */
export const findOutOfScopeChanges = (files: string[], policy: Policy): string[] =>
  files.filter((file) =>
    !policy.allowedProductPaths.some((allowedPath) => file.startsWith(allowedPath)),
  )

/** Whether an agent may run a command. An empty allow list means "no restriction". */
export const isCommandAllowed = (command: string, policy: CommandPolicy): boolean =>
  !policy.allowedAgentCommands?.length || policy.allowedAgentCommands.includes(command)
