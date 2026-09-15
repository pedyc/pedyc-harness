---
name: verify-change
description: Verify a completed change against the repository harness gates.
---

# Verifying a change

Run the gates in this order:

```bash
pnpm run build
pnpm run harness:verify
pnpm run type-check
pnpm run test:unit
```

`build` runs first because the packages compile to `dist/` and the Harness
resolves them through their published entry points.

Stop on a failure, diagnose it, apply the smallest relevant fix, and rerun the
failed gate. Never replace a failed check with a claim that it is equivalent.
