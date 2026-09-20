import type { CheckDeclaration, RuleAction, Severity } from '../contracts/index.js'
import { analyzerDeclarations } from './analyzers.js'

/**
 * The rules this build implements.
 *
 * A rule id may only appear in a finding, or as a key of `policy.rules`, if a
 * declaration exists here or in a `verification` document a preset or the
 * project declares — an override for a rule nobody implements reads exactly like
 * an enforced rule, which is the failure this table exists to prevent.
 *
 * The three families of the unified evaluator are all represented: the file and
 * command rules of M7, the change budget, and the harness's own consistency
 * check, which is the first rule whose findings a reviewer is asked to confirm.
 */
export const builtInRules: Readonly<Record<string, CheckDeclaration>> = Object.freeze({
  protectedPaths: { id: 'protectedPaths', kind: 'constraint', verification: 'structural', severity: 'error' },
  allowedProductPaths: { id: 'allowedProductPaths', kind: 'constraint', verification: 'structural', severity: 'error' },
  forbiddenCommands: { id: 'forbiddenCommands', kind: 'constraint', verification: 'command', severity: 'error' },
  allowedAgentCommands: { id: 'allowedAgentCommands', kind: 'constraint', verification: 'command', severity: 'error' },
  maxChangedFiles: { id: 'maxChangedFiles', kind: 'constraint', verification: 'structural', severity: 'error' },
  // A claimed change that the diff does not contain is suspicious rather than
  // proven harmful, so it defaults to `warning`: the reviewer has to confirm it,
  // and a project may tighten it to `error`.
  'change.claimed-file-missing': {
    id: 'change.claimed-file-missing',
    kind: 'verification',
    verification: 'structural',
    severity: 'warning',
  },
})

/**
 * The rule set a run actually has: built-ins plus every declared check.
 *
 * A declared check whose id collides with a built-in is rejected during config
 * resolution, so the spread below cannot silently replace an implementation.
 */
export const effectiveRules = (
  checks: readonly CheckDeclaration[] = [],
): Record<string, CheckDeclaration> => {
  const rules: Record<string, CheckDeclaration> = { ...builtInRules }
  for (const check of checks) rules[check.id] = check
  return rules
}

/** Whether an implementation declares this rule id. */
export const isKnownRule = (rule: string, checks: readonly CheckDeclaration[] = []): boolean =>
  effectiveRules(checks)[rule] !== undefined

/** The declaration for a rule, or `null` when nobody implements it. */
export const knownRule = (
  rule: string,
  checks: readonly CheckDeclaration[] = [],
): CheckDeclaration | null => effectiveRules(checks)[rule] ?? null

/**
 * Whether an analyzer id is one this build can run.
 *
 * Analyzer implementations live in the runtime layer while their ids are part of
 * the declaration contract, so the metadata a config check needs sits beside
 * `builtInRules` and the runtime asserts the two agree.
 */
export const isKnownAnalyzer = (analyzer: string): boolean =>
  analyzerDeclarations[analyzer] !== undefined

/** The artifact kind an analyzer produces facts for, or `null` if unknown. */
export const analyzerTarget = (analyzer: string): string | null =>
  analyzerDeclarations[analyzer]?.target ?? null

const severityRank: Record<Severity, number> = { error: 3, warning: 2, info: 1 }
const actionRank: Record<RuleAction, number> = { reject: 3, review: 2, report: 1 }

/** The stricter of two severities; ties keep the first. */
export const stricterSeverity = (left: Severity, right: Severity): Severity =>
  severityRank[left] >= severityRank[right] ? left : right

/** The stricter of two actions; ties keep the first. */
export const stricterAction = (left: RuleAction, right: RuleAction): RuleAction =>
  actionRank[left] >= actionRank[right] ? left : right

/** Whether `candidate` is at least as strict as `floor`. */
export const severityAtLeast = (candidate: Severity, floor: Severity): boolean =>
  severityRank[candidate] >= severityRank[floor]

/** Whether `candidate` is at least as strict as `floor`. */
export const actionAtLeast = (candidate: RuleAction, floor: RuleAction): boolean =>
  actionRank[candidate] >= actionRank[floor]

/**
 * The default disposition of a severity.
 *
 * `error → reject`, `warning → review`, `info → report`. A project may override
 * it through `severityActions`, but only in the stricter direction, so this
 * mapping is a floor rather than a starting point. See
 * `docs/decisions/ADR-004-policy-severity-rules.md` §2.5.
 */
export const defaultActionFor = (severity: Severity): RuleAction => {
  if (severity === 'error') return 'reject'
  if (severity === 'warning') return 'review'
  return 'report'
}
