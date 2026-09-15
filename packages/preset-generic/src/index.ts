import type { Preset } from '@pedyc/harness-core/contracts'

export const genericPreset: Preset = {
  name: 'generic',
  detection: { requiredFiles: [], requiredDependencies: [] },
  defaultProductPaths: ['src/'],
  verificationScripts: [],
  skills: [],
  policy: {
    maxIterations: 3,
    protectedPaths: ['.github/', '.claude/', '.agents/', '.harness/', 'scripts/'],
    requiredChecks: [],
    forbiddenCommands: ['git reset --hard', 'git checkout --', 'npm publish'],
    allowedAgentCommands: [],
    allowedProductPaths: ['src/'],
    agentTimeoutMs: 300000,
  },
  agents: {
    providers: {},
    planner: { mode: 'internal' },
    coder: { mode: 'external', provider: 'custom' },
    tester: { mode: 'external', provider: 'custom' },
    reviewer: { mode: 'external', provider: 'custom' },
  },
  instruction: '# Harness project instructions\n\nDefine project-specific rules here. Product changes must stay within the configured product paths.\n',
}

export default genericPreset
