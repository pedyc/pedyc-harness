import type { AgentsConfig } from './agent.js'
import type { Policy } from './policy.js'

/**
 * The `.harness/harness.json` manifest.
 *
 * It is the entry point that answers "which configuration does this project
 * load", not the whole configuration. A field that points at another document
 * is a path relative to `.harness/`; the same field may also carry the document
 * inline. `verification` and `rules` are accepted and reported, but no runtime
 * consumes them yet.
 */
export interface HarnessManifest {
  version: number
  /** Preset package names. Versions belong to `package.json` and the lockfile. */
  presets?: string[]
  policy?: Policy | string
  agents?: AgentsConfig | string
  verification?: string
  rules?: string[]
}

/**
 * Why a configuration document could not be turned into runtime input.
 *
 * The codes are stable so CI can branch on them without parsing prose.
 */
export type ConfigErrorCode =
  | 'harness_directory_missing'
  | 'harness_schema_unreadable'
  | 'manifest_invalid_json'
  | 'manifest_unreadable'
  | 'manifest_invalid'
  | 'config_file_missing'
  | 'config_file_unreadable'
  | 'config_file_invalid_json'
  | 'config_file_invalid'
  | 'config_path_outside_harness'

/**
 * A configuration problem found before any stage runs.
 *
 * `file` and `field` are what make the error actionable: the acceptance rule is
 * that a bad configuration names both the document and the field inside it.
 */
export interface HarnessConfigError {
  code: ConfigErrorCode
  /** Repository-relative path of the offending document. */
  file: string
  /** Dot path inside that document, when a single field is at fault. */
  field?: string
  message: string
}

/** One document, or set of built-in defaults, that a value was read from. */
export interface ConfigSource {
  kind: 'manifest' | 'policy' | 'agents' | 'preset' | 'verification' | 'rules'
  /** Repository-relative path, or a description when no file backs the value. */
  location: string
  /** False when the manifest declares the source but no runtime consumes it yet. */
  active: boolean
}

/** The configuration a run starts from, plus where each part came from. */
export interface LoadedHarnessConfig {
  root: string
  manifest: HarnessManifest | null
  policy: Policy
  agents: AgentsConfig
  sources: ConfigSource[]
}

/**
 * Config loading either yields a complete configuration or a list of problems.
 *
 * A partial result is never returned: the acceptance rule is that a bad
 * configuration fails before execution rather than midway through a run.
 */
export type LoadConfigResult =
  | { ok: true; config: LoadedHarnessConfig }
  | { ok: false; errors: HarnessConfigError[] }
