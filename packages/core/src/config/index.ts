// The configuration layer.
//
// Everything that touches a project's configuration documents lives here, so
// the runtime only ever receives values that have already been read, checked and
// resolved. Dependencies point one way: `runtime` may import `config`, never the
// reverse, and `contracts` stays free of both file system access and side
// effects.

export { agentProblems, validateAgents } from './agents.js'
export { bundledSchemaFile, bundledValidator, fieldOf } from './bundled.js'
export { defaultAgents, defaultPolicy } from './defaults.js'
export { configError, formatConfigError } from './errors.js'
export { asRecord } from './json.js'
export type { ConfigProblem } from './json.js'
export { harnessDirectory, loadHarnessConfig } from './loader.js'
export { manifestFile, manifestPath, readManifest } from './manifest.js'
export type { ManifestResult } from './manifest.js'
export { policyProblems, validatePolicy } from './policy.js'
export { presetDocument, presetFile, presetPackageName, presetSchema, resolvePresets } from './presets.js'
export type { PresetsResult } from './presets.js'
export {
  compileSchema,
  createAjv,
  createValidators,
  loadSchemas,
  readSchema,
  validationDetails,
} from './schema.js'
export type {
  HarnessSchemas,
  HarnessValidators,
  ResponseValidator,
  SchemaErrorFormatter,
} from './schema.js'
