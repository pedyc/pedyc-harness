#!/usr/bin/env node

// Compatibility shim: the CLI implementation lives in the `pedyc-harness` package
// so it can be published and installed on its own. This entry point keeps the
// repository scripts and documented commands working unchanged.

import { runCli } from 'pedyc-harness'

process.exitCode = await runCli()
