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
 * Scope is checked here rather than trusted to the agent: any out-of-scope file
 * rejects the change even when the reviewer approves it.
 */
export const reviewerApproved = (
  reviewer: AgentCallResult,
  outOfScopeChanges: string[],
): boolean =>
  reviewer.ok && reviewer.payload?.approved === true && outOfScopeChanges.length === 0
