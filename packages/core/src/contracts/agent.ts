import type { AgentMode, AgentRole, PolicyViolation } from './policy.js'
import type { FileChange } from './run.js'
import type { NormalizedTask } from './task.js'
import type { VerificationCheck } from './validation.js'

/** A provider entry from `.harness/agents.json`. */
export interface ProviderConfig {
  command: string
  args: string[]
}

/** How one stage is routed. `provider` is only meaningful for external mode. */
export interface AgentRoleConfig {
  mode: AgentMode
  provider?: string
}

export interface AgentsConfig {
  providers?: Record<string, ProviderConfig>
  planner?: AgentRoleConfig
  coder?: AgentRoleConfig
  tester?: AgentRoleConfig
  reviewer?: AgentRoleConfig
}

/**
 * A provider's decoded stdout.
 *
 * This is untrusted JSON, so every field is optional: `validateStageResponse`
 * is the runtime gate that decides whether a stage may proceed. The type
 * describes the wire shape; it does not promise that a field is present.
 */
export interface AgentPayload {
  details?: string
  approved?: boolean
  implementationPlan?: string[]
  evidence?: VerificationCheck[]
  issues?: string[]
  changedFiles?: string[]
}

/**
 * The outcome of running one stage. `payload` stays empty for built-in stages.
 *
 * `violations` carries policy refusals the harness itself produced while trying
 * to run the stage — notably a command that `forbiddenCommands` refused. The
 * provider never supplies this: it is the harness's own finding, which is why it
 * sits beside `payload` rather than inside it.
 */
export interface AgentCallResult {
  ok: boolean
  details: string
  payload: AgentPayload
  violations?: PolicyViolation[]
}

interface StageRequestBase {
  input: NormalizedTask
  implementationPlan: string[]
}

/**
 * What each stage receives. The shape is per-phase so a provider adapter can
 * rely on the fields its own phase needs.
 */
export interface PlannerRequest extends StageRequestBase {
  phase: 'planner'
}

export interface CoderRequest extends StageRequestBase {
  phase: 'coder'
  iteration: number
  previousVerification: VerificationCheck[]
}

export interface TesterRequest extends StageRequestBase {
  phase: 'tester'
  iteration: number
  verification: VerificationCheck[]
}

export interface ReviewerRequest extends StageRequestBase {
  phase: 'reviewer'
  iteration: number
  verification: VerificationCheck[]
  fileChanges: FileChange[]
}

export type StageRequest = PlannerRequest | CoderRequest | TesterRequest | ReviewerRequest

/**
 * Runs one stage of the pipeline.
 *
 * The request is serialized to JSON and handed to the provider over stdin, so
 * this signature is the whole adapter protocol.
 */
export type RunAgent = (name: AgentRole, request: StageRequest) => Promise<AgentCallResult>
