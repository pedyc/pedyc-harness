import type {
  AgentCallResult,
  AgentRole,
  AgentsConfig,
  CommandPolicy,
  StageRequest,
} from '../contracts/index.js'
import { parseAgentResponse, validateStageResponse } from '../core/agent.js'
import { runCommand } from '../core/command.js'
import { isCommandAllowed } from '../core/policy-engine.js'
import type { ResponseValidator, SchemaErrorFormatter } from '../core/validator.js'

export interface ProviderRunnerOptions {
  root: string
  agents: AgentsConfig
  policy: CommandPolicy
  validator: ResponseValidator
  ajv: SchemaErrorFormatter
}

/**
 * Builds the function that runs one pipeline stage.
 *
 * A stage configured as `internal` is a no-op that passes: the built-in
 * pipeline has nothing to delegate. An `external` stage is spawned as a child
 * process and must speak the stdin/stdout JSON protocol.
 */
export const createProviderRunner = ({ root, agents, policy, validator, ajv }: ProviderRunnerOptions) =>
  async (name: AgentRole, payload: StageRequest): Promise<AgentCallResult> => {
    const config = agents[name]
    if (!config || config.mode === 'internal') {
      return { ok: true, details: `${name} completed using the built-in stage.`, payload: {} }
    }
    if (config.mode !== 'external' || typeof config.provider !== 'string') {
      return { ok: false, details: `${name} requires a configured provider in .harness/agents.json.`, payload: {} }
    }
    const provider = agents.providers?.[config.provider]
    if (!provider || typeof provider.command !== 'string' || !Array.isArray(provider.args)) {
      return { ok: false, details: `${name} provider '${config.provider}' is not configured.`, payload: {} }
    }
    if (!isCommandAllowed(provider.command, policy)) {
      return { ok: false, details: `${name} provider command is not in policy.allowedAgentCommands.`, payload: {} }
    }

    const result = await runCommand(root, provider.command, provider.args, {
      ...payload,
      provider: config.provider,
    })
    if (result.code !== 0) {
      return {
        ok: false,
        details: result.stderr.trim() || `${name} exited with code ${result.code}.`,
        payload: {},
      }
    }

    const response = parseAgentResponse(name, result.stdout, validator, ajv)
    if (!response.ok) return response

    const stageError = validateStageResponse(name, response.payload)
    return stageError
      ? { ok: false, details: stageError, payload: response.payload }
      : response
  }
