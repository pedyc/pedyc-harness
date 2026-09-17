# @pedyc/harness-preset-generic

Stack-agnostic preset for [`pedyc-harness`](https://www.npmjs.com/package/pedyc-harness).
It provides only the shared safety policy, so it fits non-Node projects and custom
stacks.

```bash
npx pedyc-harness init --preset generic
```

This package ships data only: `preset.json`, `policy.json`, `agents.json` and
`AGENTS.md`. There is no entry point, no build step and no dependency on the Harness
core. `init` records `@pedyc/harness-preset-generic` in `.harness/harness.json`; the
policy and agent documents are read from this package at run time rather than copied
into the project.

A preset is a governance specification, not a Runtime plugin: one may declare a code
entry that registers analyzers and reviewer definitions through the Harness extension
contract. This package does not — see
[ADR-003](https://github.com/pedyc/pedyc-harness/blob/main/docs/decisions/ADR-003-preset-as-code.md).

What it supplies:

- `policy.json` — `allowedProductPaths: ["src/"]`, protected harness, CI and script
  directories, no required checks, three forbidden commands.
- `agents.json` — no Provider configured; roles are external and reference the
  `custom` provider until the project adds one. `verify` and `run --dry-run` work
  without a Provider.
- `AGENTS.md` — project instructions placeholder, used to seed the project's own copy
  when `init` writes it for the first time.

Real (non dry-run) execution requires configuring a Provider command in the project's
own `.harness/agents.json`.

## Changelog

All four Harness packages share one version number and are released together, so
release notes for this package live in the repository changelog:

https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md

## License

MIT
