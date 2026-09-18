import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { agentProblems } from './agents.js'
import { defaultAgents, defaultPolicy } from './defaults.js'
import { configError } from './errors.js'
import { policyProblems } from './policy.js'
import { manifestFile, manifestPath, readManifest } from './manifest.js'
import { presetFile, resolvePresets } from './presets.js'
import type { ConfigProblem } from './json.js'
import type {
  AgentsConfig,
  ConfigErrorCode,
  ConfigSource,
  HarnessConfigError,
  HarnessManifest,
  LoadConfigResult,
  LoadedHarnessConfig,
  Policy,
  ResolvedPreset,
} from '../contracts/index.js'

/** The governance directory inside a target project. */
export const harnessDirectory = '.harness'

const describe = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error')

/**
 * Resolves a manifest path and proves it stays inside `.harness/`.
 *
 * A manifest may only point at documents that belong to this project's
 * governance definition. Letting it escape would make a committed configuration
 * file able to pull in anything the process can read, and a preset is held to
 * the same rule inside its own package.
 *
 * Returns the repository-relative POSIX path, or `null` when the path escapes.
 */
const insideHarness = (root: string, path: string): string | null => {
  if (isAbsolute(path)) return null
  const harnessRoot = join(root, harnessDirectory)
  const offset = relative(harnessRoot, resolve(harnessRoot, path))
  if (!offset || offset.startsWith('..') || isAbsolute(offset)) return null
  return `${harnessDirectory}/${offset.split(sep).join('/')}`
}

type DocumentResult = { value: unknown } | { errors: HarnessConfigError[] }

/**
 * Reads one JSON document.
 *
 * `label` is what an error names: a project document is named by its
 * repository-relative path, and a preset's document by its package-qualified one,
 * because the two live in different places and a reader has to be able to open
 * what the message points at.
 */
const readDocument = (base: string, path: string, label = path): DocumentResult => {
  let raw: string
  try {
    raw = readFileSync(join(base, path), 'utf8')
  } catch (error) {
    return { errors: [configError('config_file_unreadable', label, `The file could not be read: ${describe(error)}`)] }
  }
  try {
    return { value: JSON.parse(raw) }
  } catch (error) {
    return { errors: [configError('config_file_invalid_json', label, `The file is not valid JSON: ${describe(error)}`)] }
  }
}

interface Resolved<T> {
  value: T
  source: ConfigSource
}

const problemsToErrors = (
  problems: ConfigProblem[],
  code: ConfigErrorCode,
  file: string,
  prefix?: string,
): HarnessConfigError[] =>
  problems.map(({ field, message }) =>
    configError(code, file, message, prefix && field ? `${prefix}.${field}` : field))

/** The parts that differ between reading a policy and reading an agent routing. */
interface DocumentKind<T> {
  kind: 'policy' | 'agents'
  problems: (value: unknown) => ConfigProblem[]
  fallback: () => T
}

/**
 * Reads one configuration document.
 *
 * Precedence is source selection, not field merging: a manifest-declared
 * document, then the project's conventional file, then the presets, then the
 * built-in defaults. A project's own document outranks its presets because it is
 * a statement about this project while a preset is a statement about its stack;
 * among presets the last one wins, and the resolver returns them dependencies
 * first, so a preset that extends another overrides it.
 *
 * Which value wins when two sources both declare the same field is a separate
 * question that the merge layer (M17) owns.
 */
const resolveDocument = <T>(
  root: string,
  manifest: HarnessManifest | null,
  presets: ResolvedPreset[],
  kind: DocumentKind<T>,
): Resolved<T> | { errors: HarnessConfigError[] } => {
  const declared: unknown = manifest?.[kind.kind]

  if (typeof declared === 'string') {
    const file = insideHarness(root, declared)
    if (!file) {
      return { errors: [configError('config_path_outside_harness', manifestFile, `${kind.kind} must point at a file inside ${harnessDirectory}/; '${declared}' does not.`, kind.kind)] }
    }
    if (!existsSync(join(root, file))) {
      return { errors: [configError('config_file_missing', manifestFile, `${kind.kind} points at ${file}, which does not exist.`, kind.kind)] }
    }
    const document = readDocument(root, file)
    if ('errors' in document) return document
    const problems = kind.problems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', file) }
    return { value: document.value as T, source: { kind: kind.kind, location: file, active: true } }
  }

  if (declared !== undefined) {
    const problems = kind.problems(declared)
    if (problems.length) return { errors: problemsToErrors(problems, 'manifest_invalid', manifestFile, kind.kind) }
    return {
      value: declared as T,
      source: { kind: kind.kind, location: `${manifestFile} (inline)`, active: true },
    }
  }

  const conventional = `${harnessDirectory}/${kind.kind}.json`
  if (existsSync(join(root, conventional))) {
    const document = readDocument(root, conventional)
    if ('errors' in document) return document
    const problems = kind.problems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', conventional) }
    return { value: document.value as T, source: { kind: kind.kind, location: conventional, active: true } }
  }

  for (const preset of [...presets].reverse()) {
    const path = preset.manifest[kind.kind]
    if (path === undefined) continue
    const label = presetFile(preset, path)
    const document = readDocument(preset.directory, path, label)
    if ('errors' in document) return document
    const problems = kind.problems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', label) }
    return { value: document.value as T, source: { kind: kind.kind, location: label, active: true } }
  }

  return { value: kind.fallback(), source: { kind: kind.kind, location: 'built-in defaults', active: true } }
}

const policyKind: DocumentKind<Policy> = {
  kind: 'policy',
  problems: policyProblems,
  fallback: defaultPolicy,
}

const agentsKind: DocumentKind<AgentsConfig> = {
  kind: 'agents',
  problems: agentProblems,
  fallback: defaultAgents,
}

/**
 * Records the manifest's remaining sources: the ones no runtime consumes yet.
 *
 * Reporting them keeps `doctor` honest: a declared document that is silently
 * ignored is the same failure mode as a fallback that never says it fell back.
 */
const recordDeclaredSources = (
  root: string,
  manifest: HarnessManifest,
): { sources: ConfigSource[] } | { errors: HarnessConfigError[] } => {
  const sources: ConfigSource[] = []
  const errors: HarnessConfigError[] = []

  if (manifest.verification !== undefined) {
    const file = insideHarness(root, manifest.verification)
    if (!file) {
      errors.push(configError('config_path_outside_harness', manifestFile, `verification must point at a file inside ${harnessDirectory}/; '${manifest.verification}' does not.`, 'verification'))
    } else {
      sources.push({ kind: 'verification', location: file, active: false })
    }
  }

  return errors.length > 0 ? { errors } : { sources }
}

/**
 * Turns a project's configuration documents into one validated input.
 *
 * Two layouts are supported. A project with `.harness/harness.json` declares its
 * sources through the manifest, presets included; a project without one keeps
 * reading `.harness/policy.json` and `.harness/agents.json`, because migrating to
 * the manifest is meant to be incremental rather than a flag day.
 *
 * Nothing is executed before every document has been read and checked, so a bad
 * configuration fails as a structured error rather than midway through a run.
 */
export const loadHarnessConfig = (root: string): LoadConfigResult => {
  const harnessRoot = join(root, harnessDirectory)
  if (!existsSync(harnessRoot)) {
    return {
      ok: false,
      errors: [configError('harness_directory_missing', harnessDirectory, `The governance directory ${harnessDirectory}/ was not found. Run \`pedyc-harness init\` first.`)],
    }
  }

  const sources: ConfigSource[] = []
  let manifest: HarnessManifest | null = null

  if (existsSync(manifestPath(root))) {
    const result = readManifest(root)
    if (!result.ok) return { ok: false, errors: result.errors }
    manifest = result.manifest
    sources.push({ kind: 'manifest', location: manifestFile, active: true })
  }

  const resolved = resolvePresets(root, manifest?.presets ?? [])
  if (!resolved.ok) return { ok: false, errors: resolved.errors }
  const presets = resolved.presets

  if (manifest) {
    const declared = recordDeclaredSources(root, manifest)
    if ('errors' in declared) return { ok: false, errors: declared.errors }
    sources.push(...declared.sources)
  }

  const policy = resolveDocument(root, manifest, presets, policyKind)
  if ('errors' in policy) return { ok: false, errors: policy.errors }

  const agents = resolveDocument(root, manifest, presets, agentsKind)
  if ('errors' in agents) return { ok: false, errors: agents.errors }

  // Reported in the order a reader resolves them: the entry point, the values
  // that were actually read, then the declarations that produced them.
  const ordered: ConfigSource[] = [
    ...sources.filter(({ kind }) => kind === 'manifest'),
    policy.source,
    agents.source,
    ...presets.map(({ packageName }): ConfigSource => ({ kind: 'preset', location: packageName, active: true })),
    ...sources.filter(({ kind }) => kind !== 'manifest'),
  ]

  const config: LoadedHarnessConfig = {
    root,
    manifest,
    policy: policy.value,
    agents: agents.value,
    presets,
    sources: ordered,
  }
  return { ok: true, config }
}
