import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectPackageManager, formatConfigError, loadHarnessConfig } from '@pedyc/harness-core'
import type { ConfigSource } from '@pedyc/harness-core/contracts'
import {
  installPreset,
  isMissingPreset,
  presetPackageName,
  readPresetInstruction,
  resolveProjectPresets,
} from './presets.js'
import { runHarness } from './run.js'

// Resolved from this file, which compiles to `dist/cli.js`, so `..` is the
// package root in both the workspace and a published tarball. That is why the
// entry point must stay `src/cli.ts`: a `cli/index.ts` would emit to
// `dist/cli/index.js`, where `..` resolves to `dist/` and every template read
// would fail.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = join(packageRoot, 'templates')

// Exit codes from `docs/interfaces/cli.md` §8. Only the ones this entry point can
// produce are named here; a run's own outcome codes come from `runHarness`.
const EXIT_OK = 0
const EXIT_FAILED = 1
const EXIT_CONFIG = 5

const schemaNames = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json']
const manifestSchema = 'harness.schema.json'
const manifestName = 'harness.json'
const taskExample = 'task.example.json'

const manifestPath = (root: string): string => join(root, '.harness', manifestName)

/**
 * The manifest `init` writes.
 *
 * It declares what to resolve, never how to configure: the preset package name
 * is recorded so the project's governance is reproducible from `package.json`,
 * and the policy and agent documents are left at their conventional paths rather
 * than pinned by a redundant `policy`/`agents` pointer. A project that later
 * moves or deletes those files changes one thing, not two.
 */
const manifestContent = (packageName: string): string => `${JSON.stringify({
  $schema: 'https://pedyc.dev/schema/harness.json',
  version: 1,
  presets: [packageName],
}, null, 2)}\n`

const writeIfMissing = (path: string, content: string, force: boolean): boolean => {
  if (!force && existsSync(path)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
  return true
}

/**
 * The files `init`, `diff` and `update` own.
 *
 * Only the contracts are listed. `harness.json` and `AGENTS.md` are written once
 * by `init` and belong to the project afterwards, and the policy and agent
 * documents belong to the project from the start: a preset supplies a default
 * for them through the resolver rather than a copy of itself in the tree, which
 * is what keeps the project's own edits from being overwritten on upgrade.
 */
const contractFiles = (): Map<string, string> => {
  const files = new Map([[`.harness/${taskExample}`, readFileSync(join(templatesRoot, taskExample), 'utf8')]])
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

  // Prints every configuration problem rather than the first one: a document
  // with two bad fields should be fixed in one edit, not two runs.
  const reportConfigErrors = (errors: Parameters<typeof formatConfigError>[0][]): number => {
    for (const error of errors) console.error(formatConfigError(error))
    return EXIT_CONFIG
  }

  const printTemplateDiff = (): Array<{ relativePath: string; status: string }> => {
    const statuses: Array<{ relativePath: string; status: string }> = []
    for (const [relativePath, expected] of contractFiles()) {
      const path = join(projectRoot, relativePath)
      if (!existsSync(path)) statuses.push({ relativePath, status: 'missing' })
      else if (readFileSync(path, 'utf8') === expected) statuses.push({ relativePath, status: 'unchanged' })
      else statuses.push({ relativePath, status: 'modified' })
    }
    for (const { relativePath, status } of statuses) console.log(`${status}\t${relativePath}`)
    return statuses
  }

  const syncTemplates = (force: boolean): number => {
    const statuses = printTemplateDiff()
    const files = contractFiles()
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
    const requested = valueAfter('--preset', 'generic') ?? 'generic'
    const packageName = presetPackageName(requested)
    const allowInstall = !argv.includes('--no-install')

    let resolved = resolveProjectPresets(projectRoot, [packageName])
    if (!resolved.ok && allowInstall && isMissingPreset(resolved.errors)) {
      if (!installPreset(projectRoot, packageName)) return EXIT_FAILED
      resolved = resolveProjectPresets(projectRoot, [packageName])
    }
    if (!resolved.ok) return reportConfigErrors(resolved.errors)

    const force = argv.includes('--force')
    mkdirSync(join(projectRoot, '.harness'), { recursive: true })
    const skipped: string[] = []
    for (const [relativePath, content] of contractFiles()) {
      if (!writeIfMissing(join(projectRoot, relativePath), content, force)) skipped.push(relativePath)
    }
    const manifestWritten = writeIfMissing(manifestPath(projectRoot), manifestContent(packageName), force)
    if (!manifestWritten) skipped.push(`.harness/${manifestName}`)

    const instruction = readPresetInstruction(resolved.presets)
    if (instruction !== null && !writeIfMissing(join(projectRoot, 'AGENTS.md'), instruction, force)) {
      skipped.push('AGENTS.md')
    }

    console.log(`Initialized pedyc-harness with the '${packageName}' preset in ${projectRoot}${force ? ' (forced)' : ''}`)
    // Saying what was left alone matters more than saying what was written: a
    // project that already declares presets would otherwise be told it was
    // initialized with one that was never applied.
    if (skipped.length > 0) {
      console.log(`Kept ${skipped.length} existing file(s): ${skipped.join(', ')}. Use --force to overwrite them.`)
    }
    if (!manifestWritten) {
      console.log(`The existing ${manifestName} still declares its own presets; '${packageName}' was not applied.`)
    }
    return EXIT_OK
  }

  const verify = (): number => {
    const loaded = loadHarnessConfig(projectRoot)
    if (!loaded.ok) return reportConfigErrors(loaded.errors)

    // The manifest schema is required exactly when the manifest is. A project
    // that predates `harness.json` must keep verifying unchanged, so the file
    // is not added to the set its older self was measured against.
    const required = existsSync(manifestPath(projectRoot)) ? [...schemaNames, manifestSchema] : schemaNames
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

  /**
   * Lists the presets a project follows and what each one inherits.
   *
   * Resolved through the same walk a run uses, so the list cannot drift from
   * what actually loads: an uninstalled preset is an error here rather than a
   * line, and the order is the order the resolver applies them in.
   */
  const listPresets = (): number => {
    if (!existsSync(manifestPath(projectRoot))) {
      console.log(`No .harness/harness.json in ${projectRoot}; no presets are declared.`)
      return EXIT_OK
    }
    // Listed from the same resolution a run performs, so the list cannot drift
    // from what actually loads: an uninstalled preset is an error here rather
    // than a line, and the order is the order the resolver applies them in.
    const loaded = loadHarnessConfig(projectRoot)
    if (!loaded.ok) return reportConfigErrors(loaded.errors)

    if (loaded.config.presets.length === 0) {
      console.log('No presets are declared in .harness/harness.json.')
      return EXIT_OK
    }

    const declared = new Set((loaded.config.manifest?.presets ?? []).map(presetPackageName))
    for (const preset of loaded.config.presets) {
      const origin = declared.has(preset.packageName) ? 'declared' : 'inherited'
      const inherits = preset.extends.length > 0 ? `\textends: ${preset.extends.join(', ')}` : ''
      console.log(`${preset.packageName}\t${origin}${inherits}`)
    }
    return EXIT_OK
  }

  switch (command) {
    case 'init':
      return init()
    case 'verify':
      return verify()
    case 'list-presets':
      return listPresets()
    case 'diff':
      printTemplateDiff()
      return EXIT_OK
    case 'update':
      return syncTemplates(argv.includes('--force'))
    case 'doctor':
      return doctor()
    case 'run':
      return runHarness({ argv: argv.slice(1), cwd: projectRoot })
    default:
      console.log('Usage: pedyc-harness <init|verify|run|doctor|diff|update|list-presets> [options]')
      console.log('  init [--preset generic|vue|<package>] [--force] [--no-install]')
      console.log('  list-presets')
      console.log('  diff')
      console.log('  update [--force]')
      console.log('  run --input .harness/task.json [--dry-run] [--json]')
      return command === 'help' ? EXIT_OK : EXIT_FAILED
  }
}
