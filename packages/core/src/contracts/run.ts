import type { PolicyViolation } from './policy.js'
import type { VerificationCheck } from './validation.js'

export type RunStatus = 'passed' | 'failed'

export type PhaseStatus = 'running' | 'passed' | 'failed'

/**
 * Why the orchestration loop stopped.
 *
 * Orthogonal to `status`: "the loop ended" and "the conclusion is pass" are
 * different facts, which a single boolean used to conflate. See
 * `docs/decisions/ADR-006-run-lifecycle.md` §2.2.
 */
export type TerminationReason =
  | 'completed'
  | 'timeout'
  | 'max_iterations'
  | 'policy_violation'
  | 'agent_error'
  | 'cancelled'

export interface PhaseRecord {
  name: string
  status: PhaseStatus
  details: string
  iteration?: number
}

/** A file whose contents changed while the coder ran. */
export interface FileChange {
  file: string
  change: string
}

/**
 * What `runOrchestrator` reports. It carries no `status` or `summary` because
 * only the caller knows how to phrase those; `runHarness` turns this into a
 * `RunResult`.
 */
export interface OrchestrationResult {
  completed: boolean
  /**
   * Absent when the loop never ran — a dry run, or a failure before execution.
   * It answers "why did the loop stop", and there is no answer to a question
   * that was never asked.
   */
  termination?: TerminationReason
  implementationPlan: string[]
  fileChanges: FileChange[]
  verification: VerificationCheck[]
  violations: PolicyViolation[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
}

/** The document written to `output.json`; matches `output.schema.json`. */
export interface RunResult {
  status: RunStatus
  termination?: TerminationReason
  summary: string
  implementationPlan: string[]
  fileChanges: FileChange[]
  verification: VerificationCheck[]
  violations: PolicyViolation[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
  dryRun: boolean
}
