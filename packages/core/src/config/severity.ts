import type { RuleAction, Severity } from '../contracts/index.js'

/**
 * Severity handling, shared by the config layer and the runtime.
 *
 * Two jobs live here so they cannot disagree: validating that a project's
 * declarations only ever *tighten* a rule, and resolving the action a severity
 * maps to at run time. See `docs/decisions/ADR-004-policy-severity-rules.md`.
 */

/** Ordered from the least to the most serious. Tightening means moving up. */
export const severityOrder: readonly Severity[] = ['info', 'warning', 'error']

/** Ordered from the least to the most severe disposition. Tightening means up. */
export const actionOrder: readonly RuleAction[] = ['report', 'review', 'reject']

/** The mapping ADR-004 §2.2 fixes, before a project overrides it. */
export const defaultActionFor = (severity: Severity): RuleAction => {
  if (severity === 'error') return 'reject'
  if (severity === 'warning') return 'review'
  return 'report'
}

/** Whether moving from `from` to `to` is tighter, or at least not looser. */
export const isTightening = <T extends string>(order: readonly T[], from: T, to: T): boolean =>
  order.indexOf(to) >= order.indexOf(from)

/**
 * A rule a project is allowed to address by id.
 *
 * A rule declares its own default severity; `policy.rules` may only raise it.
 */
export interface KnownRule {
  id: string
  severity: Severity
}

/**
 * The rule ids `policy.rules` may name.
 *
 * **Empty on purpose.** Producing a Finding is the job of a rule *implementation*,
 * and this repository ships none yet: structural analyzers arrive with M8, and
 * Preset-registered rules with M21. Until a rule declares itself here, every id a
 * project writes is unknown — which is the behaviour M7 asks for, since silently
 * ignoring an unknown id is how a project comes to believe a rule is enforced
 * when nothing implements it.
 */
export const knownRules: readonly KnownRule[] = []

/** The declaration for `id`, or `null` when no rule claims it. */
export const knownRule = (id: string): KnownRule | null =>
  knownRules.find((rule) => rule.id === id) ?? null

/**
 * The action a severity resolves to, after the project's override table.
 *
 * This is the disposition half of ADR-004: a rule reports what it found and how
 * serious that is, and this decides what happens next. No rule implementation
 * ships in this version, so nothing calls it from the pipeline yet — it is the
 * contract the first checker will use, and it is exercised by tests rather than
 * left to be rediscovered.
 */
export const actionFor = (
  severity: Severity,
  policy: { severityActions?: Partial<Record<Severity, RuleAction>> } = {},
): RuleAction => policy.severityActions?.[severity] ?? defaultActionFor(severity)
