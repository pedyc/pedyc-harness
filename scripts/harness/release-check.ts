// Release readiness check: pack every publishable package, inspect the tarball
// contents, install them with a real `npm install` into a throwaway consumer
// project, and drive the installed CLI through initialization, verification, a
// dry run and a full four-phase loop.
//
// The consumer is a genuine npm project outside the workspace, so a broken `files`
// list, a leftover `workspace:*` range, a hardcoded repository path or a missing
// bin entry fails here instead of failing for the user after `npm install`.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const isWindows = process.platform === 'win32'

const failures: string[] = []
const fail = (message: string): void => {
  failures.push(message)
  console.error(`  FAIL ${message}`)
}
const ok = (message: string): void => console.log(`  ok   ${message}`)

// --- shell helpers -------------------------------------------------------------

// Windows exposes npm/pnpm as .cmd shims, which Node refuses to spawn without a shell.
const runShell = (command: string, args: string[], cwd: string) => {
  const options = { cwd, encoding: 'utf8' as const }
  if (!isWindows) return spawnSync(command, args, options)
  const line = [command, ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ')
  return spawnSync(line, { ...options, shell: true })
}

// --- minimal tar reader (npm tarballs are gzip-compressed ustar archives) -------

const readTarGz = (file: string): Map<string, Buffer> => {
  const buffer = gunzipSync(readFileSync(file))
  const entries = new Map<string, Buffer>()
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const readString = (start: number, length: number): string =>
      header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim()
    const size = Number.parseInt(readString(124, 12) || '0', 8) || 0
    const type = readString(156, 1) || '0'
    const prefix = readString(345, 155)
    const name = readString(0, 100)
    const path = prefix ? `${prefix}/${name}` : name
    if (type !== '5' && path) entries.set(path, buffer.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return entries
}

// --- package definitions -------------------------------------------------------

interface PackageDefinition {
  dir: string
  name: string
  require: string[]
}

const cliPackage = 'pedyc-harness'

const packages: PackageDefinition[] = [
  {
    dir: 'packages/core',
    name: '@pedyc/harness-core',
    require: [
      'package/package.json',
      'package/README.md',
      // This package ships compiled output, so the tarball must carry the built
      // entry points and their declarations rather than the TypeScript sources.
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/runtime/executor.js',
      'package/dist/contracts/index.js',
      // Load-bearing, not documentation: `loadHarnessConfig` validates
      // `harness.json` against this bundled copy, so a tarball without it
      // cannot load any manifest at all. The preset schema is the same argument
      // one step further out, and only matters once a project declares a preset.
      'package/schemas/harness.schema.json',
      'package/schemas/preset.schema.json',
    ],
  },
  {
    dir: 'packages/cli',
    name: cliPackage,
    require: [
      'package/package.json',
      'package/README.md',
      // Compiled output now. `dist/cli.js` is load-bearing: it locates
      // `templates/` through `..`, which only resolves correctly at that depth.
      'package/dist/bin.js',
      'package/dist/cli.js',
      'package/dist/run.js',
      'package/dist/presets.js',
      'package/templates/input.schema.json',
      'package/templates/output.schema.json',
      'package/templates/agent-response.schema.json',
      'package/templates/harness.schema.json',
      'package/templates/task.example.json',
    ],
  },
  {
    // Presets are data packages. There is no build step and no compiled entry
    // point to check: the resolver reads these four files and nothing else, so
    // their presence in the tarball is the whole contract.
    dir: 'packages/preset-generic',
    name: '@pedyc/harness-preset-generic',
    require: [
      'package/package.json',
      'package/README.md',
      'package/preset.json',
      'package/policy.json',
      'package/agents.json',
      'package/AGENTS.md',
    ],
  },
  {
    dir: 'packages/preset-vue',
    name: '@pedyc/harness-preset-vue',
    require: [
      'package/package.json',
      'package/README.md',
      'package/preset.json',
      'package/policy.json',
      'package/agents.json',
      'package/AGENTS.md',
    ],
  },
]

// The consumer declares the gates the `vue` preset requires. They are trivial but
// really executed, so `verify` and the Tester phase both have something to run.
const consumerScripts = {
  'harness:verify': 'pedyc-harness verify',
  'type-check': 'node -e "process.exit(0)"',
  'test:unit': 'node -e "process.exit(0)"',
  build: 'node -e "process.exit(0)"',
}

// Maps a package name to the tarball filename pnpm pack produces:
//   @pedyc/harness-core -> pedyc-harness-core-<version>.tgz
//   pedyc-harness       -> pedyc-harness-<version>.tgz
const tarballNameOf = (name: string, version: string): string =>
  `${name.replace('@pedyc/', 'pedyc-')}-${version}.tgz`

const writeConsumerManifest = (consumerDir: string, withScripts: boolean): void => {
  const corePkg = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf-8'))
  const manifest: Record<string, unknown> = {
    name: 'pedyc-release-consumer',
    version: '0.0.0',
    private: true,
    dependencies: Object.fromEntries(
      packages.map(({ name }) => [name, `file:../tarballs/${tarballNameOf(name, corePkg.version)}`]),
    ),
  }
  if (withScripts) manifest.scripts = consumerScripts
  writeFileSync(join(consumerDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

const providerEcho = `#!/usr/bin/env node
// Deterministic offline provider: no network, no file changes.
const responses = {
  planner: { details: 'Release check planner accepted the task.', implementationPlan: ['Inspect the project.', 'Apply the change under src/.', 'Run the configured gates.'] },
  coder: { details: 'Release check coder produced no file changes.', changedFiles: [] },
  tester: { details: 'Release check tester approved the gates.', approved: true, evidence: [{ command: 'configured gates', result: 'pass', details: 'All configured checks passed.' }] },
  reviewer: { details: 'Release check reviewer approved the change.', approved: true },
}
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  const request = JSON.parse(raw || '{}')
  process.stdout.write(JSON.stringify(responses[request.phase] ?? { details: 'unknown phase' }))
})
`

const workDir = mkdtempSync(join(tmpdir(), 'pedyc-release-'))
const tarballDir = join(workDir, 'tarballs')
const consumerDir = join(workDir, 'consumer')
mkdirSync(tarballDir, { recursive: true })
mkdirSync(consumerDir, { recursive: true })

let exitCode = 0

try {
  console.log(`Release check in ${workDir}`)

  // 1. Pack every package.
  for (const pkg of packages) {
    const result = runShell('pnpm', ['pack', '--pack-destination', tarballDir], join(root, pkg.dir))
    if (result.status !== 0) {
      fail(`pnpm pack failed for ${pkg.name}: ${(result.stderr || result.stdout || '').trim()}`)
      throw new Error('pack failed')
    }
    const reported = (result.stdout ?? '').trim().split('\n').pop()?.trim() ?? ''
    const file = existsSync(reported) ? reported : join(tarballDir, reported.replace(/^.*[\\/]/, ''))
    if (!existsSync(file)) {
      fail(`cannot locate tarball for ${pkg.name} (reported '${reported}')`)
      throw new Error('pack failed')
    }
    ok(`packed ${pkg.name}`)
  }

  // 2. Inspect tarball contents. Each package is checked against its own tarball,
  //    named from its own manifest version, so a version bump never leaves a stale
  //    hardcoded filename behind.
  for (const pkg of packages) {
    const manifest = JSON.parse(readFileSync(join(root, pkg.dir, 'package.json'), 'utf8'))
    const tarball = join(tarballDir, tarballNameOf(pkg.name, manifest.version))
    if (!existsSync(tarball)) {
      fail(`missing tarball for ${pkg.name} at ${tarball}`)
      continue
    }
    const entries = readTarGz(tarball)

    const missing = pkg.require.filter((entry) => !entries.has(entry))
    if (missing.length > 0) {
      fail(`${pkg.name} is missing ${missing.map((entry) => entry.replace('package/', '')).join(', ')}`)
    } else {
      ok(`${pkg.name} ships all required files`)
    }

    const leaked = [...entries.keys()].filter((entry) => /^package\/(tests|examples|scripts)\//.test(entry))
    if (leaked.length > 0) fail(`${pkg.name} leaks workspace files: ${leaked.slice(0, 3).join(', ')}`)
    else ok(`${pkg.name} ships no test or example files`)

    const packedManifest = entries.get('package/package.json')
    if (!packedManifest) {
      fail(`${pkg.name} has no package.json in its tarball`)
      continue
    }
    const ranges = Object.values(JSON.parse(packedManifest.toString('utf8')).dependencies ?? {})
    const unresolved = ranges.filter((range) => String(range).startsWith('workspace:'))
    if (unresolved.length > 0) fail(`${pkg.name} still declares workspace ranges: ${unresolved.join(', ')}`)
    else ok(`${pkg.name} resolves every workspace dependency to a published range`)
  }

  // 3. Install for real. All four tarballs go in one command so npm satisfies the
  //    cross-package @pedyc/harness-core requirement from the local files instead
  //    of reaching for the registry.
  writeConsumerManifest(consumerDir, false)
  const install = runShell('npm', ['install', '--no-audit', '--no-fund'], consumerDir)
  if (install.status !== 0) {
    fail(`npm install failed: ${(install.stderr || install.stdout || '').trim().split('\n').slice(-4).join(' | ')}`)
    throw new Error('install failed')
  }
  ok('npm install completed')

  for (const { name } of packages) {
    if (existsSync(join(consumerDir, 'node_modules', ...name.split('/')))) ok(`${name} is installed`)
    else fail(`${name} is missing after npm install`)
  }

  // The bin shim is what users actually invoke, so drive that rather than the source path.
  const bin = join(consumerDir, 'node_modules', '.bin', isWindows ? `${cliPackage}.cmd` : cliPackage)
  if (!existsSync(bin)) {
    fail(`npm did not create the ${cliPackage} bin shim`)
    throw new Error('bin missing')
  }
  ok('npm created the pedyc-harness bin shim')

  const cli = (args: string[]) => runShell(bin, args, consumerDir)
  const outputOf = (result: ReturnType<typeof runShell>): string => `${result.stdout ?? ''}${result.stderr ?? ''}`

  // 4. init + verify against a manifest that lacks the preset gates. This must fail:
  //    otherwise `verify` is not actually enforcing requiredChecks.
  if (cli(['init', '--preset', 'vue']).status !== 0) fail('init --preset vue failed')
  else ok('init --preset vue')

  // `init` names the preset and gets out of the way: copying the preset's policy
  // into the tree is what makes a project's own edits unmergeable later, and it
  // would hide a broken resolver behind a stale local copy.
  const copied = ['.harness/policy.json', '.harness/agents.json'].filter((file) => existsSync(join(consumerDir, file)))
  if (copied.length > 0) fail(`init copied preset content into the project: ${copied.join(', ')}`)
  else ok('init writes the manifest and the contracts, not the preset')

  // The policy `verify` enforces here is not in the consumer's tree at all: it
  // is read out of the installed preset package, which is the only way this
  // passes. `init` deliberately writes no `.harness/policy.json`.
  const listed = cli(['list-presets'])
  if (listed.status !== 0) fail(`list-presets exited ${listed.status}`)
  else if (!outputOf(listed).includes('@pedyc/harness-preset-vue\tdeclared')) {
    fail(`list-presets did not report the declared preset: ${outputOf(listed).trim()}`)
  } else ok('list-presets resolves the installed preset package')

  const ungated = cli(['verify'])
  if (ungated.status === 0) fail('verify passed even though the preset gates are missing from package.json')
  else if (!outputOf(ungated).includes('missing npm scripts')) fail('verify failed without naming the missing gates')
  else ok('verify rejects a manifest that is missing the preset gates')

  // 5. Same project, now with the gates declared.
  writeConsumerManifest(consumerDir, true)
  const verify = cli(['verify'])
  if (verify.status !== 0) fail(`verify failed: ${outputOf(verify).trim()}`)
  else ok('verify accepts a manifest that declares every required gate')

  const doctor = cli(['doctor'])
  if (doctor.status !== 0) fail(`doctor exited ${doctor.status}`)
  else if (!outputOf(doctor).includes('Package manager: npm')) fail('doctor did not detect the npm consumer')
  else ok('doctor detects the npm consumer')

  // 6. Dry run is a safe preview and must not execute any gate.
  const dryRun = cli(['run', '--input', '.harness/task.example.json', '--dry-run', '--json'])
  if (dryRun.status !== 0) {
    fail(`dry run exited ${dryRun.status}: ${outputOf(dryRun).trim()}`)
  } else {
    try {
      const result = JSON.parse(dryRun.stdout)
      if (result.dryRun === true && result.status === 'passed' && result.phases.length === 4) {
        ok('run --dry-run --json matches the output contract')
      } else {
        fail(`dry run result is not a four-phase preview: ${JSON.stringify(result).slice(0, 140)}`)
      }
    } catch {
      fail('run --dry-run --json did not print parseable JSON on stdout')
    }
  }

  // 7. Configure a provider and drive the whole four-phase loop from the installed
  //    package. The gates are really executed by the Tester phase here.
  writeFileSync(join(consumerDir, 'echo-adapter.mjs'), providerEcho, 'utf8')
  writeFileSync(
    join(consumerDir, '.harness', 'agents.json'),
    `${JSON.stringify(
      {
        providers: { echo: { command: 'node', args: ['echo-adapter.mjs'] } },
        planner: { mode: 'external', provider: 'echo' },
        coder: { mode: 'external', provider: 'echo' },
        tester: { mode: 'external', provider: 'echo' },
        reviewer: { mode: 'external', provider: 'echo' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const run = cli(['run', '--input', '.harness/task.example.json', '--json'])
  let runResult: {
    status: string
    phases: Array<{ name: string; status: string }>
    issues: unknown
    verification: Array<Record<string, unknown>>
  } | null = null
  try {
    runResult = JSON.parse(run.stdout)
  } catch {
    fail(`a full run did not print parseable JSON (exit ${run.status})`)
  }

  if (runResult) {
    const phaseStatus = runResult.phases.map((phase) => `${phase.name}:${phase.status}`).join(', ')
    if (runResult.status === 'passed' && runResult.phases.every((phase) => phase.status === 'passed')) {
      ok(`full four-phase loop passed from the installed package (${phaseStatus})`)
    } else {
      fail(`full run did not pass: ${phaseStatus} ${JSON.stringify(runResult.issues)}`)
    }

    const gates = runResult.verification.filter((check) => check.result === 'pass')
    if (gates.length === Object.keys(consumerScripts).length) {
      ok(`tester executed all ${gates.length} configured gates`)
    } else {
      fail(`expected ${Object.keys(consumerScripts).length} passing gates, got ${JSON.stringify(runResult.verification)}`)
    }
  }
} catch (error) {
  if (failures.length === 0) fail(error instanceof Error ? error.message : String(error))
} finally {
  if (failures.length > 0) {
    exitCode = 1
    console.error(`\nRelease check failed with ${failures.length} problem(s). Artifacts kept at ${workDir}`)
  } else {
    rmSync(workDir, { recursive: true, force: true })
    console.log('\nRelease check passed: every package installs with npm and the CLI runs from node_modules.')
  }
}

process.exitCode = exitCode
