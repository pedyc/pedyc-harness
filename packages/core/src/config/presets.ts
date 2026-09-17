import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { bundledSchemaFile, bundledValidator, fieldOf } from './bundled.js'
import { configError } from './errors.js'
import type { HarnessConfigError, PresetManifest, ResolvedPreset } from '../contracts/index.js'

/** The document a preset package exposes so the resolver can find it. */
export const presetDocument = 'preset.json'

/** The bundled schema every preset manifest is validated against. */
export const presetSchema = 'preset.schema.json'

/**
 * The fields of a preset manifest that name a file inside the package.
 *
 * `entry` and `verification` are validated even though no runtime consumes them
 * yet: a declared document that the package does not contain is a broken preset
 * either way, and resolving it early keeps the failure next to the manifest.
 */
const pathFields = ['policy', 'agents', 'instruction', 'entry', 'verification'] as const

export type PresetsResult =
  | { ok: true; presets: ResolvedPreset[] }
  | { ok: false; errors: HarnessConfigError[] }

const describe = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error')

/**
 * Expands the short name a user types into a package name.
 *
 * `vue` means `@pedyc/harness-preset-vue`. The rule is what removes the CLI's
 * hardcoded table: a name containing a slash is already a package name and is
 * taken verbatim, so a team or third-party preset is usable the moment it is
 * installed, without an entry in any list this repository ships.
 */
export const presetPackageName = (name: string): string =>
  name.includes('/') ? name : `@pedyc/harness-preset-${name}`

/**
 * Resolves a path a preset declares inside its own package.
 *
 * Returns the POSIX path relative to the package, or `null` when it escapes.
 * A preset is a dependency like any other, so it may only point at its own
 * files: a committed package must not be able to read anything the process can.
 */
const withinPackage = (directory: string, path: string): string | null => {
  if (isAbsolute(path)) return null
  const offset = relative(directory, resolve(directory, path))
  if (!offset || offset.startsWith('..') || isAbsolute(offset)) return null
  return offset.split(sep).join('/')
}

/**
 * Finds the directory an installed package occupies.
 *
 * Used only to explain a failed resolution: `require.resolve` is what decides
 * whether a package can be loaded, but when it fails the caller needs to know
 * whether the package is missing or merely does not expose `preset.json`.
 */
const installedDirectory = (
  resolveFrom: ReturnType<typeof createRequire>,
  root: string,
  packageName: string,
): string | null => {
  const bases = [...(resolveFrom.resolve.paths(packageName) ?? []), join(root, 'node_modules')]
  for (const base of bases) {
    const directory = join(base, packageName)
    if (existsSync(join(directory, 'package.json'))) return directory
  }
  return null
}

const notInstalled = (packageName: string, requiredBy?: string): HarnessConfigError =>
  configError(
    'preset_not_installed',
    packageName,
    `Preset ${packageName} is not installed${requiredBy ? `, but ${requiredBy} requires it` : ''}. ` +
      `Install it with your package manager, for example: npm install --save-dev ${packageName}`,
  )

interface Located {
  directory: string
  manifest: PresetManifest
}

type LocatedResult = { value: Located } | { errors: HarnessConfigError[] }

/** Locates one preset package, reads its manifest and checks the paths it declares. */
const locate = (
  root: string,
  resolveFrom: ReturnType<typeof createRequire>,
  packageName: string,
  requiredBy?: string,
): LocatedResult => {
  const file = `${packageName}/${presetDocument}`
  const specifier = `${packageName}/${presetDocument}`

  let path: string
  try {
    path = resolveFrom.resolve(specifier)
  } catch {
    return installedDirectory(resolveFrom, root, packageName)
      ? {
          errors: [configError(
            'preset_manifest_unreadable',
            file,
            `${packageName} is installed but does not expose ${presetDocument}. Add "./${presetDocument}": "./${presetDocument}" to its package.json "exports", then reinstall it.`,
          )],
        }
      : { errors: [notInstalled(packageName, requiredBy)] }
  }

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    return { errors: [configError('preset_manifest_unreadable', file, `${presetDocument} could not be read: ${describe(error)}`)] }
  }

  let document: unknown
  try {
    document = JSON.parse(raw)
  } catch (error) {
    return { errors: [configError('preset_manifest_invalid_json', file, `${presetDocument} is not valid JSON: ${describe(error)}`)] }
  }

  let validate: ReturnType<typeof bundledValidator>
  try {
    validate = bundledValidator(presetSchema)
  } catch (error) {
    return {
      errors: [configError(
        'harness_schema_unreadable',
        bundledSchemaFile(presetSchema),
        `The bundled preset schema could not be loaded, so the installation is incomplete: ${describe(error)}`,
      )],
    }
  }

  if (!validate(document)) {
    return {
      errors: (validate.errors ?? []).map((error) =>
        configError('preset_manifest_invalid', file, error.message ?? 'is invalid', fieldOf(error))),
    }
  }

  const manifest = document as PresetManifest
  if (manifest.name !== packageName) {
    return {
      errors: [configError(
        'preset_manifest_invalid',
        file,
        `name is '${manifest.name}', but the package it was read from is '${packageName}'. They must match.`,
        'name',
      )],
    }
  }

  const directory = dirname(path)
  const errors: HarnessConfigError[] = []
  const declared: [string, string][] = []
  for (const field of pathFields) {
    const value = manifest[field]
    if (value !== undefined) declared.push([field, value])
  }
  for (const rule of manifest.rules ?? []) declared.push(['rules', rule])

  for (const [field, value] of declared) {
    const resolved = withinPackage(directory, value)
    if (!resolved) {
      errors.push(configError(
        'preset_path_outside_package',
        file,
        `${field} must point at a file inside the preset package; '${value}' does not.`,
        field,
      ))
      continue
    }
    if (!existsSync(join(directory, resolved))) {
      errors.push(configError(
        'config_file_missing',
        file,
        `${field} points at '${value}', which the package does not contain.`,
        field,
      ))
    }
  }

  return errors.length > 0 ? { errors } : { value: { directory, manifest } }
}

/**
 * Resolves preset packages and their inheritance into one ordered list.
 *
 * The walk is a depth-first post-order traversal, which gives three properties at
 * once: a preset is loaded once no matter how many chains reach it, dependencies
 * come before the presets that inherit from them, and re-entering a package that
 * is still on the stack is a cycle rather than infinite recursion — the error
 * then names the whole loop, because "A → B → A" is what tells a reader which
 * `extends` to remove.
 */
export const resolvePresets = (root: string, requested: string[]): PresetsResult => {
  if (requested.length === 0) return { ok: true, presets: [] }

  const resolveFrom = createRequire(join(root, 'package.json'))
  const done = new Map<string, ResolvedPreset>()
  const order: ResolvedPreset[] = []
  const stack: string[] = []

  const visit = (packageName: string, requiredBy?: string): HarnessConfigError[] => {
    if (done.has(packageName)) return []

    const entered = stack.indexOf(packageName)
    if (entered >= 0) {
      const loop = [...stack.slice(entered), packageName].join(' → ')
      return [configError(
        'preset_cyclic',
        packageName,
        `Cyclic preset dependency: ${loop}. A preset cannot inherit from itself, directly or through another preset.`,
      )]
    }

    const located = locate(root, resolveFrom, packageName, requiredBy)
    if ('errors' in located) return located.errors

    stack.push(packageName)
    for (const parent of located.value.manifest.extends ?? []) {
      const errors = visit(presetPackageName(parent), packageName)
      if (errors.length > 0) return errors
    }
    stack.pop()

    const preset: ResolvedPreset = {
      packageName,
      name: located.value.manifest.name,
      directory: located.value.directory,
      extends: [...new Set((located.value.manifest.extends ?? []).map(presetPackageName))],
      manifest: located.value.manifest,
    }
    done.set(packageName, preset)
    order.push(preset)
    return []
  }

  for (const name of requested) {
    const errors = visit(presetPackageName(name))
    if (errors.length > 0) return { ok: false, errors }
  }

  return { ok: true, presets: order }
}

/** How a preset's document is named in an error or in `doctor`. */
export const presetFile = (preset: ResolvedPreset, path: string): string =>
  `${preset.packageName}/${path.split(sep).join('/')}`
