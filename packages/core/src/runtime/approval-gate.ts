import type { AgentCallResult, Evidence, PolicyViolation } from '../contracts/index.js'
import type { FindingDecision } from './policy-engine.js'
import { judgingEvidence } from './evidence.js'

/**
 * Whether the tester stage may pass.
 *
 * Two independent conditions: every configured gate actually passed, and the
 * tester agent approved the evidence it was handed. A run never passes on the
 * coder's own claim.
 *
 * Only evidence that may take part in a judgment is consulted, so a tester
 * echoing back its own claims cannot make a failed gate disappear. Only the
 * command family is consulted as well: `requiredChecks` are gates, while a
 * structural fact is judged through the finding its rule produces.
 */
export const testerApproved = (
  evidence: readonly Evidence[],
  externalTest: AgentCallResult,
): boolean =>
  judgingEvidence(evidence).filter(isCommandEvidence).every(isPassingGate)
  && externalTest.ok
  && externalTest.payload.approved === true

/** Whether evidence belongs to the gate family. Absent reads as `command`. */
const isCommandEvidence = (evidence: Evidence): boolean =>
  (evidence.verification ?? 'command') === 'command'

const isPassingGate = (evidence: Evidence): boolean =>
  evidence.skipped !== true && evidence.exitCode === 0

/**
 * The reviewer stage's own verdict.
 *
 * Two conditions: the provider stage succeeded and it did not object. Evidence
 * must exist, because a reviewer that was given nothing has nothing to approve,
 * and "the agent said it was fine" is not an independent verification.
 *
 * `approved` is a compatibility field: a reviewer that answers with structured
 * findings and no boolean has stated its position, so an absent `approved` reads
 * as "no objection" and only an explicit `false` rejects. Scope is deliberately
 * *not* part of this: whether the change stayed inside the policy is the
 * harness's own observation, reported by the scope step, and merging the two
 * would make the record unable to say which one failed. See
 * `docs/architecture/runtime.md` §3.
 */
export const reviewerVerdict = (
  reviewer: AgentCallResult,
  evidence: readonly Evidence[],
): boolean =>
  judgingEvidence(evidence).length > 0
  && reviewer.ok
  && reviewer.payload?.approved !== false

/**
 * The pass condition of the reviewer stage as a whole.
 *
 * The stage's own verdict together with the independent scope judgment: any file
 * the policy refuses rejects the change even when the reviewer approves it. The
 * refusal is produced by the policy evaluator, so "refused" covers both the
 * `allowedProductPaths` and the `protectedPaths` rules.
 */
export const reviewerApproved = (
  reviewer: AgentCallResult,
  refusedFiles: string[],
  evidence: readonly Evidence[],
): boolean =>
  reviewerVerdict(reviewer, evidence) && refusedFiles.length === 0

/**
 * What a set of disposed findings means for the loop.
 *
 * Three outcomes rather than two: a repair is a different answer from a stop.
 * Only findings that declared themselves repairable send the run back to the
 * coder; anything else ends it, because retrying work nobody can repair spends
 * an iteration to reach the same conclusion.
 */
export interface FindingVerdict {
  passed: boolean
  /** The findings that stop the run as it stands. */
  blocking: PolicyViolation[]
  /** Whether another coder attempt is the right response instead of stopping. */
  retry: boolean
}

export const findingVerdict = ({ violations, unknown }: FindingDecision): FindingVerdict => {
  const blocking = violations.filter(({ action }) => action === 'reject')
  return {
    passed: blocking.length === 0 && unknown.length === 0,
    blocking,
    retry: blocking.length > 0
      && unknown.length === 0
      && blocking.every(({ retryable }) => retryable),
  }
}
