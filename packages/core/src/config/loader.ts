import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { agentProblems } from './agents.js'
import { defaultAgents, defaultPolicy } from './defaults.js'
import { configError } from './errors.js'
import { policyProblems } from './policy.js'
import { manifestFile, manifestPath, readManifest } from './manifest.js'
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
} from '../contracts/index.js'

/** The governance directory inside a target project. */
export const harnessDirectory = '.harness'

const describe = (error: unknown): string => error instanceof Error ? error.message : 'unknown error'

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

const readDocument = (root: string, file: string): DocumentResult => {
  let raw: string
  try {
    raw = readFileSync(join(root, file), 'utf8')
  } catch (error) {
    return { errors: [configError('config_file_unreadable', file, `The file could not be read: ${describe(error)}`)] }
  }
  try {
    return { value: JSON.parse(raw) }
  } catch (error) {
    return { errors: [configError('config_file_invalid_json', file, `The file is not valid JSON: ${describe(error)}`)] }
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

/**
 * Reads the policy a run should start from.
 *
 * Precedence is source selection, not field merging: a manifest-declared
 * document, then the conventional file, then the built-in defaults. Which value
 * wins when two sources both declare the same field is a separate question that
 * the merge layer owns.
 */
const resolvePolicy = (
  root: string,
  manifest: HarnessManifest | null,
): Resolved<Policy> | { errors: HarnessConfigError[] } => {
  const declared = manifest?.policy

  if (typeof declared === 'string') {
    const file = insideHarness(root, declared)
    if (!file) {
      return { errors: [configError('config_path_outside_harness', manifestFile, `policy must point at a file inside ${harnessDirectory}/; '${declared}' does not.`, 'policy')] }
    }
    if (!existsSync(join(root, file))) {
      return { errors: [configError('config_file_missing', manifestFile, `policy points at ${file}, which does not exist.`, 'policy')] }
    }
    const document = readDocument(root, file)
    if ('errors' in document) return document
    const problems = policyProblems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', file) }
    return { value: document.value as Policy, source: { kind: 'policy', location: file, active: true } }
  }

  if (declared !== undefined) {
    const problems = policyProblems(declared)
    if (problems.length) return { errors: problemsToErrors(problems, 'manifest_invalid', manifestFile, 'policy') }
    return {
      value: declared as Policy,
      source: { kind: 'policy', location: `${manifestFile} (inline)`, active: true },
    }
  }

  const conventional = `${harnessDirectory}/policy.json`
  if (existsSync(join(root, conventional))) {
    const document = readDocument(root, conventional)
    if ('errors' in document) return document
    const problems = policyProblems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', conventional) }
    return { value: document.value as Policy, source: { kind: 'policy', location: conventional, active: true } }
  }

  return { value: defaultPolicy(), source: { kind: 'policy', location: 'built-in defaults', active: true } }
}

/** Reads the agent routing a run should start from. Mirrors `resolvePolicy`. */
const resolveAgents = (
  root: string,
  manifest: HarnessManifest | null,
): Resolved<AgentsConfig> | { errors: HarnessConfigError[] } => {
  const declared = manifest?.agents

  if (typeof declared === 'string') {
    const file = insideHarness(root, declared)
    if (!file) {
      return { errors: [configError('config_path_outside_harness', manifestFile, `agents must point at a file inside ${harnessDirectory}/; '${declared}' does not.`, 'agents')] }
    }
    if (!existsSync(join(root, file))) {
      return { errors: [configError('config_file_missing', manifestFile, `agents points at ${file}, which does not exist.`, 'agents')] }
    }
    const document = readDocument(root, file)
    if ('errors' in document) return document
    const problems = agentProblems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', file) }
    return { value: document.value as AgentsConfig, source: { kind: 'agents', location: file, active: true } }
  }

  if (declared !== undefined) {
    const problems = agentProblems(declared)
    if (problems.length) return { errors: problemsToErrors(problems, 'manifest_invalid', manifestFile, 'agents') }
    return {
      value: declared as AgentsConfig,
      source: { kind: 'agents', location: `${manifestFile} (inline)`, active: true },
    }
  }

  const conventional = `${harnessDirectory}/agents.json`
  if (existsSync(join(root, conventional))) {
    const document = readDocument(root, conventional)
    if ('errors' in document) return document
    const problems = agentProblems(document.value)
    if (problems.length) return { errors: problemsToErrors(problems, 'config_file_invalid', conventional) }
    return { value: document.value as AgentsConfig, source: { kind: 'agents', location: conventional, active: true } }
  }

  return { value: defaultAgents(), source: { kind: 'agents', location: 'built-in defaults', active: true } }
}

/**
 * Records the sources the manifest declares but no runtime consumes yet.
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

  for (const preset of manifest.presets ?? []) {
    sources.push({ kind: 'preset', location: preset, active: false })
  }

  if (manifest.verification !== undefined) {
    const file = insideHarness(root, manifest.verification)
    if (!file) {
      errors.push(configError('config_path_outside_harness', manifestFile, `verification must point at a file inside ${harnessDirectory}/; '${manifest.verification}' does not.`, 'verification'))
    } else {
      sources.push({ kind: 'verification', location: file, active: false })
    }
  }

  for (const rule of manifest.rules ?? []) {
    const file = insideHarness(root, rule)
    if (!file) {
      errors.push(configError('config_path_outside_harness', manifestFile, `rules must point at a file inside ${harnessDirectory}/; '${rule}' does not.`, 'rules'))
      continue
    }
    sources.push({ kind: 'rules', location: file, active: false })
  }

  return errors.length > 0 ? { errors } : { sources }
}

/**
 * Turns a project's configuration documents into one validated input.
 *
 * Two layouts are supported. A project with `.harness/harness.json` declares its
 * sources through the manifest; a project without one keeps reading
 * `.harness/policy.json` and `.harness/agents.json`, because migrating to the
 * manifest is meant to be incremental rather than a flag day.
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

  if (manifest) {
    const declared = recordDeclaredSources(root, manifest)
    if ('errors' in declared) return { ok: false, errors: declared.errors }
    sources.push(...declared.sources)
  }

  const policy = resolvePolicy(root, manifest)
  if ('errors' in policy) return { ok: false, errors: policy.errors }

  const agents = resolveAgents(root, manifest)
  if ('errors' in agents) return { ok: false, errors: agents.errors }

  // Reported in the order a reader resolves them: the entry point, then the
  // sources it declares, then the values that were actually read.
  const ordered: ConfigSource[] = [
    ...sources.filter(({ kind }) => kind === 'manifest'),
    policy.source,
    agents.source,
    ...sources.filter(({ kind }) => kind !== 'manifest'),
  ]

  const config: LoadedHarnessConfig = {
    root,
    manifest,
    policy: policy.value,
    agents: agents.value,
    sources: ordered,
  }
  return { ok: true, config }
}
