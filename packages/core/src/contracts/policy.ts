/** How a stage runs: by the built-in stage or by an external provider. */
export type AgentMode = 'internal' | 'external'

/** The four stages of the fixed Planner → Coder → Tester → Reviewer pipeline. */
export type AgentRole = 'planner' | 'coder' | 'tester' | 'reviewer'

/**
 * How serious a judgment is.
 *
 * A rule declares its own default severity; a policy may only ever *tighten* it.
 * See `docs/decisions/ADR-004-policy-severity-rules.md` §2.5.
 */
export type Severity = 'error' | 'warning' | 'info'

/** What the harness does once a judgment's severity is known. */
export type RuleAction = 'reject' | 'review' | 'report'

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
