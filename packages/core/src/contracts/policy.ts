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

/** Which of the three judgment families produced a violation. */
export type ViolationKind = 'file' | 'command' | 'rule'

/**
 * How a project wants a policy violation dispositioned.
 *
 * `fail` escalates a rejection into a failed run; `report` records it and leaves
 * the run's ending to whatever else stops it. Neither value weakens prevention:
 * a refused command is never started under either setting, because this controls
 * the disposition of a violation, not whether the harness controls the side
 * effect. See `docs/decisions/ADR-006-run-lifecycle.md` §2.3.
 */
export type ViolationMode = 'fail' | 'report'

/**
 * One refusal.
 *
 * Files, commands and registered rules all report in this shape so that a single
 * evaluator can decide them and a single consumer can act on the result — the
 * "unified Policy Evaluator" of
 * `docs/decisions/ADR-004-policy-severity-rules.md` §2.4. The point is not more
 * rules, it is that the three families cannot drift apart.
 *
 * `rule` is a stable id. The built-in rules use the name of the policy field they
 * enforce, which is also what lets a registered checker's id be addressed the
 * same way. `action` is the *effective* disposition, already reconciled with the
 * project's `onViolation`, so consumers never re-derive it.
 */
export interface PolicyViolation {
  kind: ViolationKind
  rule: string
  target: string
  severity: Severity
  action: RuleAction
  reason: string
  retryable: boolean
}

/** The verdict for one judgment family, or for a whole evaluation. */
export interface PolicyDecision {
  allowed: boolean
  violations: PolicyViolation[]
}

/**
 * The part of the policy that bounds which commands an agent may run.
 *
 * The provider runner consults nothing else, so it accepts this narrower type
 * rather than a whole policy.
 */
export interface CommandPolicy {
  allowedAgentCommands?: string[]
  forbiddenCommands?: string[]
}

/**
 * A command policy together with the disposition a violation receives.
 *
 * The provider runner needs both: it must refuse the command, and it must label
 * the refusal so the orchestrator can tell an escalated rejection from a
 * reported one.
 */
export interface CommandPolicyContext extends CommandPolicy {
  onViolation?: ViolationMode
}

/**
 * How a project overrides one declared rule's disposition.
 *
 * Both fields may only ever *tighten* what the rule declared: a project can
 * raise `warning` to `error`, or `review` to `reject`, but it cannot lower a
 * rule's severity or turn a rejection into a report. Safety semantics belong to
 * the layer that declared them. See
 * `docs/decisions/ADR-004-policy-severity-rules.md` §2.5.
 */
export interface RuleSetting {
  severity?: Severity
  action?: RuleAction
}

/**
 * A project's `.harness/policy.json`.
 *
 * The fields group into four jobs, which the documentation uses as its outline:
 * **scope** (`allowedProductPaths`, `protectedPaths`), **command constraints**
 * (`allowedAgentCommands`, `forbiddenCommands`), **execution constraints**
 * (`requiredChecks`, `maxIterations`, `agentTimeoutMs`, `maxChangedFiles`) and
 * **enforcement** (`onViolation`, `rules`, `severityActions`). The grouping is
 * documentation, not structure: the document stays flat so a field name never
 * depends on which group it is in.
 *
 * Only `allowedProductPaths` is required: `validatePolicy` rejects a policy
 * without it, and out-of-scope detection dereferences it directly. Every other
 * field stays optional because the document is untrusted JSON and callers fall
 * back to defaults.
 *
 * `rules` addresses rule ids that an implementation declares — built-in checks
 * today, Preset-registered ones with M21. A key nobody declares is rejected
 * rather than silently ignored, because an override for a rule that does not
 * exist reads exactly like an enforced rule.
 */
export interface Policy extends CommandPolicy {
  allowedProductPaths: string[]
  maxIterations?: number
  protectedPaths?: string[]
  requiredChecks?: string[]
  agentTimeoutMs?: number
  /**
   * The most files one coder iteration may change.
   *
   * Measured per iteration, not cumulatively: the point is the blast radius of a
   * single change, and a cumulative count would flag a run for merely taking
   * several iterations.
   */
  maxChangedFiles?: number
  onViolation?: ViolationMode
  /** Per-rule severity and action overrides; tightening only. */
  rules?: Record<string, RuleSetting>
  /** Overrides the default `severity → action` mapping; tightening only. */
  severityActions?: Partial<Record<Severity, RuleAction>>
  /**
   * The most semantic review calls this run may make.
   *
   * Absent means no budget. The *arithmetic* of cost (tokens, model choice,
   * thresholds) belongs to `docs/tradeoffs/成本权衡.md`; what this bounds is the
   * harness's own dispatch count, which is what makes running out observable.
   */
  maxSemanticCalls?: number
}
