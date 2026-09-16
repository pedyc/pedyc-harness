import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { detectPackageManager, presetPackageName, resolvePresets } from '@pedyc/harness-core'
import type { HarnessConfigError, ResolvedPreset } from '@pedyc/harness-core/contracts'

/**
 * There is no table of known presets here, and that is the point: `vue` expands
 * to `@pedyc/harness-preset-vue` by convention, and anything containing a slash
 * is already a package name, so a team or third-party preset works as soon as it
 * is installed. A list in the CLI would have to be republished for every preset
 * that ever exists.
 */
export { presetPackageName }

export type PresetsResult =
  | { ok: true; presets: ResolvedPreset[] }
  | { ok: false; errors: HarnessConfigError[] }

export const resolveProjectPresets = (root: string, requested: string[]): PresetsResult =>
  resolvePresets(root, requested)

/** True when the only thing wrong is that the package has not been installed yet. */
export const isMissingPreset = (errors: HarnessConfigError[]): boolean =>
  errors.length > 0 && errors.every(({ code }) => code === 'preset_not_installed')

/**
 * Installs one preset package into the project.
 *
 * `init` installs only what is actually missing, so a project that already has
 * the preset on disk — the common case when re-running `init`, and the case in
 * every example and test — never reaches the network.
 */
export const installPreset = (root: string, packageName: string): boolean => {
  const { name, command } = detectPackageManager(root)
  const args = name === 'npm'
    ? ['install', '--save-dev', packageName]
    : name === 'yarn' ? ['add', '--dev', packageName] : ['add', '--save-dev', packageName]
  console.log(`Installing ${packageName} with ${name}...`)
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false })
  if (result.error) {
    console.error(`Could not run ${command} ${args.join(' ')}: ${result.error.message}`)
    return false
  }
  return result.status === 0
}

/**
 * Reads the instructions the presets provide, most specific last.
 *
 * A preset is a data package, so its instructions are a file it ships rather
 * than a string it exports. The last preset that provides one wins, matching how
 * a policy document is chosen.
 */
export const readPresetInstruction = (presets: ResolvedPreset[]): string | null => {
  for (const preset of [...presets].reverse()) {
    const path = preset.manifest.instruction
    if (path === undefined) continue
    try {
      return readFileSync(join(preset.directory, path), 'utf8')
    } catch (error) {
      console.error(`Could not read ${preset.packageName}/${path}: ${error instanceof Error ? error.message : 'unknown error'}`)
      return null
    }
  }
  return null
}
