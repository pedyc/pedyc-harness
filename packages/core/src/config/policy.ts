import { asRecord } from './json.js'
import type { ConfigProblem } from './json.js'
import {
  actionAtLeast,
  defaultActionFor,
  knownRule,
  severityAtLeast,
} from './rules.js'
import type { ResolvedCheck } from '../contracts/index.js'

const SEVERITIES = ['error', 'warning', 'info']
const ACTIONS = ['reject', 'review', 'report']

const isSeverity = (value: unknown): value is 'error' | 'warning' | 'info' =>
  typeof value === 'string' && SEVERITIES.includes(value)

const isAction = (value: unknown): value is 'reject' | 'review' | 'report' =>
  typeof value === 'string' && ACTIONS.includes(value)

/**
 * Checks one `policy.rules` entry.
 *
 * Two things are refused here rather than at run time: a key no implementation
 * declares, and a value that loosens the rule's own severity or action.
 * Tightening is a project's prerogative; loosening a safety semantic is not.
 */
const ruleSettingProblems = (
  id: string,
  setting: unknown,
  checks: readonly ResolvedCheck[],
): ConfigProblem[] => {
  const field = `rules.${id}`
  const declaration = knownRule(id, checks)
  if (declaration === null) {
    return [{ field, message: `Harness policy rules refers to unknown rule id '${id}'; no implementation declares it.` }]
  }
  const candidate = asRecord(setting)
  if (!candidate) return [{ field, message: `Harness policy rules entry '${id}' must be an object.` }]

  const problems: ConfigProblem[] = []
  for (const key of Object.keys(candidate)) {
    if (key !== 'severity' && key !== 'action') {
      problems.push({ field: `${field}.${key}`, message: `Harness policy rules entry '${id}' has no field '${key}'.` })
    }
  }
  const { severity, action } = candidate
  if (severity !== undefined) {
    if (!isSeverity(severity)) {
      problems.push({ field: `${field}.severity`, message: `Harness policy rules.${id}.severity must be one of ${SEVERITIES.join(', ')}.` })
    } else if (!severityAtLeast(severity, declaration.severity)) {
      problems.push({
        field: `${field}.severity`,
        message: `Harness policy cannot loosen rule '${id}' from '${declaration.severity}' to '${severity}'.`,
      })
    }
  }
  if (action !== undefined) {
    const floor = defaultActionFor(declaration.severity)
    if (!isAction(action)) {
      problems.push({ field: `${field}.action`, message: `Harness policy rules.${id}.action must be one of ${ACTIONS.join(', ')}.` })
    } else if (!actionAtLeast(action, floor)) {
      problems.push({
        field: `${field}.action`,
        message: `Harness policy cannot loosen rule '${id}' from '${floor}' to '${action}'.`,
      })
    }
  }
  return problems
}

/** Checks the `severityActions` table: shape, then the no-loosening rule. */
const severityActionProblems = (value: unknown): ConfigProblem[] => {
  const candidate = asRecord(value)
  if (!candidate) return [{ field: 'severityActions', message: 'Harness policy severityActions must be an object.' }]

  const problems: ConfigProblem[] = []
  for (const [severity, action] of Object.entries(candidate)) {
    if (!isSeverity(severity)) {
      problems.push({ field: `severityActions.${severity}`, message: `Harness policy severityActions has no severity '${severity}'.` })
      continue
    }
    const floor = defaultActionFor(severity)
    if (!isAction(action)) {
      problems.push({ field: `severityActions.${severity}`, message: `Harness policy severityActions.${severity} must be one of ${ACTIONS.join(', ')}.` })
      continue
    }
    if (!actionAtLeast(action, floor)) {
      problems.push({
        field: `severityActions.${severity}`,
        message: `Harness policy cannot loosen the default disposition of '${severity}' from '${floor}' to '${action}'.`,
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
 *
 * Every field checked here is a field something reads. That is deliberate: a
 * schema-level field nobody consumes is how `protectedPaths` and
 * `forbiddenCommands` came to be accepted for two milestones without doing
 * anything, so a new field arrives with its consumer or not at all.
 *
 * `checks` is the rule set this run actually has (built-ins plus every declared
 * check). It is an argument rather than an import because a `verification`
 * document a preset declares is part of what makes a `policy.rules` key legal.
 */
export const policyProblems = (policy: unknown, checks: readonly ResolvedCheck[] = []): ConfigProblem[] => {
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
  if (
    candidate.agentTimeoutMs !== undefined
    && (!Number.isInteger(candidate.agentTimeoutMs) || (candidate.agentTimeoutMs as number) < 1)
  ) {
    problems.push({ field: 'agentTimeoutMs', message: 'Harness policy agentTimeoutMs must be a positive integer.' })
  }
  if (
    candidate.maxChangedFiles !== undefined
    && (!Number.isInteger(candidate.maxChangedFiles) || (candidate.maxChangedFiles as number) < 1)
  ) {
    problems.push({ field: 'maxChangedFiles', message: 'Harness policy maxChangedFiles must be a positive integer.' })
  }
  if (candidate.rules !== undefined) {
    const rules = asRecord(candidate.rules)
    if (!rules) {
      problems.push({ field: 'rules', message: 'Harness policy rules must be an object.' })
    } else {
      for (const [id, setting] of Object.entries(rules)) {
        problems.push(...ruleSettingProblems(id, setting, checks))
      }
    }
  }
  if (candidate.severityActions !== undefined) {
    problems.push(...severityActionProblems(candidate.severityActions))
  }
  if (
    candidate.maxSemanticCalls !== undefined
    && (!Number.isInteger(candidate.maxSemanticCalls) || (candidate.maxSemanticCalls as number) < 1)
  ) {
    problems.push({
      field: 'maxSemanticCalls',
      message: 'Harness policy maxSemanticCalls must be a positive integer.',
    })
  }
  return problems
}

/** The first problem, or `null` when the document may be treated as a `Policy`. */
export const validatePolicy = (policy: unknown, checks: readonly ResolvedCheck[] = []): string | null =>
  policyProblems(policy, checks)[0]?.message ?? null
