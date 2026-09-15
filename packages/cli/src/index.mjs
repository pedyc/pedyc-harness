import { packageScriptCommand } from '@pedyc/harness-core'

export const getVerificationCommand = (root, script) => packageScriptCommand(root, script)
export { availablePresets, getPreset } from './presets.mjs'
export { runCli } from './cli.mjs'
export { runHarness } from './run.mjs'
