import { createRequire } from 'node:module'

// Three layers, with dependencies pointing one way: `contracts/` holds pure
// types and schema compilation, `config/` owns every read of a project's
// configuration documents, and `runtime/` executes a run against values the
// config layer already resolved. See `docs/architecture/system.md`.
export type * from './contracts/index.js'
export type { ConfigProblem, ManifestResult } from './config/index.js'
export {
  agentProblems,
  asRecord,
  compileSchema,
  configError,
  createAjv,
  createValidators,
  defaultAgents,
  defaultPolicy,
  formatConfigError,
  harnessDirectory,
  loadHarnessConfig,
  loadSchemas,
  manifestFile,
  manifestPath,
  policyProblems,
  presetDocument,
  presetFile,
  presetPackageName,
  presetSchema,
  readManifest,
  readSchema,
  resolvePresets,
  validateAgents,
  validatePolicy,
  validationDetails,
} from './config/index.js'
export type {
  HarnessSchemas,
  HarnessValidators,
  PresetsResult,
  ResponseValidator,
  SchemaErrorFormatter,
} from './config/index.js'

export { detectPackageManager, packageScriptCommand } from './runtime/package-manager.js'
export type { PackageManager, PackageScriptCommand } from './runtime/package-manager.js'

export { normalizeTask, readTaskFile } from './runtime/intake.js'
export { runCommand } from './runtime/command.js'
export type { CommandResult } from './runtime/command.js'

export { changedFiles, snapshotFiles } from './runtime/diff-inspector.js'
export type { FileSnapshot } from './runtime/diff-inspector.js'

export { parseAgentResponse, validateStageResponse } from './runtime/agent.js'
export type { ParsedAgentResponse } from './runtime/agent.js'

export { findOutOfScopeChanges, isCommandAllowed } from './runtime/policy-engine.js'
export { testerApproved, reviewerApproved } from './runtime/approval-gate.js'

export { createProviderRunner } from './runtime/provider-runner.js'
export type { ProviderRunnerOptions } from './runtime/provider-runner.js'

export { runOrchestrator } from './runtime/executor.js'
export type { OrchestratorOptions } from './runtime/executor.js'

// Read from the manifest rather than repeating the literal here: a hardcoded copy silently
// kept reporting the previous release after the version was bumped.
export const harnessCoreVersion: string = createRequire(import.meta.url)('../package.json').version
