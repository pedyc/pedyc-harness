import type { AgentPayload, AgentRole } from '../contracts/index.js'
import type { ResponseValidator, SchemaErrorFormatter } from '../contracts/validator.js'

export interface ParsedAgentResponse {
  ok: boolean
  details: string
  payload: AgentPayload
}

/**
 * Decodes one provider response from stdout.
 *
 * An empty stdout is accepted: a built-in stage legitimately produces no
 * payload. Anything else must be a single JSON object matching the agent
 * response schema.
 */
export const parseAgentResponse = (
  name: AgentRole,
  stdout: string,
  validate: ResponseValidator,
  ajv: SchemaErrorFormatter,
): ParsedAgentResponse => {
  const trimmed = stdout.trim()
  if (!trimmed) return { ok: true, details: `${name} completed without a response payload.`, payload: {} }
  try {
    const payload = JSON.parse(trimmed) as AgentPayload
    if (!validate(payload)) {
      return {
        ok: false,
        details: `${name} returned an invalid response: ${ajv.errorsText(validate.errors)}`,
        payload: {},
      }
    }
    return { ok: true, details: payload.details ?? `${name} returned a structured response.`, payload }
  } catch {
    return { ok: false, details: `${name} must return one JSON object on stdout.`, payload: {} }
  }
}

/**
 * Applies the stage-specific requirements the response schema cannot express.
 *
 * Returns the problem as a message, or `null` when the stage may proceed.
 */
export const validateStageResponse = (name: AgentRole, payload: AgentPayload): string | null => {
  if (name === 'planner' && (!Array.isArray(payload.implementationPlan) || payload.implementationPlan.length === 0)) {
    return 'planner must return a non-empty implementationPlan.'
  }
  if (name === 'tester') {
    if (typeof payload.approved !== 'boolean') return 'tester must return a boolean approved field.'
    if (!Array.isArray(payload.evidence) || payload.evidence.length === 0) return 'tester must return non-empty evidence.'
  }
  if (name === 'reviewer' && typeof payload.approved !== 'boolean') {
    return 'reviewer must return a boolean approved field.'
  }
  return null
}
