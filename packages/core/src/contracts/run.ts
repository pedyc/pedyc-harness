import type { Evidence } from './evidence.js'
import type { Finding } from './finding.js'
import type { PolicyViolation, Severity } from './policy.js'
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
 * The harness's own scope judgment.
 *
 * It is reported as its own fact, not folded into the reviewer's verdict: "the
 * reviewer approved" and "the changes stayed inside the allowed set" are two
 * different statements, and a record that merges them cannot answer which one
 * was false. Absent on a dry run, which judges nothing.
 */
export interface ScopeRecord {
  /** Whether every changed file stayed inside the policy. */
  allowed: boolean
  /** The files the policy refuses, whatever disposition they received. */
  refusedFiles: string[]
  details: string
}

/**
 * What the semantic layer did.
 *
 * Recorded even when nothing ran: "no model was called" and "the layer was
 * switched off" are different facts, and a green run that skipped its review
 * must not be indistinguishable from one that passed it. See
 * `docs/decisions/ADR-005-semantic-governance.md` §2.7.
 */
export interface SemanticRecord {
  /** `ran` made a call, `disabled` was switched off, `idle` had nothing to do. */
  status: 'ran' | 'disabled' | 'idle'
  /** The rule ids whose triggers fired. */
  triggered: string[]
  /** Checks that did not run, and the reason recorded for each. */
  skipped: Array<{ id: string; severity: Severity; reason: string }>
  /**
   * Calls made.
   *
   * A round batches every triggered check into one call, so this counts rounds
   * with work rather than checks.
   */
  calls: number
}

/**
 * How the two stages that check each other were routed.
 *
 * Declared and audited rather than enforced: a project that runs every stage
 * through one provider is normal, and the record has to be able to say so. See
 * `docs/architecture/governance.md` §5.4.
 */
export interface IndependenceRecord {
  coder: string
  reviewer: string
  sameSource: boolean
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
  /** Absent when nothing was judged — a dry run, or a failure before execution. */
  scope?: ScopeRecord
  /**
   * The evidence the run is judged on, and its legacy projection.
   *
   * `evidence` is the model of record from 1.3.0: it carries trust, exit code,
   * duration and output digests. `verification` is derived from it for the
   * published `RunResult` and the provider protocol, so the two cannot drift.
   * See `docs/interfaces/verification.md` §2.
   */
  evidence: Evidence[]
  verification: VerificationCheck[]
  /**
   * The findings this iteration produced, before Policy disposed them.
   *
   * `violations` carries the disposition; this carries what the rules actually
   * said, so a reader can tell "the reviewer saw this" from "the harness
   * rejected it".
   */
  findings: Finding[]
  /** What the semantic layer did; absent on a dry run, which dispatches nothing. */
  semantic?: SemanticRecord
  /** How the checking stage was routed; absent when the caller did not say. */
  independence?: IndependenceRecord
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
  /** Absent when nothing was judged — a dry run, or a failure before execution. */
  scope?: ScopeRecord
  evidence: Evidence[]
  verification: VerificationCheck[]
  findings: Finding[]
  /** What the semantic layer did; absent on a dry run, which dispatches nothing. */
  semantic?: SemanticRecord
  /** How the checking stage was routed; absent when the caller did not say. */
  independence?: IndependenceRecord
  violations: PolicyViolation[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
  dryRun: boolean
}
