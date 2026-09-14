import { parseAgentResponse, validateStageResponse } from './agent.mjs'
import { runCommand } from './command.mjs'

export const createProviderRunner = ({ root, agents, policy, validator, ajv }) => async (name, payload) => {
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
  if (!isAllowed(provider.command, policy)) {
    return { ok: false, details: `${name} provider command is not in policy.allowedAgentCommands.`, payload: {} }
  }
  const result = await runCommand(root, provider.command, provider.args, { ...payload, provider: config.provider })
  if (result.code !== 0) {
    return { ok: false, details: result.stderr.trim() || `${name} exited with code ${result.code}.`, payload: {} }
  }
  const response = parseAgentResponse(name, result.stdout, validator, ajv)
  if (!response.ok) return response
  const stageError = validateStageResponse(name, response.payload)
  return stageError
    ? { ok: false, details: stageError, payload: response.payload }
    : response
}

const isAllowed = (command, policy) =>
  !policy.allowedAgentCommands?.length || policy.allowedAgentCommands.includes(command)
