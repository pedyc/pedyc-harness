import { createHash } from 'node:crypto'
import type { Evidence, Finding, VerificationCheck } from '../contracts/index.js'
import type { AnalyzerFact } from './analyzers.js'
import type { CommandResult } from './command.js'

/**
 * How much raw output is kept beside a digest.
 *
 * The digest covers the untruncated text, so truncation costs reviewability
 * rather than correctness: a reader can still tell whether two outputs are the
 * same, and a full log stays available from whoever produced it.
 */
const MAX_OUTPUT_CHARS = 2000

/** `sha256:<hex>`; prefixed so a digest can never be mistaken for its input. */
export const digest = (text: string): string =>
  `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`

/** Keeps the head of an output and marks that something was dropped. */
export const truncate = (text: string, limit: number = MAX_OUTPUT_CHARS): string | undefined => {
  if (text.length === 0) return undefined
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…[truncated]`
}

/**
 * Whether a piece of evidence may take part in a judgment.
 *
 * `agent-claimed` never may: a party describing itself is a lead, not proof.
 * See `docs/architecture/governance.md` §6.
 */
export const mayJudge = (evidence: Evidence): boolean => evidence.trust !== 'agent-claimed'

/** The evidence a verdict may rest on, with the inspected party's claims removed. */
export const judgingEvidence = (evidence: readonly Evidence[]): Evidence[] =>
  evidence.filter(mayJudge)

/** The one-line summary a gate result is reported with. */
const summaryFor = (result: CommandResult): string => {
  if (result.termination !== 'exited') {
    return result.stderr.trim() || `Command was stopped (${result.termination}).`
  }
  if (result.code === 0) return 'Command completed successfully.'
  return result.stderr.trim() || `Command failed with exit code ${result.code}.`
}

export interface CommandEvidenceInput {
  id: string
  /** The check family that produced it, e.g. `requiredChecks`. */
  source: string
  name?: string
  /** The readable command, e.g. `pnpm run build`. */
  command: string
  packageManager?: string
  result: CommandResult
  durationMs: number
  startedAt?: string
}

/**
 * Turns one executed command into evidence the harness itself vouches for.
 *
 * The exit code, the duration and both digests are recorded even when the
 * command succeeded, because "the gate passed" is exactly the claim a later
 * reader has to be able to re-check. See `docs/milestones/M08.md`.
 */
export const evidenceFromCommand = ({
  id,
  source,
  name,
  command,
  packageManager,
  result,
  durationMs,
  startedAt,
}: CommandEvidenceInput): Evidence => {
  const evidence: Evidence = {
    id,
    source,
    trust: 'harness-executed',
    verification: 'command',
    command,
    exitCode: result.code,
    durationMs,
    stdoutDigest: digest(result.stdout),
    stderrDigest: digest(result.stderr),
    details: summaryFor(result),
  }
  if (name !== undefined) evidence.name = name
  if (packageManager !== undefined) evidence.packageManager = packageManager
  if (startedAt !== undefined) evidence.startedAt = startedAt
  const stdout = truncate(result.stdout)
  const stderr = truncate(result.stderr)
  if (stdout !== undefined) evidence.stdout = stdout
  if (stderr !== undefined) evidence.stderr = stderr
  return evidence
}

export interface SkippedEvidenceInput {
  id: string
  source: string
  name?: string
  command?: string
  packageManager?: string
  /** Why nothing ran: refused by policy, disabled, or out of budget. */
  reason: string
}

/**
 * Records a check that did not run.
 *
 * A missing row would be indistinguishable from a check nobody declared, and
 * "what was skipped" is the question an audit asks after a green run. Absence of
 * an exit code is therefore recorded as absence, not as a failure code.
 */
export const skippedEvidence = ({
  id,
  source,
  name,
  command,
  packageManager,
  reason,
}: SkippedEvidenceInput): Evidence => {
  const evidence: Evidence = {
    id,
    source,
    trust: 'harness-executed',
    verification: 'command',
    skipped: true,
    details: reason,
  }
  if (name !== undefined) evidence.name = name
  if (command !== undefined) evidence.command = command
  if (packageManager !== undefined) evidence.packageManager = packageManager
  return evidence
}

/**
 * Records a deterministic fact an analyzer extracted from the changed files.
 *
 * An analyzer has no command and no exit code, so those fields stay absent; the
 * trust level says where the fact came from, which is what a reader needs in
 * order to weigh it. See `docs/architecture/governance.md` §6.
 */
export const analyzerEvidence = (facts: readonly AnalyzerFact[]): Evidence[] =>
  facts.map((fact, index) => ({
    id: `analyzer:${fact.analyzer}:${index + 1}`,
    source: fact.analyzer,
    trust: 'analyzer-derived' as const,
    verification: 'structural' as const,
    name: fact.property,
    details: `${fact.file}: ${fact.property} = ${fact.value}`,
  }))

/**
 * Records what a dispatched semantic review said.
 *
 * `review-derived` is the harness's own observation through another executor:
 * it is not a command result and not the inspected party's self-description, so
 * it gets its own trust level. See `docs/architecture/governance.md` §6.
 */
export const reviewEvidence = (
  findings: readonly Finding[],
  role: string,
): Evidence[] =>
  findings.map((finding, index) => ({
    id: `review:${role}:${index + 1}`,
    source: role,
    trust: 'review-derived' as const,
    verification: 'semantic' as const,
    name: finding.rule,
    details: finding.reason,
  }))

/** An agent's self-report, recorded as a lead rather than as proof. */export const claimedEvidence = (
  source: string,
  claims: readonly VerificationCheck[],
): Evidence[] =>
  claims.map((claim, index) => ({
    id: `${source}:${index + 1}`,
    source,
    trust: 'agent-claimed' as const,
    verification: 'command' as const,
    command: claim.command,
    details: claim.details,
  }))

/** The legacy shape, derived rather than maintained beside the evidence. */
export const toVerificationCheck = (evidence: Evidence): VerificationCheck => {
  const passed = evidence.skipped !== true && evidence.exitCode === 0
  const details = evidence.details?.trim()
  return {
    command: evidence.command ?? evidence.name ?? evidence.source,
    result: passed ? 'pass' : 'fail',
    details: details && details.length > 0
      ? details
      : passed
        ? 'Check passed.'
        : `Check did not pass (exit code ${evidence.exitCode ?? 'not recorded'}).`,
  }
}

export const toVerificationChecks = (evidence: readonly Evidence[]): VerificationCheck[] =>
  evidence.map(toVerificationCheck)

/**
 * Whether a value is the structured model rather than the legacy projection.
 *
 * Exported because `runOrchestrator` accepts both: a caller that still hands
 * back `VerificationCheck[]` keeps working, and its entries are upgraded to
 * evidence with the provenance the harness can honestly claim for them.
 */
export const isEvidence = (value: Evidence | VerificationCheck): value is Evidence =>
  typeof (value as Evidence).trust === 'string' && typeof (value as Evidence).id === 'string'

/**
 * Upgrades legacy checks to evidence without inventing facts that were not
 * observed: an exit code is inferred from `result`, while duration and digests
 * stay absent because the caller never recorded them.
 */
export const normalizeEvidence = (items: readonly (Evidence | VerificationCheck)[]): Evidence[] =>
  items.map((item, index) => isEvidence(item)
    ? item
    : {
        id: `legacy:${index + 1}`,
        source: 'legacy-check',
        trust: 'harness-executed' as const,
        verification: 'command' as const,
        command: item.command,
        exitCode: item.result === 'pass' ? 0 : 1,
        details: item.details,
      })
