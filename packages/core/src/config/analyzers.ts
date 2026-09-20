/**
 * The analyzers this build ships, as a declaration.
 *
 * An analyzer turns artifacts into facts; it deliberately knows nothing about
 * rules. Its *implementation* lives in the runtime layer, because reading files
 * is execution, while the id and the artifact kind it serves are part of the
 * declaration contract a `verification` document is validated against.
 *
 * The split is what lets a rule and an analyzer come from different packages:
 * a declaration names `analyzer: 'css.duration'`, and any implementation
 * registered under that id can serve it. `docs/decisions/ADR-007-rule-kinds-and-constraints.md` §2.4.
 */
export interface AnalyzerDeclaration {
  id: string
  /** The `Constraint.target` this analyzer produces facts for. */
  target: string
  /** What it reads, for documentation and error messages. */
  reads: string
}

export const analyzerDeclarations: Readonly<Record<string, AnalyzerDeclaration>> = Object.freeze({
  'css.duration': {
    id: 'css.duration',
    target: 'css',
    reads: 'animation-duration and transition-duration declarations in a changed .css file',
  },
  'json.property': {
    id: 'json.property',
    target: 'json',
    reads: 'scalar leaves of a changed .json file, addressed by dotted property path',
  },
})
