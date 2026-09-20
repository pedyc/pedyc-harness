import type { CheckDeclaration, Constraint, Finding } from '../contracts/index.js'
import { builtInAnalyzers } from './analyzers.js'
import type { Analyzer, AnalyzerContext, AnalyzerFact } from './analyzers.js'

/** A number with an optional unit, as a declaration or a fact may carry it. */
interface Measure {
  value: number
  unit: string
}

const MEASURE = /^(-?\d+(?:\.\d+)?)\s*([a-z%]*)$/i

const parseMeasure = (value: string | number): Measure | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? { value, unit: '' } : null
  const match = MEASURE.exec(value.trim())
  if (!match) return null
  return { value: Number(match[1]), unit: (match[2] ?? '').toLowerCase() }
}

/** Time units the engine converts; every other unit must match exactly. */
const TIME_UNITS: Record<string, number> = { ms: 1, s: 1000 }

const toComparable = (
  left: Measure,
  right: Measure,
): { left: number; right: number } | { error: string } => {
  if (left.unit === right.unit) return { left: left.value, right: right.value }
  const leftScale = TIME_UNITS[left.unit]
  const rightScale = TIME_UNITS[right.unit]
  if (leftScale !== undefined && rightScale !== undefined) {
    return { left: left.value * leftScale, right: right.value * rightScale }
  }
  if (left.unit.length === 0 || right.unit.length === 0) {
    return { error: `comparing '${left.value}${left.unit}' with '${right.value}${right.unit}' needs matching units` }
  }
  return { error: `units '${left.unit}' and '${right.unit}' are not comparable` }
}

const text = (value: string | number): string => String(value).trim()

/** Whether two values are equal, numerically when both are measurements. */
const equalValues = (actual: string | number, expected: string | number): boolean | { error: string } => {
  const left = parseMeasure(actual)
  const right = parseMeasure(expected)
  if (left && right && (left.unit.length > 0 || right.unit.length > 0)) {
    const comparable = toComparable(left, right)
    if ('error' in comparable) return comparable
    return comparable.left === comparable.right
  }
  return text(actual) === text(expected)
}

/** The outcome of comparing one fact against one declared constraint. */
export type Comparison = { violated: boolean } | { error: string }

/**
 * Compares one fact against one declared constraint.
 *
 * The engine refuses to guess. A comparison it cannot perform — incompatible
 * units, an ordering operator on a non-numeric value — returns an error, which
 * the caller turns into a failed run rather than a silent pass. That is the
 * documented expression limit of a declarative constraint: "take a property and
 * compare it with a value", and nothing more. See
 * `docs/decisions/ADR-007-rule-kinds-and-constraints.md` §2.2.
 */
export const compareConstraint = (constraint: Constraint, actual: string | number): Comparison => {
  const expected = constraint.value
  const operator = constraint.operator

  if (operator === 'in' || operator === 'not-in') {
    if (!Array.isArray(expected)) {
      return { error: `operator '${operator}' needs an array value` }
    }
    const list = expected as readonly string[]
    const listed = list.some((entry) => {
      const equal = equalValues(actual, entry)
      return equal === true
    })
    return { violated: operator === 'in' ? !listed : listed }
  }

  const target = typeof expected === 'string' || typeof expected === 'number' ? expected : null
  if (target === null) {
    return { error: `operator '${operator}' cannot compare against a list` }
  }

  if (operator === '==') {
    const equal = equalValues(actual, target)
    return typeof equal === 'object' ? equal : { violated: !equal }
  }

  const left = parseMeasure(actual)
  const right = parseMeasure(target)
  if (!left || !right) {
    return { error: `operator '${operator}' needs numeric values, but got '${text(actual)}' and '${text(target)}'` }
  }
  const comparable = toComparable(left, right)
  if ('error' in comparable) return comparable
  const { left: a, right: b } = comparable
  if (operator === '<=') return { violated: a > b }
  if (operator === '>=') return { violated: a < b }
  if (operator === '<') return { violated: a >= b }
  return { violated: a <= b }
}

export interface StructuralOptions {
  /** The declared checks to evaluate; only structural ones with a constraint run. */
  checks: readonly CheckDeclaration[]
  files: readonly string[]
  readFile: AnalyzerContext['readFile']
  /** Registered analyzers; defaults to the built-ins. */
  analyzers?: Readonly<Record<string, Analyzer>>
}

export interface StructuralOutcome {
  findings: Finding[]
  /** Every fact the analyzers produced, for the evidence record. */
  facts: AnalyzerFact[]
  /**
   * Constraints that could not be evaluated.
   *
   * Never empty-and-ignored: a declaration that cannot be evaluated makes the run
   * stop, because the alternative is claiming a constraint held when it was
   * never checked.
   */
  errors: string[]
}

/**
 * Evaluates declared constraints against facts extracted from the changed files.
 *
 * Analyzer and rule meet here and nowhere else: the analyzer produced the fact,
 * the check declared the comparison, and neither knows the other. A constraint
 * whose property does not appear in any fact is *not* a violation — the
 * declaration says "this property must satisfy X", not "this property must
 * exist".
 */
export const runStructuralChecks = ({
  checks,
  files,
  readFile,
  analyzers = builtInAnalyzers,
}: StructuralOptions): StructuralOutcome => {
  const findings: Finding[] = []
  const facts: AnalyzerFact[] = []
  const errors: string[] = []
  const cache = new Map<string, AnalyzerFact[]>()

  const factsOf = (id: string, analyzer: Analyzer): AnalyzerFact[] => {
    const cached = cache.get(id)
    if (cached) return cached
    const produced = analyzer({ files, readFile })
    cache.set(id, produced)
    facts.push(...produced)
    return produced
  }

  for (const check of checks) {
    const constraint = check.constraint
    if (check.verification !== 'structural' || constraint === undefined) continue

    const analyzerId = check.analyzer
    const analyzer = analyzerId === undefined ? undefined : analyzers[analyzerId]
    if (analyzerId === undefined || analyzer === undefined) {
      errors.push(`Check '${check.id}' names analyzer '${analyzerId ?? '(none)'}', which is not registered.`)
      continue
    }

    for (const fact of factsOf(analyzerId, analyzer)) {
      if (fact.analyzer !== analyzerId || fact.property !== constraint.property) continue
      const comparison = compareConstraint(constraint, fact.value)
      if ('error' in comparison) {
        errors.push(`Check '${check.id}' cannot be evaluated: ${comparison.error}.`)
        continue
      }
      if (!comparison.violated) continue
      findings.push({
        rule: check.id,
        target: fact.file,
        severity: check.severity,
        reason: `${fact.property} is ${text(fact.value)} in ${fact.file}, which violates ${constraint.operator} ${text(constraint.value as string | number)}.`,
        // A declared value can normally be changed by the coder, which is what
        // makes another attempt worth spending.
        retryable: true,
        evidence: [fact.file],
      })
    }
  }

  return { findings, facts, errors }
}
