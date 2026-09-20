/**
 * Deterministic analyzers: they turn artifacts into facts and know nothing about
 * rules.
 *
 * This is the first half of the ADR-007 split. An analyzer never decides whether
 * something is wrong — it reports `animation-duration = 1s`. The comparison
 * against a declared constraint is a separate concern (`runtime/structural.ts`),
 * which is what lets an analyzer and a rule come from different packages.
 *
 * Every id here must also appear in `config/analyzers.ts`, which is what config
 * validation checks against; `tests/harness/structural.spec.ts` asserts the two
 * tables agree.
 */

/** One observed property of one file. */
export interface AnalyzerFact {
  /** The analyzer id that produced it. */
  analyzer: string
  /** The changed file it was read from, repository-relative. */
  file: string
  property: string
  value: string | number
}

export interface AnalyzerContext {
  /** The changed files of this iteration. */
  files: readonly string[]
  /** Reads a changed file's contents; `null` when it no longer exists. */
  readFile: (file: string) => string | null
}

/**
 * An analyzer is a pure function of the changed files.
 *
 * No network, no side effects: that is the whole reason a preset may ship one as
 * code while anything needing a model may not. See
 * `docs/decisions/ADR-005-semantic-governance.md` §2.6.
 */
export type Analyzer = (context: AnalyzerContext) => AnalyzerFact[]

/** Longhand duration properties a stylesheet can declare. */
const DURATION_PROPERTIES = ['animation-duration', 'transition-duration']

/** `property: value` declarations, however the file formats them. */
const DECLARATION = /([a-z-]+)\s*:\s*([^;{}]+)/gi

/**
 * Reads duration declarations out of the changed stylesheets.
 *
 * Deliberately a declaration scanner rather than a CSS parser: it finds
 * `property: value` pairs in the changed text, which is all a value comparison
 * needs. It does not evaluate `calc()`, follow imports or resolve cascade — a
 * constraint that needed any of those would be beyond the declarative limit and
 * belongs in a rule implementation.
 */
const cssDuration: Analyzer = ({ files, readFile }) => {
  const facts: AnalyzerFact[] = []
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.css')) continue
    const content = readFile(file)
    if (content === null) continue
    for (const match of content.matchAll(DECLARATION)) {
      const property = (match[1] ?? '').toLowerCase()
      if (!DURATION_PROPERTIES.includes(property)) continue
      facts.push({ analyzer: 'css.duration', file, property, value: (match[2] ?? '').trim() })
    }
  }
  return facts
}

/** Every scalar leaf of a JSON document, addressed by dotted path. */
const leavesOf = (value: unknown, path: string, into: Array<[string, string | number]>): void => {
  if (value === null) {
    into.push([path, 'null'])
    return
  }
  if (typeof value === 'string' || typeof value === 'number') {
    into.push([path, value])
    return
  }
  if (typeof value === 'boolean') {
    into.push([path, String(value)])
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => leavesOf(entry, `${path}.${index}`, into))
    return
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      leavesOf(entry, path.length === 0 ? key : `${path}.${key}`, into)
    }
  }
}

/**
 * Reads scalar leaves out of the changed JSON documents.
 *
 * A declaration addresses one leaf by its dotted path, e.g. `scripts.test` or
 * `dependencies.axios`. A document that is not valid JSON produces no facts: a
 * syntax error is a different kind of problem, and inventing a fact about
 * unparseable input would be worse than reporting none.
 */
const jsonProperty: Analyzer = ({ files, readFile }) => {
  const facts: AnalyzerFact[] = []
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.json')) continue
    const content = readFile(file)
    if (content === null) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }
    const leaves: Array<[string, string | number]> = []
    leavesOf(parsed, '', leaves)
    for (const [property, value] of leaves) {
      if (property.length === 0) continue
      facts.push({ analyzer: 'json.property', file, property, value })
    }
  }
  return facts
}

export const builtInAnalyzers: Readonly<Record<string, Analyzer>> = Object.freeze({
  'css.duration': cssDuration,
  'json.property': jsonProperty,
})
