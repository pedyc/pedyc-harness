// Release readiness check: pack every publishable package, inspect the tarball
// contents, and run the CLI out of the packed artifacts in a throwaway consumer
// project. The consumer never sees this repository's workspace links, so a broken
// `files` list, a leftover `workspace:*` range or a hardcoded repository path fails
// the check instead of failing for the user after `npm install`.
//
// The tarballs are extracted by hand instead of installed with npm so the check is
// offline and deterministic; only the external `ajv` dependency is linked from the
// workspace store.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)

const failures = []
const fail = (message) => {
  failures.push(message)
  console.error(`  FAIL ${message}`)
}
const ok = (message) => console.log(`  ok   ${message}`)

// --- minimal tar reader (npm tarballs are gzip-compressed ustar archives) -------

const readTarGz = (file) => {
  const buffer = gunzipSync(readFileSync(file))
  const entries = new Map()
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const readString = (start, length) =>
      header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim()
    const size = Number.parseInt(readString(124, 12) || '0', 8) || 0
    const type = readString(156, 1) || '0'
    const prefix = readString(345, 155)
    const name = readString(0, 100)
    const path = prefix ? `${prefix}/${name}` : name
    const body = buffer.subarray(offset + 512, offset + 512 + size)
    if (type !== '5' && path) entries.set(path, body)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return entries
}

// --- package definitions -------------------------------------------------------

const packages = [
  {
    dir: 'packages/core',
    name: '@pedyc/harness-core',
    require: ['package/package.json', 'package/README.md', 'package/src/index.mjs', 'package/src/orchestrator.mjs'],
  },
  {
    dir: 'packages/cli',
    name: 'pedyc-harness',
    require: [
      'package/package.json',
      'package/README.md',
      'package/src/bin.mjs',
      'package/src/cli.mjs',
      'package/src/run.mjs',
      'package/src/presets.mjs',
      'package/templates/input.schema.json',
      'package/templates/output.schema.json',
      'package/templates/agent-response.schema.json',
      'package/templates/task.example.json',
    ],
  },
  {
    dir: 'packages/preset-generic',
    name: '@pedyc/harness-preset-generic',
    require: ['package/package.json', 'package/README.md', 'package/src/index.mjs'],
  },
  {
    dir: 'packages/preset-vue',
    name: '@pedyc/harness-preset-vue',
    require: ['package/package.json', 'package/README.md', 'package/src/index.mjs'],
  },
]

const isWindows = process.platform === 'win32'

// Windows exposes pnpm as a .cmd shim, which Node refuses to spawn without a shell.
const runPnpm = (args, cwd) => {
  const options = { cwd, encoding: 'utf8' }
  if (!isWindows) return spawnSync('pnpm', args, options)
  const command = ['pnpm', ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ')
  return spawnSync(command, { ...options, shell: true })
}

const runNode = (binPath, args, cwd) => spawnSync(process.execPath, [binPath, ...args], { cwd, encoding: 'utf8' })

const workDir = mkdtempSync(join(tmpdir(), 'pedyc-release-'))
const tarballDir = join(workDir, 'tarballs')
const consumerDir = join(workDir, 'consumer')
mkdirSync(tarballDir, { recursive: true })
mkdirSync(join(consumerDir, 'node_modules'), { recursive: true })

const tarballs = new Map()
let exitCode = 0

try {
  console.log(`Release check in ${workDir}`)

  for (const pkg of packages) {
    const result = runPnpm(['pack', '--pack-destination', tarballDir], join(root, pkg.dir))
    if (result.status !== 0) {
      fail(`pnpm pack failed for ${pkg.name}: ${(result.stderr || result.stdout || '').trim()}`)
      throw new Error('pack failed')
    }
    const tarball = result.stdout.trim().split('\n').pop().trim()
    const file = existsSync(tarball) ? tarball : join(tarballDir, tarball.replace(/^.*[\\/]/, ''))
    if (!existsSync(file)) {
      fail(`cannot locate tarball for ${pkg.name} (reported '${tarball}')`)
      throw new Error('pack failed')
    }
    tarballs.set(pkg.name, file)
    ok(`packed ${pkg.name}`)
  }

  for (const pkg of packages) {
    const entries = readTarGz(tarballs.get(pkg.name))

    for (const required of pkg.require) {
      if (entries.has(required)) ok(`${pkg.name} ships ${required.replace('package/', '')}`)
      else fail(`${pkg.name} is missing ${required.replace('package/', '')} in its tarball`)
    }

    const leaked = [...entries.keys()].filter((entry) => /^package\/(tests|examples|scripts)\//.test(entry))
    if (leaked.length > 0) fail(`${pkg.name} leaks workspace files: ${leaked.slice(0, 3).join(', ')}`)
    else ok(`${pkg.name} ships no test or example files`)

    const manifest = entries.get('package/package.json')
    if (!manifest) {
      fail(`${pkg.name} has no package.json in its tarball`)
      continue
    }
    const packed = JSON.parse(manifest.toString('utf8'))
    const ranges = Object.values(packed.dependencies ?? {})
    const unresolved = ranges.filter((range) => String(range).startsWith('workspace:'))
    if (unresolved.length > 0) fail(`${pkg.name} still declares workspace ranges: ${unresolved.join(', ')}`)
    else ok(`${pkg.name} resolves every workspace dependency to a published range`)

    // Extract the tarball into the consumer's node_modules. Node resolves a bare
    // specifier from the nearest node_modules first, so the workspace copies of
    // pedyc-harness and friends cannot mask a packaging defect.
    const target = join(consumerDir, 'node_modules', ...pkg.name.split('/'))
    mkdirSync(target, { recursive: true })
    for (const [entry, body] of entries) {
      const relative = entry.replace(/^package\//, '')
      if (!relative) continue
      const destination = join(target, relative)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, body)
    }
  }

  const cliManifest = JSON.parse(readFileSync(join(consumerDir, 'node_modules/pedyc-harness/package.json'), 'utf8'))
  const binPath = join(consumerDir, 'node_modules/pedyc-harness', cliManifest.bin['pedyc-harness'])
  if (existsSync(binPath)) ok('bin entry resolves inside the tarball')
  else fail(`bin entry ${cliManifest.bin['pedyc-harness']} does not exist in the tarball`)

  // `ajv` is the only external runtime dependency; link its real store directory so
  // its own transitive dependencies resolve without touching the registry.
  const ajvPath = dirname(require.resolve('ajv/package.json'))
  const ajvTarget = join(consumerDir, 'node_modules', 'ajv')
  try {
    symlinkSync(ajvPath, ajvTarget, 'junction')
  } catch {
    cpSync(ajvPath, ajvTarget, { recursive: true })
  }

  const consumer = (args) => runNode(binPath, args, consumerDir)

  const steps = [
    ['init --preset generic', ['init', '--preset', 'generic'], 'Initialized'],
    ['verify generic', ['verify'], ''],
    ['doctor', ['doctor'], 'Package manager: npm'],
    ['run --dry-run --json', ['run', '--input', '.harness/task.example.json', '--dry-run', '--json'], '"dryRun": true'],
    ['init --preset vue', ['init', '--preset', 'vue'], 'Initialized'],
    ['verify vue', ['verify'], ''],
  ]

  for (const [label, args, expected] of steps) {
    const result = consumer(args)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (result.status !== 0) {
      fail(`${label} exited ${result.status}: ${output.trim().split('\n').slice(-3).join(' | ')}`)
    } else if (expected && !output.includes(expected)) {
      fail(`${label} did not report '${expected}'`)
    } else {
      ok(label)
    }
  }

  const dryRun = consumer(['run', '--input', '.harness/task.example.json', '--dry-run', '--json'])
  try {
    const result = JSON.parse(dryRun.stdout)
    if (result.dryRun === true && result.status === 'passed') ok('dry run result matches the output contract')
    else fail(`dry run result is not a passing preview: ${JSON.stringify(result).slice(0, 120)}`)
  } catch {
    fail('dry run did not print parseable JSON on stdout')
  }

  if (!existsSync(join(consumerDir, '.harness', 'task.example.json'))) {
    fail('the vue preset did not write .harness/task.example.json')
  } else {
    ok('presets ship the task example template')
  }
} catch (error) {
  if (failures.length === 0) fail(error instanceof Error ? error.message : String(error))
} finally {
  if (failures.length > 0) {
    exitCode = 1
    console.error(`\nRelease check failed with ${failures.length} problem(s). Artifacts kept at ${workDir}`)
  } else {
    rmSync(workDir, { recursive: true, force: true })
    console.log('\nRelease check passed: every package packs and installs cleanly.')
  }
}

process.exitCode = exitCode
