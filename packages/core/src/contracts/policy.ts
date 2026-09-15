/** How a stage runs: by the built-in stage or by an external provider. */
export type AgentMode = 'internal' | 'external'

/** The four stages of the fixed Planner → Coder → Tester → Reviewer pipeline. */
export type AgentRole = 'planner' | 'coder' | 'tester' | 'reviewer'

/**
 * The part of the policy that bounds which commands an agent may run.
 *
 * The provider runner consults nothing else, so it accepts this narrower type
 * rather than a whole policy.
 */
export interface CommandPolicy {
  allowedAgentCommands?: string[]
}

/**
 * A project's `.harness/policy.json`.
 *
 * Only `allowedProductPaths` is required: `validatePolicy` rejects a policy
 * without it, and out-of-scope detection dereferences it directly. Every other
 * field stays optional because the document is untrusted JSON and callers fall
 * back to defaults.
 */
export interface Policy extends CommandPolicy {
  allowedProductPaths: string[]
  maxIterations?: number
  protectedPaths?: string[]
  requiredChecks?: string[]
  forbiddenCommands?: string[]
  agentTimeoutMs?: number
}
