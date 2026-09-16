# @pedyc/harness-preset-vue

Vue 3 + TypeScript + Vite preset for
[`pedyc-harness`](https://www.npmjs.com/package/pedyc-harness). It adds Vue
conventions on top of the shared contracts.

```bash
npx pedyc-harness init --preset vue
```

This package is data, not code: `preset.json`, `policy.json`, `agents.json` and
`AGENTS.md`. There is no entry point, no build step and no dependency on the Harness
core. `init` records `@pedyc/harness-preset-vue` in `.harness/harness.json`; the
policy and agent documents are read from this package at run time rather than copied
into the project.

Compared with the `generic` preset:

- `requiredChecks` declares `harness:verify`, `type-check`, `test:unit` and `build`,
  so `verify` fails until the project defines those npm scripts.
- `AGENTS.md` records the Vue 3 `<script setup lang="ts">`, `src/` boundary and
  typed-props conventions.

The supplied `agents.json` contains no Provider. Real (non dry-run) execution
requires adding your own Adapter command to the project's `.harness/agents.json`.

## Changelog

All four Harness packages share one version number and are released together, so
release notes for this package live in the repository changelog:

https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md

## License

MIT
