import type { AgentsConfig, Policy } from '../contracts/index.js'

/**
 * The built-in policy a project with a manifest but no `policy.json` runs under.
 *
 * It has to be stack-neutral: Core must never grow a branch that knows which
 * technology a project uses, so these are the same generic values every preset
 * starts from and a preset only ever adds to them.
 */
export const defaultPolicy = (): Policy => ({
  maxIterations: 3,
  allowedProductPaths: ['src/'],
  protectedPaths: [],
  requiredChecks: [],
  forbiddenCommands: [],
  allowedAgentCommands: [],
  agentTimeoutMs: 300000,
})

/**
 * The built-in agent routing for a project with a manifest but no `agents.json`.
 *
 * No provider is configured, so the stages that need one report a structured
 * failure until an adapter is declared. `verify` and `run --dry-run` never
 * invoke a provider, which is what lets a freshly initialized project work
 * before an adapter exists.
 */
export const defaultAgents = (): AgentsConfig => ({
  providers: {},
  planner: { mode: 'internal' },
  coder: { mode: 'external', provider: 'custom' },
  tester: { mode: 'external', provider: 'custom' },
  reviewer: { mode: 'external', provider: 'custom' },
})
