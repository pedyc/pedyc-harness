import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectPackageManager, validatePolicy } from '@pedyc/harness-core'
import { availablePresets, getPreset } from './presets.mjs'
import { runHarness } from './run.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = join(packageRoot, 'templates')

const schemas = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json']
const taskExample = 'task.example.json'

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
    ['.harness/task.example.json', readFileSync(join(templatesRoot, taskExample), 'utf8')],
    ['AGENTS.md', preset.instruction],
  ])
  for (const schema of schemas) {
    files.set(`.harness/${schema}`, readFileSync(join(templatesRoot, schema), 'utf8'))
  }
  return files
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// The CLI is self-contained: it never reaches back into the Harness source
// repository, so a published tarball can run init, verify, doctor and run.
export const runCli = async ({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
} = {}) => {
  const projectRoot = resolve(cwd)
  const command = argv[0] ?? 'help'
  const valueAfter = (name, fallback = null) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] ?? fallback : fallback
  }

  const resolvePreset = () => {
    const presetName = valueAfter('--preset', 'generic')
    const preset = getPreset(presetName)
    if (!preset) {
      console.error(`Unknown preset '${presetName}'. Available presets: ${availablePresets().join(', ')}`)
      return null
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
    const files = templateFiles(preset)
    let written = 0
    for (const { relativePath, status } of statuses) {
      if (status === 'unchanged' || (status === 'modified' && !force)) continue
      const path = join(projectRoot, relativePath)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, files.get(relativePath), 'utf8')
      written += 1
    }
    const skipped = statuses.filter(({ status }) => status === 'modified' && !force).length
    console.log(`Updated ${written} template file(s); skipped ${skipped} modified file(s).`)
    return 0
  }

  const init = () => {
    const preset = resolvePreset()
    if (!preset) return 1
    const harnessRoot = join(projectRoot, '.harness')
    const force = argv.includes('--force')
    mkdirSync(harnessRoot, { recursive: true })
    const files = templateFiles(preset)
    for (const [relativePath, content] of files) {
      writeIfMissing(join(projectRoot, relativePath), content, force)
    }
    console.log(`Initialized pedyc-harness with the '${preset.name}' preset in ${projectRoot}${force ? ' (forced)' : ''}`)
    return 0
  }

  const verify = () => {
    const policyPath = join(projectRoot, '.harness', 'policy.json')
    const agentsPath = join(projectRoot, '.harness', 'agents.json')
    if (!existsSync(policyPath) || !existsSync(agentsPath)) {
      console.error('Harness configuration is incomplete. Run `pedyc-harness init` first.')
      return 1
    }
    for (const schema of schemas) {
      const schemaPath = join(projectRoot, '.harness', schema)
      if (!existsSync(schemaPath)) {
        console.error(`Harness schema is missing: .harness/${schema}`)
        return 1
      }
    }
    let policy
    let agents
    try {
      policy = readJson(policyPath)
      agents = readJson(agentsPath)
      for (const schema of schemas) readJson(join(projectRoot, '.harness', schema))
    } catch (error) {
      console.error(`Harness configuration is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`)
      return 1
    }
    const policyError = validatePolicy(policy)
    if (policyError) {
      console.error(policyError)
      return 1
    }
    if (!agents.providers || typeof agents.providers !== 'object') {
      console.error('Harness agents must define a providers object.')
      return 1
    }
    for (const [provider, config] of Object.entries(agents.providers)) {
      if (!config || typeof config.command !== 'string' || !config.command.trim() || !Array.isArray(config.args)) {
        console.error(`Harness provider ${provider} must define a command and args array.`)
        return 1
      }
    }
    for (const role of ['planner', 'coder', 'tester', 'reviewer']) {
      const config = agents[role]
      if (!config || !['internal', 'external'].includes(config.mode)) {
        console.error(`Harness agent ${role} must declare mode internal or external.`)
        return 1
      }
    }
    const packageJsonPath = join(projectRoot, 'package.json')
    if (existsSync(packageJsonPath) && Array.isArray(policy.requiredChecks)) {
      const scripts = readJson(packageJsonPath).scripts ?? {}
      const missingChecks = policy.requiredChecks.filter((check) => !scripts[check])
      if (missingChecks.length > 0) {
        console.error(`Harness policy references missing npm scripts: ${missingChecks.join(', ')}`)
        return 1
      }
    }
    const hook = join(projectRoot, '.harness', 'verify.mjs')
    if (existsSync(hook)) {
      const result = spawnSync(process.execPath, [hook, '--root', projectRoot], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false,
      })
      return result.status ?? 1
    }
    console.log('Generic Harness configuration verified.')
    return 0
  }

  const doctor = () => {
    const packageManager = detectPackageManager(projectRoot)
    console.log(`Project root: ${projectRoot}`)
    console.log(`Configuration: ${existsSync(join(projectRoot, '.harness')) ? 'found' : 'missing (.harness)'}`)
    console.log(`Package manager: ${packageManager.name}`)
    console.log(`Node.js: ${process.version}`)
    return 0
  }

  switch (command) {
    case 'init':
      return init()
    case 'verify':
      return verify()
    case 'diff': {
      const preset = resolvePreset()
      return preset ? (printTemplateDiff(preset), 0) : 1
    }
    case 'update': {
      const preset = resolvePreset()
      return preset ? syncTemplates(preset, argv.includes('--force')) : 1
    }
    case 'doctor':
      return doctor()
    case 'run':
      return runHarness({ argv: argv.slice(1), cwd: projectRoot })
    default:
      console.log('Usage: pedyc-harness <init|verify|run|doctor|diff|update> [options]')
      console.log('  init --preset generic|vue [--force]')
      console.log('  diff --preset generic|vue')
      console.log('  update --preset generic|vue [--force]')
      console.log('  run --input .harness/task.json [--dry-run] [--json]')
      return command === 'help' ? 0 : 1
  }
}
