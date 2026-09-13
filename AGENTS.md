# Agent instructions

This repository is a Vue 3 + TypeScript product demo with a configuration-driven
agent harness.

## Instruction hierarchy

1. Read this file for repository-wide rules.
2. Read the nearest `AGENTS.md` for directory-specific rules.
3. Read `.github/AGENTS.md` when changing GitHub, CI, or agent configuration.
4. Use `.agents/skills/<skill>/SKILL.md` when the task matches a skill.

## Product boundary

- `src/` contains product demonstration code only.
- `.harness/` contains machine-readable contracts, policy, and evaluation criteria.
- `.agents/` contains reusable task skills.
- `.github/` contains Copilot instructions, agents, and CI.
- `.claude/` contains Claude Code entrypoints and permissions.
- `scripts/` contains harness execution and verification code.

Do not place agent orchestration, schemas, or harness runtime code in `src/`.

## Required verification

Run these commands after product or harness changes:

```bash
pnpm run harness:verify
pnpm run type-check
pnpm run build
```

To run the orchestrator in a safe preview mode:

```bash
pnpm run harness:run -- --input .harness/task.example.json --dry-run --json
```

This repository uses pnpm `10.15.0`, declared in `package.json`. Target projects generated
by the CLI may use npm, pnpm, or yarn.

The default coder adapter is intentionally external. Configure
`.harness/agents.json` with a command that accepts one JSON payload on stdin
before running a non-dry execution. The adapter must only change `src/`.

The repository includes a Claude Code adapter at
`scripts/harness/claude-adapter.mjs`. It requires the `claude` CLI to be
installed and authenticated, uses structured JSON output, and never enables
`--dangerously-skip-permissions`.

If a command fails, fix the cause and rerun the failed command. Do not report
success based on an unexecuted or stale result.

## Product conventions

- Use Vue 3 `<script setup lang="ts">`.
- Use PascalCase for components.
- Keep component props explicitly typed.
- Keep changes scoped to the request.
