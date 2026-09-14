# @pedyc/harness-preset-generic

Stack-agnostic preset for [`pedyc-harness`](https://www.npmjs.com/package/pedyc-harness).
It generates only the shared contracts and safety policy, so it fits non-Node projects
and custom stacks.

```bash
npx pedyc-harness init --preset generic
```

Generated defaults:

- `.harness/policy.json` — `allowedProductPaths: ["src/"]`, protected harness, CI and
  script directories, no required checks, three forbidden commands.
- `.harness/agents.json` — no Provider configured; roles are external and reference
  the `custom` provider until the project adds one. `verify` and
  `run --dry-run` work without a Provider.
- `.harness/*.schema.json` and `.harness/task.example.json` — task, output and Agent
  response contracts.
- `AGENTS.md` — project instructions placeholder.

Real (non dry-run) execution requires configuring a Provider command in
`.harness/agents.json`.

## License

MIT
