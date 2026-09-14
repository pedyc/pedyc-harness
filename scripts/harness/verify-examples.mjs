#!/usr/bin/env node

// Runs the M5 compatibility acceptance commands against every sample project in
// examples/. The examples are independent projects, so each command is executed
// with the example directory as the working directory.

import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..')
const cliPath = join(repoRoot, 'scripts', 'harness', 'cli.mjs')

const examples = [
  { directory: 'generic-project', preset: 'generic', manager: 'pnpm' },
  { directory: 'vue-project', preset: 'vue', manager: 'yarn' },
  { directory: 'node-project', preset: 'generic', manager: 'npm' },
]

const managedFiles = [
  'AGENTS.md',
  '.harness/policy.json',
  '.harness/agents.json',
  '.harness/input.schema.json',
  '.harness/output.schema.json',
  '.harness/agent-response.schema.json',
  '.harness/task.example.json',
]

const runCli = (cwd, ...args) => {
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8', windowsHide: true })
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const readManaged = (root) =>
  Object.fromEntries(managedFiles.map((file) => [file, readFileSync(join(root, file), 'utf8')]))

const treeDigest = (root) => {
  const entries = []
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(directory, entry.name)
      if (entry.isDirectory()) walk(child, `${prefix}${entry.name}/`)
      else entries.push(`${prefix}${entry.name}:${readFileSync(child, 'utf8')}`)
    }
  }
  walk(root, '')
  return entries.join('\n')
}

const failures = []
const check = (condition, message) => {
  if (condition) {
    console.log(`  ok   ${message}`)
  } else {
    console.log(`  FAIL ${message}`)
    failures.push(message)
  }
}

for (const example of examples) {
  const root = join(repoRoot, 'examples', example.directory)
  console.log(`\n${example.directory} (${example.preset} preset)`)

  const beforeInit = readManaged(root)
  const init = runCli(root, 'init', '--preset', example.preset)
  check(init.code === 0, `init exits 0 (actual ${init.code})`)
  const afterInit = readManaged(root)
  check(
    managedFiles.every((file) => afterInit[file] === beforeInit[file]),
    'init is idempotent and preserves the committed configuration',
  )

  const verify = runCli(root, 'verify')
  check(verify.code === 0, `verify exits 0 (actual ${verify.code})`)

  const doctor = runCli(root, 'doctor')
  check(doctor.code === 0, `doctor exits 0 (actual ${doctor.code})`)
  check(
    doctor.stdout.includes(`Package manager: ${example.manager}`),
    `doctor detects the ${example.manager} lockfile`,
  )

  const sourceDigestBefore = treeDigest(join(root, 'src'))
  const dryRun = runCli(root, 'run', '--dry-run', '--json')
  check(dryRun.code === 0, `run --dry-run --json exits 0 (actual ${dryRun.code})`)
  check(treeDigest(join(root, 'src')) === sourceDigestBefore, 'dry run leaves product files unchanged')

  let output = null
  try {
    output = JSON.parse(dryRun.stdout)
  } catch {
    check(false, 'dry run prints one JSON object on stdout')
  }
  if (output) {
    check(output.status === 'passed', `dry run status is passed (actual ${output.status})`)
    check(output.dryRun === true, 'dry run result is flagged as dryRun')
    check(
      output.phases?.map(({ name }) => name).join(',') === 'planner,coder,tester,reviewer',
      'dry run reports the planner, coder, tester and reviewer phases',
    )
  }

  rmSync(join(root, '.harness', 'runs'), { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\nExample verification failed: ${failures.length} check(s) did not pass.`)
  process.exit(1)
}
console.log(`\nExample verification passed: ${examples.length} project(s), ${managedFiles.length} managed file(s) each.`)
