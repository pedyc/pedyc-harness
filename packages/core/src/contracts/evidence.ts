import type { VerificationKind } from './rules.js'

/**
 * How much a single piece of evidence may be trusted.
 *
 * The levels exist because "what happened" and "who says so" are different
 * facts, and an audit that records only the first cannot answer why a
 * conclusion was believed. A finding is only allowed to rest on the first two
 * levels; `review-derived` is the harness's own dispatched observation and
 * `agent-claimed` is the inspected party describing itself. See
 * `docs/architecture/governance.md` §6.
 */
export type EvidenceTrust =
  | 'harness-executed'
  | 'analyzer-derived'
  | 'review-derived'
  | 'agent-claimed'

/**
 * One recorded fact about a run, with its provenance.
 *
 * This is the canonical evidence model: a command gate, a deterministic
 * analyzer, a dispatched semantic review and an agent's self-report all land in
 * this shape so that a single consumer can weigh them. The optional fields are
 * optional because not every producer can supply every fact — a skipped check
 * has no exit code, an analyzer has no command — and inventing a value for a
 * fact that was never observed is exactly what makes a record unauditable.
 *
 * `VerificationCheck` is the pre-1.3 shape and stays as a projection; it cannot
 * carry trust, so it can no longer be the model of record. See
 * `docs/interfaces/verification.md` §2.
 */
export interface Evidence {
  /** Stable within one run, so a finding can cite the evidence it rests on. */
  id: string
  /** Who produced it: a built-in check id, or a registered analyzer/provider id. */
  source: string
  /** The provenance that decides whether this may take part in a judgment. */
  trust: EvidenceTrust
  /** The check or analyzer name, when it has one. */
  name?: string
  /**
   * Which verification family produced it.
   *
   * Absent reads as `command`, which is what a pre-1.3 record holds. The
   * distinction matters because only a command is a *gate*: a structural fact is
   * judged through the finding its rule produces, not by the tester's
   * all-gates-passed rule.
   */
  verification?: VerificationKind
  /** The readable command that was actually executed, when one was. */
  command?: string
  /** The package manager the command was routed through, e.g. `pnpm`. */
  packageManager?: string
  /** The process exit code. Absent when nothing was executed. */
  exitCode?: number
  /** Wall-clock duration of the observation, in milliseconds. */
  durationMs?: number
  /** ISO timestamp the observation started. */
  startedAt?: string
  /** `sha256:<hex>` over the full stdout, so a digest cannot be reworded. */
  stdoutDigest?: string
  /** `sha256:<hex>` over the full stderr. */
  stderrDigest?: string
  /** Stdout kept for review, truncated; the digest covers the untruncated text. */
  stdout?: string
  /** Stderr kept for review, truncated; the digest covers the untruncated text. */
  stderr?: string
  /** True when the check did not run: refused, disabled, or out of budget. */
  skipped?: boolean
  /** A one-line human summary of what this evidence says. */
  details?: string
}
