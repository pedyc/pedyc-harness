---
name: verify-change
description: Verify a completed change against the repository harness gates.
---

# Verifying a change

Run the gates in this order:

```bash
npm run harness:verify
npm run type-check
npm run build
```

Stop on a failure, diagnose it, apply the smallest relevant fix, and rerun the
failed gate. Never replace a failed check with a claim that it is equivalent.
