import type { AgentsConfig } from './agent.js'
import type { Policy } from './policy.js'

/** What a preset looks for when deciding whether it applies to a project. */
export interface PresetDetection {
  requiredFiles: string[]
  requiredDependencies: string[]
}

/**
 * A project preset: the files `pedyc-harness init` writes into a target project
 * and the defaults it derives from them.
 *
 * The shape is declared here rather than in the preset packages so the packages
 * stay independent of each other. Presets import this as a type only, so nothing
 * is coupled at runtime.
 */
export interface Preset {
  /** The short name a user types, e.g. `generic`. */
  name: string
  /**
   * The package a project depends on, e.g. `@pedyc/harness-preset-generic`.
   *
   * This is what `init` writes into `harness.json`, because a manifest records
   * what to resolve rather than what to type. Versions never appear here: they
   * belong to `package.json` and the lockfile, so a project upgrades the same
   * way it upgrades any other dependency.
   */
  packageName: string
  detection: PresetDetection
  defaultProductPaths: string[]
  verificationScripts: string[]
  skills: string[]
  policy: Policy
  agents: AgentsConfig
  /** Written to the target project's `AGENTS.md`. */
  instruction: string
}
