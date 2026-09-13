#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const projectRoot = resolve(process.cwd())
const args = process.argv.slice(2)
const command = args[0] ?? 'help'
const valueAfter = (name, fallback = null) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? fallback : fallback
}

const templates = {
  generic: {
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
  },
  vue: {
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
  },
}

const schemas = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json']
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const run = (script, scriptArgs = []) => {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script, ...scriptArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  process.exit(result.status ?? 1)
}

const init = () => {
  const presetName = valueAfter('--preset', 'generic')
  const preset = templates[presetName]
  if (!preset) {
    console.error(`Unknown preset '${presetName}'. Available presets: ${Object.keys(templates).join(', ')}`)
    process.exit(1)
  }
  const harnessRoot = join(projectRoot, '.harness')
  mkdirSync(harnessRoot, { recursive: true })
  writeJson(join(harnessRoot, 'policy.json'), preset.policy)
  writeJson(join(harnessRoot, 'agents.json'), preset.agents)
  for (const schema of schemas) {
    const source = join(packageRoot, '.harness', schema)
    writeFileSync(join(harnessRoot, schema), readFileSync(source, 'utf8'), 'utf8')
  }
  const instructionPath = join(projectRoot, 'AGENTS.md')
  if (!existsSync(instructionPath) || args.includes('--force')) {
    writeFileSync(instructionPath, preset.instruction, 'utf8')
  }
  console.log(`Initialized pedyc-harness with the '${presetName}' preset in ${projectRoot}`)
}

const verify = () => {
  const requiredProjectFiles = [
    'AGENTS.md',
    '.github/AGENTS.md',
    '.github/instructions/copilot-instructions.md',
    '.harness/policy.json',
    '.harness/agents.json',
    'package.json',
  ]
  if (requiredProjectFiles.some((file) => !existsSync(join(projectRoot, file)))) {
    const policyPath = join(projectRoot, '.harness', 'policy.json')
    const agentsPath = join(projectRoot, '.harness', 'agents.json')
    if (!existsSync(policyPath) || !existsSync(agentsPath)) {
      console.error('Harness configuration is incomplete. Run `pedyc-harness init` first.')
      process.exit(1)
    }
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
    const agents = JSON.parse(readFileSync(agentsPath, 'utf8'))
    if (!Array.isArray(policy.allowedProductPaths) || policy.allowedProductPaths.length === 0) {
      console.error('Harness policy must define at least one allowedProductPaths entry.')
      process.exit(1)
    }
    if (!agents.providers || typeof agents.providers !== 'object') {
      console.error('Harness agents must define a providers object.')
      process.exit(1)
    }
    console.log('Generic Harness configuration verified.')
    return
  }
  const script = join(packageRoot, '.github', 'harness', 'verify-config.mjs')
  const result = spawnSync(process.execPath, [script, '--root', projectRoot], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  })
  process.exit(result.status ?? 1)
}

if (command === 'init') init()
else if (command === 'verify') verify()
else if (command === 'run') {
  const runner = join(packageRoot, 'scripts', 'harness', 'run.mjs')
  const forwarded = args.slice(1)
  const result = spawnSync(process.execPath, [runner, '--root', projectRoot, ...forwarded], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  })
  process.exit(result.status ?? 1)
} else if (command === 'doctor') {
  console.log(`Project root: ${projectRoot}`)
  console.log(`Configuration: ${existsSync(join(projectRoot, '.harness')) ? 'found' : 'missing (.harness)'}`)
  console.log(`Node.js: ${process.version}`)
} else {
  console.log('Usage: pedyc-harness <init|verify|run|doctor> [options]')
  console.log('  init --preset generic|vue [--force]')
  console.log('  run --input .harness/task.json [--dry-run] [--json]')
}
