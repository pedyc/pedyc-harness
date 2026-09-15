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
```

- `package-manager` / `command` — lockfile detection and command execution.
- `intake` / `schema` / `agent` — task normalization, Ajv validation and Agent
  response parsing.
- `policy` / `provider` / `orchestrator` — path policy, Provider routing and the
  four-phase execution loop.

`runOrchestrator({ dryRun: true })` skips every Agent Provider and verification gate
and returns a structured passing result.

## Changelog

All four Harness packages share one version number and are released together, so
release notes for this package live in the repository changelog:

https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md

## License

MIT
