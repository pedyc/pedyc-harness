// The configuration layer.
//
// Everything that touches a project's configuration documents lives here, so
// the runtime only ever receives values that have already been read, checked and
// resolved. Dependencies point one way: `runtime` may import `config`, never the
// reverse, and `contracts` stays free of both file system access and side
// effects.

export { agentProblems, independenceOf, validateAgents } from './agents.js'
export { analyzerDeclarations } from './analyzers.js'
export type { AnalyzerDeclaration } from './analyzers.js'
export { bundledSchemaFile, bundledValidator, fieldOf } from './bundled.js'
export { mergeChecks, verificationProblems } from './checks.js'
export type { CheckConflict, CheckSource, CollectedChecks } from './checks.js'
export { defaultAgents, defaultPolicy } from './defaults.js'
export { configError, formatConfigError } from './errors.js'
export { asRecord } from './json.js'
export type { ConfigProblem } from './json.js'
export { harnessDirectory, loadHarnessConfig } from './loader.js'
export { manifestFile, manifestPath, readManifest } from './manifest.js'
export type { ManifestResult } from './manifest.js'
export { policyProblems, validatePolicy } from './policy.js'
export {
  actionAtLeast,
  analyzerTarget,
  builtInRules,
  defaultActionFor,
  effectiveRules,
  isKnownAnalyzer,
  isKnownRule,
  knownRule,
  severityAtLeast,
  stricterAction,
  stricterSeverity,
} from './rules.js'
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
