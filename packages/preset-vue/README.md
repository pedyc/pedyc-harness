# @pedyc/harness-preset-vue

Vue 3 + TypeScript + Vite preset for
[`pedyc-harness`](https://www.npmjs.com/package/pedyc-harness). It adds Vue
conventions on top of the shared contracts.

```bash
npx pedyc-harness init --preset vue
```

Compared with the `generic` preset:

- `requiredChecks` defaults to `harness:verify`, `type-check`, `test:unit` and
  `build`.
- `AGENTS.md` records the Vue 3 `<script setup lang="ts">`, `src/` boundary and
  typed-props conventions.
- `detection` declares `vite.config.ts` and the `vue` dependency.

The generated `agents.json` contains no Provider. Real (non dry-run) execution
requires replacing the placeholder Provider with your own Adapter command.

## Changelog

All four Harness packages share one version number and are released together, so
release notes for this package live in the repository changelog:

https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md

## License

MIT
