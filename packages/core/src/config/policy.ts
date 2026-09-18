import { asRecord } from './json.js'
import type { ConfigProblem } from './json.js'
import { actionOrder, defaultActionFor, isTightening, knownRule, severityOrder } from './severity.js'
import type { RuleAction, Severity } from '../contracts/index.js'

const isSeverity = (value: unknown): value is Severity =>
  typeof value === 'string' && severityOrder.includes(value as Severity)

const isAction = (value: unknown): value is RuleAction =>
  typeof value === 'string' && actionOrder.includes(value as RuleAction)

/**
 * Checks the `severityActions` override table.
 *
 * Every entry must be at least as strict as the default it replaces: raising
 * `warning` to `reject` is allowed, lowering `error` to `report` is not. The
 * table is a declaration, so the rule is enforced here rather than at the point
 * a Finding is produced.
 */
const severityActionProblems = (value: unknown): ConfigProblem[] => {
  const table = asRecord(value)
  if (!table) {
    return [{ field: 'severityActions', message: 'Harness policy severityActions must be an object keyed by severity.' }]
  }

  const problems: ConfigProblem[] = []
  for (const [severity, action] of Object.entries(table)) {
    if (!isSeverity(severity)) {
      problems.push({
        field: `severityActions.${severity}`,
        message: `Harness policy severityActions has unknown severity '${severity}'.`,
      })
      continue
    }
    if (!isAction(action)) {
      problems.push({
        field: `severityActions.${severity}`,
        message: `Harness policy severityActions.${severity} must be one of ${actionOrder.join(', ')}.`,
      })
      continue
    }
    if (!isTightening(actionOrder, defaultActionFor(severity), action)) {
      problems.push({
        field: `severityActions.${severity}`,
        message: `Harness policy severityActions.${severity} would relax '${severity}' from '${defaultActionFor(severity)}' to '${action}'; a severity may only be tightened.`,
      })
    }
  }
  return problems
}

/**
 * Checks the `rules` table.
 *
 * An id no rule declares is an error, not a silent no-op: a project that writes
 * one believes a rule is being enforced, and nothing implements it. With no rule
 * implementations in this repository yet (`knownRules` records why), every id is
 * currently unknown, which is the honest answer.
 */
const ruleProblems = (value: unknown): ConfigProblem[] => {
  const table = asRecord(value)
  if (!table) {
    return [{ field: 'rules', message: 'Harness policy rules must be an object keyed by rule id.' }]
  }

  const problems: ConfigProblem[] = []
  for (const [id, setting] of Object.entries(table)) {
    const rule = knownRule(id)
    if (!rule) {
      problems.push({
        field: `rules.${id}`,
        message: `Harness policy rules refers to unknown rule id '${id}'; no rule declares it.`,
      })
      continue
    }

    const entry = asRecord(setting)
    if (!entry) {
      problems.push({ field: `rules.${id}`, message: `Harness policy rules.${id} must be an object.` })
      continue
    }
    const severity = entry.severity === undefined ? rule.severity : entry.severity
    if (!isSeverity(severity)) {
      problems.push({
        field: `rules.${id}.severity`,
        message: `Harness policy rules.${id}.severity must be one of ${severityOrder.join(', ')}.`,
      })
      continue
    }
    if (!isTightening(severityOrder, rule.severity, severity)) {
      problems.push({
        field: `rules.${id}.severity`,
        message: `Harness policy rules.${id}.severity would relax '${id}' from '${rule.severity}' to '${severity}'; a severity may only be tightened.`,
      })
      continue
    }
    if (entry.action === undefined) continue
    if (!isAction(entry.action)) {
      problems.push({
        field: `rules.${id}.action`,
        message: `Harness policy rules.${id}.action must be one of ${actionOrder.join(', ')}.`,
      })
      continue
    }
    const fallback = defaultActionFor(severity)
    if (!isTightening(actionOrder, fallback, entry.action)) {
      problems.push({
        field: `rules.${id}.action`,
        message: `Harness policy rules.${id}.action would relax '${id}' from '${fallback}' to '${entry.action}'; an action may only be tightened.`,
      })
    }
  }
  return problems
}

/**
 * Checks a policy document read from disk or declared inline in the manifest.
 *
 * The document is untrusted JSON, so this takes `unknown` and reports every
 * problem it finds rather than throwing. Validation lives in the config layer
 * because deciding whether a document is acceptable configuration is a
 * different job from deciding whether a specific change is allowed; the latter
 * stays in the runtime policy engine.
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
  if (candidate.rules !== undefined) problems.push(...ruleProblems(candidate.rules))
  if (candidate.severityActions !== undefined) problems.push(...severityActionProblems(candidate.severityActions))
  return problems
}

/** The first problem, or `null` when the document may be treated as a `Policy`. */
export const validatePolicy = (policy: unknown): string | null =>
  policyProblems(policy)[0]?.message ?? null
