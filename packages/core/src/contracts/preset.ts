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
  name: string
  detection: PresetDetection
  defaultProductPaths: string[]
  verificationScripts: string[]
  skills: string[]
  policy: Policy
  agents: AgentsConfig
  /** Written to the target project's `AGENTS.md`. */
  instruction: string
}
