import { createRequire } from 'node:module'

export { detectPackageManager, packageScriptCommand } from './package-manager.mjs'
export { normalizeTask, readTaskFile } from './intake.mjs'
export { runCommand } from './command.mjs'
export { changedFiles, snapshotFiles } from './snapshots.mjs'
export { loadSchemas, createValidators, validationDetails } from './schema.mjs'
export { parseAgentResponse, validateStageResponse } from './agent.mjs'
export { validatePolicy, findOutOfScopeChanges, isCommandAllowed } from './policy.mjs'
export { createProviderRunner } from './provider.mjs'
export { runOrchestrator } from './orchestrator.mjs'

// Read from the manifest rather than repeating the literal here: a hardcoded copy silently
// kept reporting the previous release after the version was bumped.
export const harnessCoreVersion = createRequire(import.meta.url)('../package.json').version
