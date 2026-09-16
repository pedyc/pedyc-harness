import { asRecord } from './json.js'
import type { ConfigProblem } from './json.js'

const roles = ['planner', 'coder', 'tester', 'reviewer'] as const

/**
 * Checks an agent configuration read from disk or declared inline in the manifest.
 *
 * The document is untrusted JSON, so this takes `unknown` and reports every
 * problem it finds rather than throwing.
 *
 * `verify` and the config loader both call this, so a project cannot be valid
 * for one entry point and invalid for the other.
 */
export const agentProblems = (agents: unknown): ConfigProblem[] => {
  const candidate = asRecord(agents)
  if (!candidate) return [{ message: 'Harness agents must be an object.' }]

  const providers = asRecord(candidate.providers)
  if (!providers) return [{ field: 'providers', message: 'Harness agents must define a providers object.' }]

  const problems: ConfigProblem[] = []
  for (const [provider, config] of Object.entries(providers)) {
    const entry = asRecord(config)
    if (!entry || typeof entry.command !== 'string' || !entry.command.trim() || !Array.isArray(entry.args)) {
      problems.push({
        field: `providers.${provider}`,
        message: `Harness provider '${provider}' must define a command and an args array.`,
      })
    }
  }

  for (const role of roles) {
    const config = asRecord(candidate[role])
    if (!config || !['internal', 'external'].includes(config.mode as string)) {
      problems.push({ field: role, message: `Harness agent '${role}' must declare mode internal or external.` })
    }
  }

  return problems
}

/** The first problem, or `null` when the document may be treated as an `AgentsConfig`. */
export const validateAgents = (agents: unknown): string | null =>
  agentProblems(agents)[0]?.message ?? null
