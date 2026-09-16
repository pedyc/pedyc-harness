import { packageScriptCommand } from '@pedyc/harness-core'
import type { PackageScriptCommand } from '@pedyc/harness-core'

// Runtime behaviour is unchanged from the untyped original; the declaration is
// only now accurate about the structured command it has always returned.
export const getVerificationCommand = (root: string, script: string): PackageScriptCommand =>
  packageScriptCommand(root, script)

export { installPreset, presetPackageName, resolveProjectPresets } from './presets.js'
export type { PresetsResult } from './presets.js'
export { runCli } from './cli.js'
export { runHarness } from './run.js'
