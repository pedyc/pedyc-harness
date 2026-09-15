# pedyc-harness

Configuration-driven Agent Harness CLI. It initializes `.harness/` configuration in a
target project and runs a Planner → Coder → Tester → Reviewer loop through pluggable
Agent Providers.

## Install

```bash
npm install --save-dev pedyc-harness
# or: pnpm add --save-dev pedyc-harness
```

## Commands

```bash
npx pedyc-harness init --preset generic   # or --preset vue
npx pedyc-harness verify
npx pedyc-harness doctor
npx pedyc-harness diff --preset generic
npx pedyc-harness update --preset generic
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

- `init` is idempotent. Existing JSON configuration and `AGENTS.md` are only
  overwritten with `--force`.
- `verify` validates the generated configuration and runs the optional
  `.harness/verify.mjs` project hook when present.
- `run --dry-run` is a safe preview: no Agent Provider is invoked, no verification
  command is executed and no product file is changed.
- `run` without `--dry-run` requires a Provider configured in
  `.harness/agents.json`. No Agent CLI is assumed to be installed by this package.

## Presets

- `generic` — stack-agnostic contracts and safety policy.
- `vue` — Vue 3 + TypeScript + Vite conventions.

New presets are added by registering them in `packages/cli/src/presets.ts`; Core does
not need to change.

## Provider protocol

A Provider is a local command that receives one JSON request on stdin and writes one
JSON response to stdout. Diagnostics go to stderr. See the repository
[Provider design](https://github.com/pedyc/pedyc-harness/blob/main/docs/Provider%E8%AE%BE%E8%AE%A1.md).

## Changelog

All four Harness packages share one version number and are released together, so
release notes for this package live in the repository changelog:

https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md

## License

MIT
