export const vuePreset = {
  name: 'vue',
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
    providers: { claude: { command: 'node', args: ['scripts/harness/claude-adapter.mjs'] } },
    planner: { mode: 'external', provider: 'claude' },
    coder: { mode: 'external', provider: 'claude' },
    tester: { mode: 'external', provider: 'claude' },
    reviewer: { mode: 'external', provider: 'claude' },
  },
  instruction: '# Harness project instructions\n\n- Use Vue 3 `<script setup lang="ts">`.\n- Keep product changes under `src/`.\n- Keep component props explicitly typed.\n',
}

export default vuePreset
