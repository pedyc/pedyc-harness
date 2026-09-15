import type { VerificationCheck } from './validation.js'

export type RunStatus = 'passed' | 'failed'

export type PhaseStatus = 'running' | 'passed' | 'failed'

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
  implementationPlan: string[]
  fileChanges: FileChange[]
  verification: VerificationCheck[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
}

/** The document written to `output.json`; matches `output.schema.json`. */
export interface RunResult {
  status: RunStatus
  summary: string
  implementationPlan: string[]
  fileChanges: FileChange[]
  verification: VerificationCheck[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
  dryRun: boolean
}
