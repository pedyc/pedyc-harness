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
npx pedyc-harness list-presets
npx pedyc-harness diff
npx pedyc-harness update
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

- `init` is idempotent. It writes `.harness/harness.json`, the contract files and, when
  `AGENTS.md` is absent, seeds it from the preset. It never copies the preset's
  `policy.json` / `agents.json` into the project: those stay in the package and are
  read through the resolver, so upgrading a preset is a dependency bump rather than a
  diff to merge. Existing files are only overwritten with `--force`, and anything kept
  is listed. If the preset is not installed yet, `init` installs it with the detected
  package manager (`--no-install` turns that off).
- `verify` validates the generated configuration and runs the optional
  `.harness/verify.mjs` project hook when present. Configuration problems exit `5`
  rather than `1`, so CI can tell "your configuration is broken" apart from "the run
  failed".
- `doctor` reports which configuration sources actually took effect, including a
  fallback to built-in defaults and which preset supplied a document.
- `list-presets` lists the presets the project actually resolves, one per line, with
  whether each was declared in `harness.json` or inherited and what it `extends`.
- `run --dry-run` is a safe preview: no Agent Provider is invoked, no verification
  command is executed and no product file is changed.
- `run` without `--dry-run` requires a Provider configured in
  `.harness/agents.json`. No Agent CLI is assumed to be installed by this package.

## Presets

- `generic` — stack-agnostic contracts and safety policy.
- `vue` — Vue 3 + TypeScript + Vite conventions.

A preset is an npm package carrying `preset.json`; it inherits from other presets
through `extends` (package names only, never versions) and is resolved as a DAG, so a
shared base loads once and a cycle is reported with the full loop rather than
overflowing the stack. Names in `harness.json` are package names: a bare word is
expanded to `@pedyc/harness-preset-<name>`, anything containing `/` is used verbatim.
That is the whole convention — a team preset needs no registration in this package,
and Core never learns the words `generic` or `vue`.

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
