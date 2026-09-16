# @pedyc/harness-core

Technology-stack agnostic runtime primitives for Pedyc Harness. The package has no
dependency on Vue or on any project layout, and is used by `pedyc-harness`.

## API

```js
import {
  detectPackageManager,
  packageScriptCommand,
  normalizeTask,
  readTaskFile,
  runCommand,
  changedFiles,
  snapshotFiles,
  loadSchemas,
  createValidators,
  validationDetails,
  parseAgentResponse,
  validateStageResponse,
  loadHarnessConfig,
  readManifest,
  defaultPolicy,
  defaultAgents,
  policyProblems,
  agentProblems,
  formatConfigError,
  resolvePresets,
  presetPackageName,
  presetFile,
  presetDocument,
  validatePolicy,
  findOutOfScopeChanges,
  isCommandAllowed,
  createProviderRunner,
  runOrchestrator,
} from '@pedyc/harness-core'
```

Individual modules are also exported for narrower imports:

```js
import { detectPackageManager } from '@pedyc/harness-core/package-manager'
import { runOrchestrator } from '@pedyc/harness-core/orchestrator'
import { loadHarnessConfig } from '@pedyc/harness-core/config'
```

- `config` — the only module that reads a project's configuration documents.
  `loadHarnessConfig(root)` resolves `.harness/harness.json` when there is one,
  falls back to the conventional `.harness/policy.json` and `.harness/agents.json`,
  then to the documents an installed preset provides, and finally to built-in
  defaults. It returns either a complete configuration plus the sources it came
  from, or a list of structured errors naming a file and a field. Nothing is
  executed first, so a bad configuration fails before a run starts rather than
  partway through one.
- `resolvePresets(root, names)` — preset resolution, exported from the same module.
  A preset is an installed npm package exposing `preset.json`; the walk is
  depth-first post-order, so a preset is loaded once however many chains reach it,
  dependencies come before the presets that inherit from them, and re-entering a
  package still on the stack is reported as a cycle listing the whole loop. Errors
  are the same structured `HarnessConfigError` values the loader returns. Pass a
  short name through `presetPackageName` first: `vue` becomes
  `@pedyc/harness-preset-vue`, while anything containing `/` is a package name
  already.
- `package-manager` / `command` — lockfile detection and command execution.
- `intake` / `schema` / `agent` — task normalization, Ajv validation and Agent
  response parsing.
- `policy` / `provider` / `orchestrator` — path policy, Provider routing and the
  four-phase execution loop.

The source is layered `contracts/` → `config/` → `runtime/`, with dependencies
pointing one way: `contracts/` holds pure types and schema compilation and never
touches the file system, `config/` owns every configuration read, and `runtime/`
executes against values `config/` already resolved.

`runOrchestrator({ dryRun: true })` skips every Agent Provider and verification gate
and returns a structured passing result.

## Changelog

All four Harness packages share one version number and are released together, so
release notes for this package live in the repository changelog:

https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md

## License

MIT
