#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const legacyCli = join(packageRoot, 'scripts', 'harness', 'cli.mjs')
const result = spawnSync(process.execPath, [legacyCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
})

process.exit(result.status ?? 1)
