import { createRequire } from 'node:module'

export type * from './contracts/index.js'

export { detectPackageManager, packageScriptCommand } from './core/package-manager.js'
export type { PackageManager, PackageScriptCommand } from './core/package-manager.js'

export { normalizeTask, readTaskFile } from './core/intake.js'
export { runCommand } from './core/command.js'
export type { CommandResult } from './core/command.js'

export { changedFiles, snapshotFiles } from './core/diff-inspector.js'
export type { FileSnapshot } from './core/diff-inspector.js'

export { loadSchemas, createValidators, validationDetails } from './core/validator.js'
export type {
  HarnessSchemas,
  HarnessValidators,
  ResponseValidator,
  SchemaErrorFormatter,
} from './core/validator.js'

export { parseAgentResponse, validateStageResponse } from './core/agent.js'
export type { ParsedAgentResponse } from './core/agent.js'

export { validatePolicy, findOutOfScopeChanges, isCommandAllowed } from './core/policy-engine.js'
export { testerApproved, reviewerApproved } from './core/approval-gate.js'

export { createProviderRunner } from './adapters/provider-runner.js'
export type { ProviderRunnerOptions } from './adapters/provider-runner.js'

export { runOrchestrator } from './core/executor.js'
export type { OrchestratorOptions } from './core/executor.js'

// Read from the manifest rather than repeating the literal here: a hardcoded copy silently
// kept reporting the previous release after the version was bumped.
export const harnessCoreVersion: string = createRequire(import.meta.url)('../package.json').version
