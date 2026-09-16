import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const read = (relativePath: string) => readFileSync(join(repoRoot, relativePath), 'utf8')
const readJson = (relativePath: string) => JSON.parse(read(relativePath))
const exists = (relativePath: string) => existsSync(join(repoRoot, relativePath))

// `ships` is what the tarball carries and what a consumer resolves: compiled
// output for a code package, the declarative documents for a data-only preset
// package, whose entry point is the document rather than a module.
const packages = [
  { dir: 'packages/core', name: '@pedyc/harness-core', ships: 'dist' },
  { dir: 'packages/cli', name: 'pedyc-harness', ships: 'dist' },
  { dir: 'packages/preset-generic', name: '@pedyc/harness-preset-generic', ships: 'preset.json' },
  { dir: 'packages/preset-vue', name: '@pedyc/harness-preset-vue', ships: 'preset.json' },
]

// An `exports` target is either a bare path or a conditions object.
const exportTargets = (target: string | Record<string, string>): string[] =>
  typeof target === 'string' ? [target] : Object.values(target)

describe('release configuration', () => {
  it('keeps every schema copy byte-identical to schemas/', () => {
    const exampleProjects = readdirSync(join(repoRoot, 'examples'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `examples/${entry.name}`)
    const expand = (pattern: string) => pattern.startsWith('examples/*')
      ? exampleProjects.map((project) => pattern.replace('examples/*', project))
      : [pattern]

    // `schemas/` is the source of truth and these copies are derived. Generated
    // projects validate themselves offline, so the bytes have to match exactly.
    // The human intake contract stays in this repository only.
    const contracts = [
      { file: 'input.schema.json', destinations: ['.harness', 'packages/cli/templates', 'examples/*/.harness'] },
      { file: 'output.schema.json', destinations: ['.harness', 'packages/cli/templates', 'examples/*/.harness'] },
      { file: 'agent-response.schema.json', destinations: ['.harness', 'packages/cli/templates', 'examples/*/.harness'] },
      // The runtime validates `harness.json` against the copy bundled in the
      // core package, so that copy is load-bearing rather than decorative.
      { file: 'harness.schema.json', destinations: ['.harness', 'packages/cli/templates', 'packages/core/schemas', 'examples/*/.harness'] },
      // Only the bundled copy exists: a preset manifest lives in a package, so
      // no project holds one to drift from.
      { file: 'preset.schema.json', destinations: ['packages/core/schemas'] },
      { file: 'task.example.json', destinations: ['.harness', 'packages/cli/templates', 'examples/*/.harness'] },
      { file: 'task.schema.json', destinations: ['.harness'] },
    ]

    for (const { file, destinations } of contracts) {
      const source = read(join('schemas', file))

      for (const pattern of destinations) {
        for (const destination of expand(pattern)) {
          expect(read(join(destination, file)), `${destination}/${file}`).toBe(source)
        }
      }
    }
  })

  // A hardcoded copy of the version silently kept reporting the previous release
  // after a bump, so the constant is read from the manifest and pinned here.
  it('reports the core runtime version the manifests actually declare', async () => {
    const { harnessCoreVersion } = await import('@pedyc/harness-core')

    expect(harnessCoreVersion).toMatch(/^\d+\.\d+\.\d+$/)
    for (const { dir } of packages) {
      expect(harnessCoreVersion, dir).toBe(readJson(join(dir, 'package.json')).version)
    }
  })

  it('declares consistent metadata across the publishable packages', () => {
    const versions = new Set(packages.map(({ dir }) => readJson(join(dir, 'package.json')).version))

    expect(versions.size).toBe(1)
    expect([...versions][0]).toMatch(/^\d+\.\d+\.\d+$/)

    for (const { dir, name, ships } of packages) {
      const manifest = readJson(join(dir, 'package.json'))

      expect(manifest.name).toBe(name)
      expect(manifest.license).toBe('MIT')
      expect(manifest.engines?.node).toBe('>=20')
      expect(manifest.publishConfig?.access).toBe('public')
      expect(manifest.description).toBeTruthy()
      expect(manifest.repository?.directory).toBe(dir)
      expect(manifest.files).toEqual(expect.arrayContaining([ships]))
      expect(manifest.files.some((entry: string) => /test|example|scripts/.test(entry))).toBe(false)
    }
  })

  it('points every export subpath at a file the build produced', () => {
    for (const { dir } of packages) {
      const manifest = readJson(join(dir, 'package.json'))

      for (const target of Object.values(manifest.exports ?? {}) as Array<string | Record<string, string>>) {
        for (const path of exportTargets(target)) {
          expect(exists(join(dir, path)), `${dir} -> ${path}`).toBe(true)
        }
      }
    }
  })

  it('ships a LICENSE next to every package manifest', () => {
    const rootLicense = read('LICENSE')

    for (const { dir } of packages) {
      expect(exists(join(dir, 'LICENSE'))).toBe(true)
      expect(read(join(dir, 'LICENSE'))).toBe(rootLicense)
      expect(exists(join(dir, 'README.md'))).toBe(true)
    }
  })

  it('keeps the CLI package self-contained', () => {
    const manifest = readJson('packages/cli/package.json')
    const binPath = join('packages/cli', manifest.bin['pedyc-harness'])

    expect(exists(binPath)).toBe(true)

    for (const target of Object.values(manifest.exports) as Array<string | Record<string, string>>) {
      for (const path of exportTargets(target)) {
        expect(exists(join('packages/cli', path)), `packages/cli -> ${path}`).toBe(true)
      }
    }

    // A published tarball has no repository around it, so the runtime must not
    // reach back into the workspace through a relative path.
    for (const entry of manifest.files) {
      const directory = join(repoRoot, 'packages/cli', entry)
      for (const file of walk(directory)) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/from\s+'[^']*\.\.\/\.\.\/\.\.\//)
        expect(source).not.toMatch(/scripts\/harness\//)
      }
    }
  })

  it('keeps the repository entry points as thin shims over the published package', () => {
    const cliShim = read('scripts/harness/cli.mjs')
    const runShim = read('scripts/harness/run.mjs')

    expect(cliShim).toContain("from 'pedyc-harness'")
    expect(cliShim).toContain('runCli')
    expect(runShim).toContain("from 'pedyc-harness/run'")
    expect(runShim).toContain('runHarness')

    for (const shim of [cliShim, runShim]) {
      // A shim delegates; it must not reimplement the runtime it replaced.
      expect(shim.split('\n').length).toBeLessThan(20)
    }
  })

  it('ships a provider-less agent configuration for every preset', () => {
    for (const { dir, name } of packages.filter(({ dir }) => dir.includes('preset'))) {
      const preset = readJson(join(dir, 'preset.json'))
      const agents = readJson(join(dir, 'agents.json'))

      // The package name is the preset's identity: `extends` and every error
      // message address it by package name, so a mismatch has to be impossible
      // to ship rather than merely caught at resolve time.
      expect(preset.name, dir).toBe(name)
      expect(preset.policy, dir).toBe('policy.json')
      expect(preset.agents, dir).toBe('agents.json')

      expect(agents.providers).toEqual({})
      expect(agents.planner).toEqual({ mode: 'internal' })
      for (const role of ['coder', 'tester', 'reviewer'] as const) {
        // A preset that omitted a role would otherwise make the assertions below
        // throw on `undefined` rather than report which role is missing.
        const config = agents[role]
        if (!config) throw new Error(`Preset '${name}' does not configure the ${role} role.`)

        expect(config.mode).toBe('external')
        expect(config.provider).toBe('custom')
      }

      // A preset is data: a package that still shipped code would be a second,
      // silently authoritative definition of what it means.
      expect(exists(join(dir, 'src'))).toBe(false)
      expect(exists(join(dir, 'dist'))).toBe(false)
    }
  })

  it('wires the release check into the root scripts and CI', () => {
    const scripts = readJson('package.json').scripts

    // The scripts are TypeScript now, so the commands point at compiled output
    // under `scripts/dist/`. `scripts/harness/*.mjs` keeps only the four shims.
    expect(scripts['release:check']).toBe('node scripts/dist/release-check.js')
    expect(exists('scripts/dist/release-check.js')).toBe(true)
    expect(scripts['release:publish']).toBe('node scripts/dist/publish.js')
    expect(exists('scripts/dist/publish.js')).toBe(true)

    // Publishing is irreversible, so the precondition checks must stay in place.
    const publish = read('scripts/harness/publish.ts')
    expect(publish).toContain('whoami')
    expect(publish).toContain('registry.npmjs.org')
    expect(publish).toContain('release:check')

    const workflow = read('.github/workflows/harness-verify.yml')
    expect(workflow).toContain('pnpm run release:check')
    expect(workflow).toContain('--frozen-lockfile')
  })

  it('documents the version rules and the v1.0 changelog', () => {
    expect(exists('CHANGELOG.md')).toBe(true)
    expect(read('CHANGELOG.md')).toContain('## [1.0.0]')

    const release = read('docs/release.md')
    expect(release).toContain('SemVer')
    expect(release).toContain('Provider')
    expect(read('docs/README.md')).toContain('./release.md')
  })
})

function walk(target: string): string[] {
  if (!existsSync(target)) return []
  if (statSync(target).isFile()) return [target]
  const entries = readdirSync(target, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(target, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}
