import type { Preset } from '@pedyc/harness-core/contracts'

export const vuePreset: Preset = {
  name: 'vue',
  detection: { requiredFiles: ['vite.config.ts'], requiredDependencies: ['vue'] },
  defaultProductPaths: ['src/'],
  verificationScripts: ['harness:verify', 'type-check', 'test:unit', 'build'],
  skills: [],
  policy: {
    maxIterations: 3,
    protectedPaths: ['.github/', '.claude/', '.agents/', '.harness/', 'scripts/'],
    requiredChecks: ['harness:verify', 'type-check', 'test:unit', 'build'],
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
  instruction: '# Harness project instructions\n\n- Use Vue 3 `<script setup lang="ts">`.\n- Keep product changes under `src/`.\n- Keep component props explicitly typed.\n',
}

export default vuePreset
