import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectPackageManager, formatConfigError, loadHarnessConfig } from '@pedyc/harness-core'
import type { ConfigSource, Preset } from '@pedyc/harness-core/contracts'
import { availablePresets, getPreset } from './presets.js'
import { runHarness } from './run.js'

// Resolved from this file, which compiles to `dist/cli.js`, so `..` is the
// package root in both the workspace and a published tarball. That is why the
// entry point must stay `src/cli.ts`: a `cli/index.ts` would emit to
// `dist/cli/index.js`, where `..` resolves to `dist/` and every template read
// would fail.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = join(packageRoot, 'templates')

// Exit codes from `docs/CLI设计.md` §8. Only the ones this entry point can
// produce are named here; a run's own outcome codes come from `runHarness`.
const EXIT_OK = 0
const EXIT_FAILED = 1
const EXIT_CONFIG = 5

const schemaNames = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json']
const manifestSchema = 'harness.schema.json'
const manifestName = 'harness.json'
const taskExample = 'task.example.json'

/**
 * The manifest `init` writes.
 *
 * It declares what to resolve, never how to configure: the preset package name
 * is recorded so `doctor` can report which governance a project follows, and
 * the policy and agent documents are left at their conventional paths rather
 * than pinned by a redundant `policy`/`agents` pointer. A project that later
 * moves or deletes those files changes one thing, not two.
 */
const manifestContent = (preset: Preset): string => `${JSON.stringify({
  $schema: 'https://pedyc.dev/schema/harness.json',
  version: 1,
  presets: [preset.packageName],
}, null, 2)}\n`

const writeIfMissing = (path: string, content: string, force: boolean): boolean => {
  if (!force && existsSync(path)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
  return true
}

const templateFiles = (preset: Preset): Map<string, string> => {
  const files = new Map([
    [`.harness/${manifestName}`, manifestContent(preset)],
    ['.harness/policy.json', `${JSON.stringify(preset.policy, null, 2)}\n`],
    ['.harness/agents.json', `${JSON.stringify(preset.agents, null, 2)}\n`],
    ['.harness/task.example.json', readFileSync(join(templatesRoot, taskExample), 'utf8')],
    ['AGENTS.md', preset.instruction],
  ])
  for (const schema of [...schemaNames, manifestSchema]) {
    files.set(`.harness/${schema}`, readFileSync(join(templatesRoot, schema), 'utf8'))
  }
  return files
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

interface CliOptions {
  argv?: string[]
  cwd?: string
}

// The CLI is self-contained: it never reaches back into the Harness source
// repository, so a published tarball can run init, verify, doctor and run.
export const runCli = async ({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
}: CliOptions = {}): Promise<number> => {
  const projectRoot = resolve(cwd)
  const command = argv[0] ?? 'help'
  const valueAfter = (name: string, fallback: string | null = null): string | null => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] ?? fallback : fallback
  }

  const resolvePreset = (): Preset | null => {
    const presetName = valueAfter('--preset', 'generic') ?? 'generic'
    const preset = getPreset(presetName)
    if (!preset) {
      console.error(`Unknown preset '${presetName}'. Available presets: ${availablePresets().join(', ')}`)
      return null
    }
    return preset
  }

  const printTemplateDiff = (preset: Preset): Array<{ relativePath: string; status: string }> => {
    const statuses: Array<{ relativePath: string; status: string }> = []
    for (const [relativePath, expected] of templateFiles(preset)) {
      const path = join(projectRoot, relativePath)
      if (!existsSync(path)) statuses.push({ relativePath, status: 'missing' })
      else if (readFileSync(path, 'utf8') === expected) statuses.push({ relativePath, status: 'unchanged' })
      else statuses.push({ relativePath, status: 'modified' })
    }
    for (const { relativePath, status } of statuses) console.log(`${status}\t${relativePath}`)
    return statuses
  }

  const syncTemplates = (preset: Preset, force: boolean): number => {
    const statuses = printTemplateDiff(preset)
    const files = templateFiles(preset)
    let written = 0
    for (const { relativePath, status } of statuses) {
      if (status === 'unchanged' || (status === 'modified' && !force)) continue
      const path = join(projectRoot, relativePath)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, files.get(relativePath) as string, 'utf8')
      written += 1
    }
    const skipped = statuses.filter(({ status }) => status === 'modified' && !force).length
    console.log(`Updated ${written} template file(s); skipped ${skipped} modified file(s).`)
    return EXIT_OK
  }

  const init = (): number => {
    const preset = resolvePreset()
    if (!preset) return EXIT_FAILED
    const harnessRoot = join(projectRoot, '.harness')
    const force = argv.includes('--force')
    mkdirSync(harnessRoot, { recursive: true })
    const files = templateFiles(preset)
    for (const [relativePath, content] of files) {
      writeIfMissing(join(projectRoot, relativePath), content, force)
    }
    console.log(`Initialized pedyc-harness with the '${preset.name}' preset in ${projectRoot}${force ? ' (forced)' : ''}`)
    return EXIT_OK
  }

  // Prints every configuration problem rather than the first one: a document
  // with two bad fields should be fixed in one edit, not two runs.
  const reportConfigErrors = (errors: Parameters<typeof formatConfigError>[0][]): number => {
    for (const error of errors) console.error(formatConfigError(error))
    return EXIT_CONFIG
  }

  const verify = (): number => {
    const loaded = loadHarnessConfig(projectRoot)
    if (!loaded.ok) return reportConfigErrors(loaded.errors)

    // The manifest schema is required exactly when the manifest is. A project
    // that predates `harness.json` must keep verifying unchanged, so the file
    // is not added to the set its older self was measured against.
    const required = existsSync(join(projectRoot, '.harness', manifestName))
      ? [...schemaNames, manifestSchema]
      : schemaNames
    for (const schema of required) {
      const schemaPath = join(projectRoot, '.harness', schema)
      if (!existsSync(schemaPath)) {
        console.error(`Harness schema is missing: .harness/${schema}`)
        return EXIT_CONFIG
      }
      try {
        readJson(schemaPath)
      } catch (error) {
        console.error(`Harness schema .harness/${schema} is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`)
        return EXIT_CONFIG
      }
    }

    const requiredChecks = loaded.config.policy.requiredChecks
    const packageJsonPath = join(projectRoot, 'package.json')
    if (existsSync(packageJsonPath) && Array.isArray(requiredChecks)) {
      const manifest = readJson(packageJsonPath) as { scripts?: Record<string, string> }
      const scripts = manifest.scripts ?? {}
      const missingChecks = requiredChecks.filter((check) => !scripts[check])
      if (missingChecks.length > 0) {
        console.error(`Harness policy references missing npm scripts: ${missingChecks.join(', ')}`)
        // A gate that names a script which does not exist is a configuration
        // problem, not a failed run: it can be seen without running anything.
        return EXIT_CONFIG
      }
    }
    const hook = join(projectRoot, '.harness', 'verify.mjs')
    if (existsSync(hook)) {
      const result = spawnSync(process.execPath, [hook, '--root', projectRoot], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false,
      })
      return result.status ?? EXIT_FAILED
    }
    console.log('Generic Harness configuration verified.')
    return EXIT_OK
  }

  const describeSource = ({ kind, location, active }: ConfigSource): string =>
    `${kind}\t${location}${active ? '' : '\t(declared, not yet consumed)'}`

  const doctor = (): number => {
    const packageManager = detectPackageManager(projectRoot)
    console.log(`Project root: ${projectRoot}`)
    console.log(`Configuration: ${existsSync(join(projectRoot, '.harness')) ? 'found' : 'missing (.harness)'}`)
    console.log(`Package manager: ${packageManager.name}`)
    console.log(`Node.js: ${process.version}`)

    // Reporting the sources is the point of `doctor`: which values a run will
    // actually use is otherwise invisible, and a fallback to built-in defaults
    // would look the same as a deliberate configuration.
    const loaded = loadHarnessConfig(projectRoot)
    if (!loaded.ok) return reportConfigErrors(loaded.errors)

    console.log('Configuration sources:')
    for (const source of loaded.config.sources) console.log(`  ${describeSource(source)}`)
    return EXIT_OK
  }

  switch (command) {
    case 'init':
      return init()
    case 'verify':
      return verify()
    case 'diff': {
      const preset = resolvePreset()
      if (!preset) return EXIT_FAILED
      printTemplateDiff(preset)
      return EXIT_OK
    }
    case 'update': {
      const preset = resolvePreset()
      return preset ? syncTemplates(preset, argv.includes('--force')) : EXIT_FAILED
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
      return command === 'help' ? EXIT_OK : EXIT_FAILED
  }
}
