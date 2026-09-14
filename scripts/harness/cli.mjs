#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { availablePresets, getPreset } from 'pedyc-harness'
import { detectPackageManager } from './package-manager.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const projectRoot = resolve(process.cwd())
const args = process.argv.slice(2)
const command = args[0] ?? 'help'
const valueAfter = (name, fallback = null) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? fallback : fallback
}

const schemas = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json']
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const writeIfMissing = (path, content, force) => {
  if (!force && existsSync(path)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
  return true
}

const templateFiles = (preset) => {
  const files = new Map([
    ['.harness/policy.json', `${JSON.stringify(preset.policy, null, 2)}\n`],
    ['.harness/agents.json', `${JSON.stringify(preset.agents, null, 2)}\n`],
    ['AGENTS.md', preset.instruction],
  ])
  for (const schema of schemas) {
    files.set(`.harness/${schema}`, readFileSync(join(packageRoot, '.harness', schema), 'utf8'))
  }
  return files
}

const resolvePreset = () => {
  const presetName = valueAfter('--preset', 'generic')
  const preset = getPreset(presetName)
  if (!preset) {
    console.error(`Unknown preset '${presetName}'. Available presets: ${availablePresets().join(', ')}`)
    process.exit(1)
  }
  return preset
}

const printTemplateDiff = (preset) => {
  const statuses = []
  for (const [relativePath, expected] of templateFiles(preset)) {
    const path = join(projectRoot, relativePath)
    if (!existsSync(path)) statuses.push({ relativePath, status: 'missing' })
    else if (readFileSync(path, 'utf8') === expected) statuses.push({ relativePath, status: 'unchanged' })
    else statuses.push({ relativePath, status: 'modified' })
  }
  for (const { relativePath, status } of statuses) console.log(`${status}\t${relativePath}`)
  return statuses
}

const syncTemplates = (preset, force) => {
  const statuses = printTemplateDiff(preset)
  let written = 0
  for (const { relativePath, status } of statuses) {
    if (status === 'unchanged' || (status === 'modified' && !force)) continue
    const path = join(projectRoot, relativePath)
    const content = templateFiles(preset).get(relativePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    written += 1
  }
  const skipped = statuses.filter(({ status }) => status === 'modified' && !force).length
  console.log(`Updated ${written} template file(s); skipped ${skipped} modified file(s).`)
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
  const preset = resolvePreset()
  const harnessRoot = join(projectRoot, '.harness')
  const force = args.includes('--force')
  mkdirSync(harnessRoot, { recursive: true })
  const writePresetJson = (name, value) => {
    const path = join(harnessRoot, name)
    if (force || !existsSync(path)) writeJson(path, value)
  }
  writePresetJson('policy.json', preset.policy)
  writePresetJson('agents.json', preset.agents)
  for (const schema of schemas) {
    const source = join(packageRoot, '.harness', schema)
    writeIfMissing(join(harnessRoot, schema), readFileSync(source, 'utf8'), force)
  }
  const instructionPath = join(projectRoot, 'AGENTS.md')
  writeIfMissing(instructionPath, preset.instruction, force)
  console.log(`Initialized pedyc-harness with the '${presetName}' preset in ${projectRoot}${force ? ' (forced)' : ''}`)
}

const diff = () => {
  const preset = resolvePreset()
  printTemplateDiff(preset)
}

const update = () => {
  const preset = resolvePreset()
  syncTemplates(preset, args.includes('--force'))
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
  const packageManager = detectPackageManager(projectRoot)
  console.log(`Project root: ${projectRoot}`)
  console.log(`Configuration: ${existsSync(join(projectRoot, '.harness')) ? 'found' : 'missing (.harness)'}`)
  console.log(`Package manager: ${packageManager.name}`)
  console.log(`Node.js: ${process.version}`)
} else if (command === 'diff') {
  diff()
} else if (command === 'update') {
  update()
} else {
  console.log('Usage: pedyc-harness <init|verify|run|doctor|diff|update> [options]')
  console.log('  init --preset generic|vue [--force]')
  console.log('  diff --preset generic|vue')
  console.log('  update --preset generic|vue [--force]')
  console.log('  run --input .harness/task.json [--dry-run] [--json]')
}
