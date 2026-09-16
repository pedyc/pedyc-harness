// Project-owned verification hook. `pedyc-harness verify` validates the shared
// configuration first and then runs this file when it exists, so a project can add
// stricter checks without changing Core or the CLI.
//
// This repository keeps the full Harness contract here: the file list, the packages/
// product boundary and the Agent frontmatter.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const rootIndex = args.indexOf('--root')
const root = resolve(rootIndex >= 0 ? args[rootIndex + 1] ?? process.cwd() : process.cwd())
const requiredFiles = [
  'AGENTS.md',
  '.github/AGENTS.md',
  '.github/instructions/copilot-instructions.md',
  '.github/agents/Planner.agent.md',
  '.github/agents/Coder.agent.md',
  '.github/agents/Tester.agent.md',
  '.github/agents/Reviewer.agent.md',
  '.agents/skills/verify-change/SKILL.md',
  '.agents/skills/review-change/SKILL.md',
  '.harness/input.schema.json',
  '.harness/task.schema.json',
  '.harness/output.schema.json',
  '.harness/policy.json',
  '.harness/evaluation.json',
  '.harness/agents.json',
  '.harness/agent-response.schema.json',
  '.harness/task.example.json',
  'scripts/dist/claude-adapter.js',
  'scripts/harness/run.mjs',
  '.claude/CLAUDE.md',
  '.vscode/task.json',
]

const missingFiles = requiredFiles.filter((file) => !existsSync(resolve(root, file)))

if (missingFiles.length > 0) {
  console.error(`Harness configuration is incomplete:\n${missingFiles.join('\n')}`)
  process.exit(1)
}

const instructions = readFileSync(resolve(root, '.github/instructions/copilot-instructions.md'), 'utf8')
if (!instructions.includes('packages/') || !instructions.includes('产品代码')) {
  console.error('Harness instructions must define the packages/ product boundary.')
  process.exit(1)
}

const jsonFiles = [
  '.harness/input.schema.json',
  '.harness/task.schema.json',
  '.harness/output.schema.json',
  '.harness/policy.json',
  '.harness/evaluation.json',
  '.vscode/task.json',
]

for (const file of jsonFiles) {
  try {
    JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  } catch (error) {
    console.error(`Invalid JSON in ${file}: ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exit(1)
  }
}

const policy = JSON.parse(readFileSync(resolve(root, '.harness/policy.json'), 'utf8'))
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const scripts = packageJson.scripts ?? {}
const missingChecks = policy.requiredChecks.filter((check) => !scripts[check])

if (missingChecks.length > 0) {
  console.error(`Harness policy references missing npm scripts: ${missingChecks.join(', ')}`)
  process.exit(1)
}

if (!Array.isArray(policy.allowedProductPaths) || policy.allowedProductPaths.length === 0) {
  console.error('Harness policy must define at least one allowedProductPaths entry.')
  process.exit(1)
}

if (!Number.isInteger(policy.maxIterations) || policy.maxIterations < 1 || policy.maxIterations > 3) {
  console.error('Harness policy maxIterations must be an integer between 1 and 3.')
  process.exit(1)
}

const agents = JSON.parse(readFileSync(resolve(root, '.harness/agents.json'), 'utf8'))
if (!agents.providers || typeof agents.providers !== 'object') {
  console.error('Harness agents must define a providers object.')
  process.exit(1)
}
for (const [provider, config] of Object.entries(agents.providers)) {
  if (!config || typeof config.command !== 'string' || !config.command.trim() || !Array.isArray(config.args)) {
    console.error(`Harness provider ${provider} must define a command and args array.`)
    process.exit(1)
  }
}
for (const name of ['planner', 'coder', 'tester', 'reviewer']) {
  if (!agents[name] || !['internal', 'external'].includes(agents[name].mode)) {
    console.error(`Harness agent ${name} must declare mode internal or external.`)
    process.exit(1)
  }
}

const agentFiles = requiredFiles.filter((file) => file.endsWith('.agent.md'))
for (const file of agentFiles) {
  const content = readFileSync(resolve(root, file), 'utf8')
  for (const field of ['name:', 'description:', 'tools:']) {
    if (!content.includes(field)) {
      console.error(`${file} is missing frontmatter field ${field}`)
      process.exit(1)
    }
  }
}

console.log(`Harness configuration verified: ${requiredFiles.length} files, ${policy.requiredChecks.length} gates`)
