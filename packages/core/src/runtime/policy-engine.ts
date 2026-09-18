import type { CommandPolicy, Policy, RuleAction, Severity } from '../contracts/index.js'

// Deciding whether a document is acceptable configuration moved to the config
// layer, but `./policy` is a published subpath, so the name stays exported here.
export { validatePolicy } from '../config/policy.js'

/** Which of the three judgment families produced a violation. */
export type ViolationKind = 'file' | 'command' | 'rule'

/**
 * One refusal.
 *
 * Files, commands and registered rules all report in this shape so that a single
 * evaluator can decide them and a single consumer can act on the result. This is
 * the "unified Policy Evaluator" of
 * `docs/decisions/ADR-004-policy-severity-rules.md` §2.4: the point is not more
 * rules, it is that the three families cannot drift apart.
 *
 * `rule` is a stable id. The built-in rules use the name of the policy field they
 * enforce, which is also what lets a registered checker's id be addressed the
 * same way.
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
 * Prefix matching, not glob: `src/` also matches `src-other/file.ts`, so a path
 * must end in `/` to mean "inside this directory".
 *
 * `allowedProductPaths` and `protectedPaths` use the same matcher on purpose.
 * The over-permissive direction is recorded as known debt in
 * `docs/interfaces/policy.md` §4 rather than fixed here, because changing it
 * changes what every existing policy means.
 */
const prefixMatch = (target: string, paths: string[]): string | null =>
  paths.find((path) => target.startsWith(path)) ?? null

/**
 * The file rules, in one place so their precedence cannot drift.
 *
 * Two rules fire independently, and a file can break both: a path may be
 * protected *and* outside the allowed set. Both violations are emitted rather
 * than one replacing the other, because each answers a different question and a
 * caller may need either — `findOutOfScopeChanges` wants the second,
 * `describeFileViolations` leads with the first because it is the more specific
 * statement about why the file was refused.
 */
export const evaluateFiles = (files: string[], policy: Policy): PolicyDecision => {
  const violations: PolicyViolation[] = []
  for (const file of files) {
    const protectedPath = prefixMatch(file, policy.protectedPaths ?? [])
    if (protectedPath) {
      violations.push({
        kind: 'file',
        rule: 'protectedPaths',
        target: file,
        severity: 'error',
        action: 'reject',
        reason: `Changed file is inside protected path '${protectedPath}': ${file}`,
        retryable: false,
      })
    }
    if (!prefixMatch(file, policy.allowedProductPaths)) {
      violations.push({
        kind: 'file',
        rule: 'allowedProductPaths',
        target: file,
        severity: 'error',
        action: 'reject',
        reason: `Changed file is outside allowedProductPaths: ${file}`,
        retryable: false,
      })
    }
  }
  return { allowed: violations.length === 0, violations }
}

/**
 * Names the files the coder touched that fall outside `allowedProductPaths`.
 *
 * A projection of `evaluateFiles` rather than a second implementation, so the
 * two cannot drift. It reports only the `allowedProductPaths` rule because that
 * is what its name promises: a protected file that is also inside the allowed
 * set is refused by `evaluateFiles` but is not "out of scope".
 */
export const findOutOfScopeChanges = (files: string[], policy: Policy): string[] =>
  evaluateFiles(files, policy).violations
    .filter(({ rule }) => rule === 'allowedProductPaths')
    .map(({ target }) => target)

/** Every file whose change the policy refuses, whatever the reason. */
export const refusedFiles = (violations: PolicyViolation[]): string[] => [
  ...new Set(violations.filter(({ kind }) => kind === 'file').map(({ target }) => target)),
]

/**
 * The one-line reason to show for a set of file violations.
 *
 * The out-of-scope sentence is kept verbatim: `docs/getting-started.md` documents
 * it as the symptom a user sees. A protected hit gets its own sentence, because
 * "outside allowed paths" would misdescribe it — protected paths are usually
 * *inside* the allowed set, which is exactly why they need saying separately.
 */
export const describeFileViolations = (violations: PolicyViolation[]): string => {
  const targetsOf = (rule: string): string[] =>
    violations.filter((violation) => violation.rule === rule).map(({ target }) => target)
  const protectedHits = targetsOf('protectedPaths')
  const outside = targetsOf('allowedProductPaths')
  const parts: string[] = []
  if (protectedHits.length > 0) parts.push(`Protected files changed: ${protectedHits.join(', ')}`)
  if (outside.length > 0) parts.push(`Out-of-scope files changed: ${outside.join(', ')}`)
  return parts.join('; ')
}

/** Whether an agent may run a command. An empty allow list means "no restriction". */
export const isCommandAllowed = (command: string, policy: CommandPolicy): boolean =>
  !policy.allowedAgentCommands?.length || policy.allowedAgentCommands.includes(command)
