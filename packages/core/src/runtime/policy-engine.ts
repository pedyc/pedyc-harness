import type {
  CommandPolicy,
  CommandPolicyContext,
  Policy,
  PolicyDecision,
  PolicyViolation,
  RuleAction,
  ViolationMode,
} from '../contracts/index.js'

// Deciding whether a document is acceptable configuration moved to the config
// layer, but `./policy` is a published subpath, so the name stays exported here.
export { validatePolicy } from '../config/policy.js'

// The judgment shapes are contract types now that `RunResult` carries them, but
// this subpath is published, so they stay reachable from here too.
export type { PolicyDecision, PolicyViolation, ViolationKind } from '../contracts/index.js'

/** A policy always carries its disposition; absent means the strict default. */
type Dispositioned = { onViolation?: ViolationMode }

/**
 * Applies the project's `onViolation` to a rule's disposition.
 *
 * `report` downgrades a rejection to a report; it never upgrades anything. Note
 * what it does *not* do: it does not turn a refusal into an execution. A refused
 * command is never started under either setting — this setting is about the
 * disposition of a violation, not about whether the harness controls the side
 * effect. See `docs/decisions/ADR-006-run-lifecycle.md` §2.3.
 */
const applyViolationMode = (action: RuleAction, policy: Dispositioned): RuleAction =>
  policy.onViolation === 'report' && action === 'reject' ? 'report' : action

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
        action: applyViolationMode('reject', policy),
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
        action: applyViolationMode('reject', policy),
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

/**
 * Every file whose change the policy refuses *and* escalates.
 *
 * Rejections only: under `onViolation: report` a refused file is recorded but no
 * longer blocks the run, which is the compatibility path for a project that
 * declared these fields while they did nothing.
 */
export const refusedFiles = (violations: PolicyViolation[]): string[] => [
  ...new Set(
    violations
      .filter(({ kind, action }) => kind === 'file' && action === 'reject')
      .map(({ target }) => target),
  ),
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

/**
 * Splits a command invocation into the token sequence policy is matched against.
 *
 * Every part — the executable, each argument, and any single argument carrying
 * several words — is split on whitespace, and a token's own matching surrounding
 * quotes are removed. This is deliberately *not* shell parsing: a quoted string
 * is one argument whose interior is not interpreted, so `sh -c "npm publish"`
 * yields `['sh', '-c', '"npm', 'publish"']` and does **not** match `npm publish`.
 * The boundary is recorded in `docs/interfaces/policy.md`.
 */
const tokenize = (command: string, args: string[] = []): string[] =>
  [command, ...args]
    .flatMap((part) => part.split(/\s+/))
    .filter((token) => token.length > 0)
    .map((token) => token.replace(/^(['"])(.*)\1$/, '$2'))

/** `/usr/bin/npm` and `npm.cmd` both name `npm`. */
const executableName = (token: string): string =>
  (token.split(/[\\/]/).pop() ?? token).replace(/\.(cmd|exe|bat)$/i, '')

/**
 * Whether `pattern` appears as a contiguous run inside `tokens`.
 *
 * Contiguous containment — not a prefix, and not a substring: `npm publish` is
 * matched by `npm publish --tag beta` and by `sudo npm publish`, while
 * `npm publish-notes` is not, because its second token is a different token.
 * Regex and arbitrary substring matching are deliberately out of scope for this
 * version. See `docs/interfaces/policy.md` §2.
 */
const containsSequence = (tokens: string[], pattern: string[]): boolean => {
  if (pattern.length === 0 || pattern.length > tokens.length) return false
  for (let start = 0; start + pattern.length <= tokens.length; start += 1) {
    if (pattern.every((token, offset) => tokens[start + offset] === token)) return true
  }
  return false
}

/**
 * The command rules.
 *
 * `forbiddenCommands` is evaluated against the whole invocation rather than the
 * executable name, so a pattern cannot be dodged by prefixing it. The executable
 * is normalised to its bare name for that comparison, so `/usr/bin/npm publish`
 * and `npm.cmd publish` are both the `npm publish` a project declared.
 *
 * `allowedAgentCommands` keeps its existing meaning — an exact member list of
 * command names, empty meaning "no restriction" — because widening it would
 * change what existing policies allow. A denial outranks an allowance, and
 * neither can be relaxed into execution by `onViolation`.
 */
export const evaluateCommand = (
  command: string,
  args: string[] = [],
  policy: CommandPolicyContext = {},
): PolicyDecision => {
  const violations: PolicyViolation[] = []
  const display = [command, ...args].join(' ')
  const tokens = tokenize(command, args)
  const normalised = tokens.length > 0
    ? [executableName(tokens[0] as string), ...tokens.slice(1)]
    : tokens

  const forbidden = (policy.forbiddenCommands ?? [])
    .find((pattern) => containsSequence(normalised, tokenize(pattern)))
  if (forbidden !== undefined) {
    violations.push({
      kind: 'command',
      rule: 'forbiddenCommands',
      target: display,
      severity: 'error',
      action: applyViolationMode('reject', policy),
      reason: `Command matches forbiddenCommands entry '${forbidden}': ${display}`,
      retryable: false,
    })
  }

  if (!isCommandAllowed(command, policy)) {
    violations.push({
      kind: 'command',
      rule: 'allowedAgentCommands',
      target: display,
      severity: 'error',
      action: applyViolationMode('reject', policy),
      reason: `Command is not in allowedAgentCommands: ${display}`,
      retryable: false,
    })
  }

  return { allowed: violations.length === 0, violations }
}

/** Whether an agent may run a command. An empty allow list means "no restriction". */
export const isCommandAllowed = (command: string, policy: CommandPolicy): boolean =>
  !policy.allowedAgentCommands?.length || policy.allowedAgentCommands.includes(command)
