import type { AgentRole, Severity } from './policy.js'

/**
 * What a declared rule is for.
 *
 * The kind is not decoration: it fixes the rule's default merge semantics and
 * its default severity, so that a new rule does not restart the "which merge
 * strategy is this field?" discussion. See
 * `docs/decisions/ADR-007-rule-kinds-and-constraints.md` §2.1.
 */
export type RuleKind = 'constraint' | 'preference' | 'instruction' | 'verification'

/**
 * How a declared check is verified.
 *
 * Terminology discipline: `semantic` means "needs a model", nothing else.
 * Extracting a property with an AST is `structural`, not semantic.
 */
export type VerificationKind = 'command' | 'structural' | 'heuristic' | 'semantic'

/**
 * How a declared constraint compares a fact against a value.
 *
 * The set is deliberately small. `in` / `not-in` read a list; the rest compare
 * one value against one value. Anything that needs arithmetic, several files or
 * an understanding of intent is not expressible here and belongs to an analyzer.
 */
export type ConstraintOperator = '<=' | '>=' | '<' | '>' | '==' | 'in' | 'not-in'

/**
 * One executable declaration: "take this property of this kind of artifact and
 * compare it with this value".
 *
 * This is a statement about what to *detect*, not about disposition — Policy
 * owns severity and action. The expression limit is real and is checked rather
 * than papered over: a constraint that cannot be evaluated is an error, never a
 * silent pass. See `docs/decisions/ADR-007-rule-kinds-and-constraints.md` §2.2.
 */
export interface Constraint {
  /** Which artifact the fact comes from, e.g. `css` or `json`. */
  target: 'css' | 'json' | 'text' | 'dependency' | 'path' | string
  /** The property to read, e.g. `animation-duration`. */
  property: string
  operator: ConstraintOperator
  value: string | number | readonly string[]
}

/**
 * What makes a semantic check worth a model call.
 *
 * A trigger is a condition on facts the harness already has, never a weight or a
 * threshold the preset tuned: putting the arithmetic in a preset turns it into
 * an unauditable knob, and a score alone misses the low-signal changes that need
 * reading. See `docs/decisions/ADR-005-semantic-governance.md` §2.3.
 */
export type SemanticTrigger =
  /** Fires when any of these rule ids produced a finding. */
  | { kind: 'rules'; rules: readonly string[] }
  /** Fires when any sub-trigger does. */
  | { kind: 'any'; triggers: readonly SemanticTrigger[] }

/**
 * One rule implementation's declaration.
 *
 * A rule exists because an implementation produces its findings, so the
 * declaration carries no matching logic: it says which id may appear in a
 * finding, how severe that rule is by default, and what the implementation needs
 * to run. A rule id nobody declares cannot be judged; see `evaluateFindings`.
 */
export interface CheckDeclaration {
  id: string
  kind: RuleKind
  verification: VerificationKind
  /** The rule's own default; a policy may only ever tighten it. */
  severity: Severity
  /**
   * The value to compare, when the check is a declarative constraint.
   *
   * A `structural` check either declares a constraint, in which case the engine
   * evaluates it against analyzer facts, or names an `analyzer` whose findings
   * the implementation produces itself.
   */
  constraint?: Constraint
  /** The analyzer whose facts this constraint is evaluated against. */
  analyzer?: string
  /**
   * Path to the prompt of a `semantic` check, inside the declaring package or
   * `.harness/`.
   *
   * Data, not code: it can be diffed, audited and overridden by the project. The
   * declaration never names a model, an endpoint or a credential — the harness
   * schedules the call and `.harness/agents.json` decides who serves it.
   */
  prompt?: string
  /** What makes this `semantic` check worth a call. */
  trigger?: SemanticTrigger
  /** Which provider role serves this `semantic` check; defaults to `reviewer`. */
  role?: AgentRole
}

/**
 * A declaration together with where it came from.
 *
 * Provenance is part of the record even before M17 composes configuration: an
 * error that says "unknown rule id" is not actionable unless the reader can see
 * which document declares the rules that do exist.
 */
export interface ResolvedCheck extends CheckDeclaration {
  /** A package name, a project-relative document path, or `built-in`. */
  source: string
  /**
   * The prompt text, read once by the config layer.
   *
   * The declaration carries a path so it can be audited next to the document
   * that names it; resolving it here keeps the runtime free of file reads outside
   * the workspace it was given.
   */
  promptText?: string
}
