#!/usr/bin/env node

// Compatibility shim: the run orchestration lives in the `pedyc-harness`
// package. This entry point keeps `node scripts/harness/run.mjs` working for the
// repository's own tasks and documentation.

import { runHarness } from 'pedyc-harness/run'

process.exitCode = await runHarness()
