import type { Severity } from './policy.js'

/**
 * One structured judgment about the change, produced by a rule implementation.
 *
 * A finding is not a sentence of approval or rejection: it states what was
 * observed, where, and whether the producer believes it can be repaired.
 * Disposition (reject / review / report) belongs to Policy, which resolves it
 * from `rule` — a finding never decides its own outcome. See
 * `docs/architecture/governance.md` §5.2.
 *
 * `retryable` is declared by the finding itself rather than explained
 * afterwards by the agent, and `confidence` is deliberately *not* part of the
 * judgment: a self-reported confidence is still a self-description and is only
 * useful for ordering and routing to a human.
 */
export interface Finding {
  /** The rule id this finding is about; must be declared by an implementation. */
  rule: string
  /** What the finding is about, e.g. a file path. */
  target: string
  /** What the producer claims; Policy may only ever tighten it. */
  severity: Severity
  reason: string
  /** Whether another coder attempt could repair it. */
  retryable: boolean
  /** For ordering and human routing only; never part of the verdict. */
  confidence?: number
  /**
   * Paths this finding rests on.
   *
   * A path that cannot be found in this iteration's snapshot or diff is
   * dropped: a finding may not cite a change that did not happen.
   */
  evidence?: readonly string[]
}

/**
 * A reviewer's structured answer.
 *
 * `approved` stays for wire compatibility with pre-1.3 adapters; the harness's
 * own verdict never rests on it alone.
 */
export interface ReviewResult {
  findings: Finding[]
  approved?: boolean
}
