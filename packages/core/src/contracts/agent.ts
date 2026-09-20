import type { AgentMode, AgentRole, PolicyViolation, Severity } from './policy.js'
import type { Finding } from './finding.js'
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
  /**
   * The declared origin behind this stage, when it is not just the provider name.
   *
   * A provider is a command; two roles can run the same model through different
   * commands, or the same command with different arguments. Naming the source
   * makes "was the reviewer independent of the coder?" answerable instead of a
   * guess from a provider id.
   */
  source?: string
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
  /**
   * The reviewer's structured judgments. `approved` stays for compatibility;
   * this is the channel the harness actually dispositions.
   */
  findings?: Finding[]
}

/**
 * The outcome of running one stage. `payload` stays empty for built-in stages.
 *
 * `violations` carries policy refusals the harness itself produced while trying
 * to run the stage — notably a command that `forbiddenCommands` refused. The
 * provider never supplies this: it is the harness's own finding, which is why it
 * sits beside `payload` rather than inside it.
 *
 * `termination` is set when the harness stopped the provider process itself
 * (`agentTimeoutMs` elapsing, or a cancellation), which the orchestrator turns
 * into the run's own termination reason.
 */
export interface AgentCallResult {
  ok: boolean
  details: string
  payload: AgentPayload
  violations?: PolicyViolation[]
  termination?: 'timeout' | 'cancelled'
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
  /**
   * The findings of the previous attempt, handed back verbatim.
   *
   * Structured reflux only: a natural-language summary must never be the thing
   * the coder is asked to repair.
   */
  previousFindings?: Finding[]
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
  /**
   * Findings the harness itself produced, such as a claimed change that the
   * diff does not contain. The reviewer confirms them or leaves them
   * unconfirmed, which is what a `review` disposition asks for.
   */
  findings: Finding[]
}

/**
 * One batched semantic review.
 *
 * The harness dispatches this on the role the declaration named (default
 * `reviewer`), reusing the provider protocol: no model, endpoint or credential
 * appears in the declaration or here. Every triggered check travels in the same
 * request, so the number of calls is decided by whether anything triggered, not
 * by how many checks were declared.
 */
export interface SemanticRequest extends StageRequestBase {
  phase: 'semantic'
  iteration: number
  /** The triggered checks, with the prompt text the config layer resolved. */
  checks: Array<{ id: string; severity: Severity; prompt: string }>
  /** The findings that triggered the review, as context. */
  findings: Finding[]
  /** What the harness actually observed this iteration. */
  verification: VerificationCheck[]
}

export type StageRequest =
  | PlannerRequest
  | CoderRequest
  | TesterRequest
  | ReviewerRequest
  | SemanticRequest

/**
 * Runs one stage of the pipeline.
 *
 * The request is serialized to JSON and handed to the provider over stdin, so
 * this signature is the whole adapter protocol.
 */
export type RunAgent = (name: AgentRole, request: StageRequest) => Promise<AgentCallResult>
