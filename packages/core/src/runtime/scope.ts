import type { Policy, PolicyViolation, ScopeRecord } from '../contracts/index.js'
import { describeFileViolations, evaluateFiles, refusedFiles } from './policy-engine.js'

/** One scope judgment: the reported record plus the violations behind it. */
export interface ScopeJudgment extends ScopeRecord {
  violations: PolicyViolation[]
}

/**
 * The harness's own comparison of what changed against what the policy allows.
 *
 * This is a step of its own rather than a clause inside the reviewer's verdict.
 * The reviewer is an agent, and an agent's approval is one input to the result;
 * whether the change stayed inside the allowed set is a fact the harness
 * observed, and it is reported separately so the record can say which of the two
 * failed. See `docs/architecture/runtime.md` §3.
 *
 * A protected-path hit is reported as itself: such a path is normally *inside*
 * the allowed set, so calling it "out of scope" would misdescribe why the change
 * was refused.
 */
export const judgeScope = (changedFiles: readonly string[], policy: Policy): ScopeJudgment => {
  const decision = evaluateFiles([...changedFiles], policy)
  const refused = refusedFiles(decision.violations)
  return {
    allowed: refused.length === 0,
    refusedFiles: refused,
    details: refused.length === 0
      ? `Scope judgment passed: ${changedFiles.length} changed file(s) stayed inside the policy.`
      : describeFileViolations(decision.violations),
    violations: decision.violations,
  }
}
