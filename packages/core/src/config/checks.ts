import type {
  CheckDeclaration,
  Constraint,
  ResolvedCheck,
  Severity,
  VerificationKind,
} from '../contracts/index.js'
import { asRecord } from './json.js'
import type { ConfigProblem } from './json.js'
import { analyzerDeclarations } from './analyzers.js'
import { analyzerTarget, isKnownAnalyzer } from './rules.js'

const KINDS = ['constraint', 'preference', 'instruction', 'verification']
const VERIFICATIONS: VerificationKind[] = ['command', 'structural', 'heuristic', 'semantic']
const OPERATORS = ['<=', '>=', '<', '>', '==', 'in', 'not-in']
const SEVERITIES = ['error', 'warning', 'info']
const ROLES = ['planner', 'coder', 'tester', 'reviewer']

/** A rule id is a stable, dotted identifier: no whitespace, no path characters. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)

/**
 * Checks one `constraint` object.
 *
 * The expression limit of a declarative constraint is enforced here rather than
 * discovered at run time: "compare a property with a value" is the whole of what
 * this shape can express, and anything outside it is reported as a problem
 * instead of silently never firing. See
 * `docs/decisions/ADR-007-rule-kinds-and-constraints.md` §2.2.
 */
const constraintProblems = (value: unknown, field: string): { constraint?: Constraint; problems: ConfigProblem[] } => {
  const candidate = asRecord(value)
  if (!candidate) return { problems: [{ field, message: `${field} must be an object.` }] }

  const problems: ConfigProblem[] = []
  for (const key of Object.keys(candidate)) {
    if (!['target', 'property', 'operator', 'value'].includes(key)) {
      problems.push({ field: `${field}.${key}`, message: `${field} has no field '${key}'.` })
    }
  }
  if (!isNonEmptyString(candidate.target)) {
    problems.push({ field: `${field}.target`, message: `${field}.target must be a non-empty string.` })
  }
  if (!isNonEmptyString(candidate.property)) {
    problems.push({ field: `${field}.property`, message: `${field}.property must be a non-empty string.` })
  }
  if (!oneOf(candidate.operator, OPERATORS)) {
    problems.push({ field: `${field}.operator`, message: `${field}.operator must be one of ${OPERATORS.join(', ')}.` })
  }
  const operator = candidate.operator
  const isListOperator = operator === 'in' || operator === 'not-in'
  if (isListOperator) {
    // `in` / `not-in` compare one value against a list; anything else cannot be
    // evaluated, and guessing would turn a declarative constraint into a rule
    // engine nobody declared.
    if (!Array.isArray(candidate.value) || !candidate.value.every(isNonEmptyString)) {
      problems.push({
        field: `${field}.value`,
        message: `${field}.value must be an array of non-empty strings when the operator is '${String(operator)}'.`,
      })
    }
  } else if (typeof candidate.value !== 'string' && typeof candidate.value !== 'number') {
    problems.push({
      field: `${field}.value`,
      message: `${field}.value must be a string or a number when the operator is '${String(operator)}'.`,
    })
  } else if (typeof candidate.value === 'string' && candidate.value.trim().length === 0) {
    problems.push({ field: `${field}.value`, message: `${field}.value must not be empty.` })
  }

  return problems.length > 0 ? { problems } : { constraint: candidate as unknown as Constraint, problems }
}

/**
 * Checks one `trigger` object.
 *
 * Only conditions on facts the harness already has are accepted. A `score`
 * trigger would need a heuristic engine this build does not have, and accepting
 * it would mean a check that silently never fires. See
 * `docs/decisions/ADR-005-semantic-governance.md` §2.3.
 */
const triggerProblems = (value: unknown, field: string): ConfigProblem[] => {
  const candidate = asRecord(value)
  if (!candidate) return [{ field, message: `${field} must be an object.` }]

  if (candidate.kind === 'rules') {
    if (!Array.isArray(candidate.rules) || candidate.rules.length === 0 || !candidate.rules.every(isNonEmptyString)) {
      return [{ field: `${field}.rules`, message: `${field}.rules must be a non-empty array of rule ids.` }]
    }
    return []
  }
  if (candidate.kind === 'any') {
    if (!Array.isArray(candidate.triggers) || candidate.triggers.length === 0) {
      return [{ field: `${field}.triggers`, message: `${field}.triggers must be a non-empty array of triggers.` }]
    }
    return candidate.triggers.flatMap((entry, index) => triggerProblems(entry, `${field}.triggers.${index}`))
  }
  if (candidate.kind === 'score') {
    return [{
      field: `${field}.kind`,
      message: `${field}.kind 'score' has no reader: no heuristic engine in this build produces a score to compare.`,
    }]
  }
  return [{ field: `${field}.kind`, message: `${field}.kind must be 'rules' or 'any'.` }]
}

/** Checks one entry of a `checks` array. */
const checkProblems = (value: unknown, index: number): { check?: CheckDeclaration; problems: ConfigProblem[] } => {
  const field = `checks.${index}`
  const candidate = asRecord(value)
  if (!candidate) return { problems: [{ field, message: `${field} must be an object.` }] }

  const problems: ConfigProblem[] = []
  const id = candidate.id
  for (const key of Object.keys(candidate)) {
    if (!['id', 'kind', 'verification', 'severity', 'constraint', 'analyzer', 'prompt', 'trigger', 'role'].includes(key)) {
      problems.push({ field: `${field}.${key}`, message: `${field} has no field '${key}'.` })
    }
  }
  if (!isNonEmptyString(id) || !ID.test(id)) {
    problems.push({ field: `${field}.id`, message: `${field}.id must be a dotted identifier, e.g. 'motion.no-oversized-animation'.` })
  }
  if (!oneOf(candidate.kind, KINDS)) {
    problems.push({ field: `${field}.kind`, message: `${field}.kind must be one of ${KINDS.join(', ')}.` })
  }
  if (!oneOf(candidate.severity, SEVERITIES)) {
    problems.push({ field: `${field}.severity`, message: `${field}.severity must be one of ${SEVERITIES.join(', ')}.` })
  }
  if (!oneOf(candidate.verification, VERIFICATIONS)) {
    problems.push({ field: `${field}.verification`, message: `${field}.verification must be one of ${VERIFICATIONS.join(', ')}.` })
  } else if (candidate.verification !== 'structural' && candidate.verification !== 'semantic') {
    // Fail closed rather than accept a declaration nothing consumes: command
    // checks are `requiredChecks`, and the heuristic family has no engine yet.
    const guidance = candidate.verification === 'command'
      ? "declare it in policy.requiredChecks instead, which points at the project's own scripts"
      : 'no engine in this build consumes it yet'
    problems.push({
      field: `${field}.verification`,
      message: `${field}.verification '${candidate.verification}' has no reader: ${guidance}.`,
    })
  }

  const isSemantic = candidate.verification === 'semantic'
  if (isSemantic) {
    // A semantic declaration carries a prompt and a trigger, never a matching
    // rule: the model answers, the harness decides what the answer means.
    if (!isNonEmptyString(candidate.prompt)) {
      problems.push({ field: `${field}.prompt`, message: `${field}.prompt must be a path to the prompt inside the declaring package or ${'.harness'}/.` })
    }
    if (candidate.trigger === undefined) {
      problems.push({ field: `${field}.trigger`, message: `${field}.trigger must say what makes this check worth a call.` })
    } else {
      problems.push(...triggerProblems(candidate.trigger, `${field}.trigger`))
    }
    if (candidate.role !== undefined && !oneOf(candidate.role, ROLES)) {
      problems.push({ field: `${field}.role`, message: `${field}.role must be one of ${ROLES.join(', ')}.` })
    }
    if (candidate.analyzer !== undefined || candidate.constraint !== undefined) {
      problems.push({
        field: `${field}.constraint`,
        message: `${field} is semantic: it cannot also declare an analyzer or a constraint.`,
      })
    }
  } else if (candidate.prompt !== undefined || candidate.trigger !== undefined || candidate.role !== undefined) {
    problems.push({
      field: `${field}.prompt`,
      message: `${field} is '${String(candidate.verification)}': prompt, trigger and role only apply to a semantic check.`,
    })
  }

  let constraint: Constraint | undefined
  if (candidate.constraint !== undefined) {
    const checked = constraintProblems(candidate.constraint, `${field}.constraint`)
    problems.push(...checked.problems)
    constraint = checked.constraint
  }
  const analyzer = candidate.analyzer
  if (!isSemantic) {
    if (!isNonEmptyString(analyzer)) {
      if (candidate.verification === 'structural') {
        problems.push({
          field: `${field}.analyzer`,
          message: `${field}.analyzer must name the analyzer that produces the facts; known ids: ${Object.keys(analyzerDeclarations).join(', ')}.`,
        })
      }
    } else if (!isKnownAnalyzer(analyzer)) {
      problems.push({
        field: `${field}.analyzer`,
        message: `${field}.analyzer '${analyzer}' is not implemented; known ids: ${Object.keys(analyzerDeclarations).join(', ')}.`,
      })
    } else if (constraint && constraint.target !== analyzerTarget(analyzer)) {
      problems.push({
        field: `${field}.constraint.target`,
        message: `${field}.constraint.target is '${constraint.target}', but analyzer '${analyzer}' produces '${analyzerTarget(analyzer)}' facts.`,
      })
    }
  }

  if (problems.length > 0) return { problems }
  const check: CheckDeclaration = {
    id: id as string,
    kind: candidate.kind as CheckDeclaration['kind'],
    verification: candidate.verification as VerificationKind,
    severity: candidate.severity as Severity,
  }
  if (constraint) check.constraint = constraint
  if (typeof analyzer === 'string') check.analyzer = analyzer
  if (isSemantic) {
    check.prompt = candidate.prompt as string
    check.trigger = candidate.trigger as CheckDeclaration['trigger']
    if (candidate.role !== undefined) check.role = candidate.role as CheckDeclaration['role']
  }
  return { check, problems }
}

/**
 * Checks one `verification` document.
 *
 * The document is the data half of the extension surface: it declares what to
 * detect. The analyzer implementations stay code, and a declaration may only
 * name one this build can actually run.
 */
export const verificationProblems = (document: unknown): ConfigProblem[] => {
  const candidate = asRecord(document)
  if (!candidate) return [{ message: 'A verification document must be an object.' }]

  const problems: ConfigProblem[] = []
  for (const key of Object.keys(candidate)) {
    if (key !== 'checks' && key !== '$schema') {
      problems.push({ field: key, message: `A verification document has no field '${key}'.` })
    }
  }
  if (!Array.isArray(candidate.checks) || candidate.checks.length === 0) {
    problems.push({ field: 'checks', message: 'A verification document must declare at least one check.' })
    return problems
  }
  const seen = new Set<string>()
  candidate.checks.forEach((entry, index) => {
    const checked = checkProblems(entry, index)
    problems.push(...checked.problems)
    const id = checked.check?.id
    if (id === undefined) return
    if (seen.has(id)) problems.push({ field: `checks.${index}.id`, message: `Check id '${id}' is declared twice in one document.` })
    seen.add(id)
  })
  return problems
}

/** A document to collect checks from, and the label an error should name. */
export interface CheckSource {
  label: string
  value: unknown
}

/** A rule id declared twice with different bodies. */
export interface CheckConflict {
  id: string
  first: string
  second: string
}

export interface CollectedChecks {
  checks: ResolvedCheck[]
  conflicts: CheckConflict[]
}

/** The declaration fields that decide what a check means, for conflict detection. */
const bodyOf = (check: CheckDeclaration): string =>
  JSON.stringify([check.kind, check.verification, check.severity, check.constraint ?? null, check.analyzer ?? null])

/**
 * Merges the checks declared by several documents, dependencies first.
 *
 * `verification` merges as a union, so every declaration is kept. A rule id
 * declared twice with two different bodies is a conflict rather than a silent
 * winner: deciding which one wins (deny-wins, and the `conflicts` record that
 * explains it) belongs to configuration composition (M17). Until then the run
 * fails and names both documents, which is the only honest answer available.
 */
export const mergeChecks = (sources: readonly CheckSource[]): CollectedChecks => {
  const checks: ResolvedCheck[] = []
  const byId = new Map<string, ResolvedCheck>()
  const conflicts: CheckConflict[] = []

  for (const source of sources) {
    const candidate = asRecord(source.value)
    const entries = Array.isArray(candidate?.checks) ? candidate.checks : []
    for (const entry of entries) {
      const check = entry as CheckDeclaration
      if (typeof check?.id !== 'string') continue
      const existing = byId.get(check.id)
      if (existing === undefined) {
        const resolved: ResolvedCheck = { ...check, source: source.label }
        byId.set(check.id, resolved)
        checks.push(resolved)
        continue
      }
      if (bodyOf(existing) !== bodyOf(check)) {
        conflicts.push({ id: check.id, first: existing.source, second: source.label })
      }
    }
  }

  return { checks, conflicts }
}
