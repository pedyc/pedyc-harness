import type { AgentCallResult, VerificationCheck } from '../contracts/index.js'

/**
 * Whether the tester stage may pass.
 *
 * Two independent conditions: every configured gate actually passed, and the
 * tester agent approved the evidence it was handed. A run never passes on the
 * coder's own claim.
 */
export const testerApproved = (
  verification: VerificationCheck[],
  externalTest: AgentCallResult,
): boolean =>
  verification.every((check) => check.result === 'pass')
  && externalTest.ok
  && externalTest.payload.approved === true

/**
 * Whether the reviewer stage may pass.
 *
 * Scope is checked here rather than trusted to the agent: any file the policy
 * refuses rejects the change even when the reviewer approves it. The refusal is
 * produced by the policy evaluator, so "refused" covers both the
 * `allowedProductPaths` and the `protectedPaths` rules.
 */
export const reviewerApproved = (
  reviewer: AgentCallResult,
  refusedFiles: string[],
): boolean =>
  reviewer.ok && reviewer.payload?.approved === true && refusedFiles.length === 0
