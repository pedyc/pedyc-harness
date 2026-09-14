import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const read = (relativePath: string) => readFileSync(join(repoRoot, relativePath), 'utf8')
const readJson = (relativePath: string) => JSON.parse(read(relativePath))
const exists = (relativePath: string) => existsSync(join(repoRoot, relativePath))

const packages = [
  { dir: 'packages/core', name: '@pedyc/harness-core' },
  { dir: 'packages/cli', name: 'pedyc-harness' },
  { dir: 'packages/preset-generic', name: '@pedyc/harness-preset-generic' },
  { dir: 'packages/preset-vue', name: '@pedyc/harness-preset-vue' },
]

const templates = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json', 'task.example.json']

describe('release configuration', () => {
  it('keeps the CLI templates byte-identical to the repository contracts', () => {
    for (const file of templates) {
      expect(read(join('packages/cli/templates', file))).toBe(read(join('.harness', file)))
    }
  })

  it('declares consistent metadata across the publishable packages', () => {
    const versions = new Set(packages.map(({ dir }) => readJson(join(dir, 'package.json')).version))

    expect(versions.size).toBe(1)
    expect([...versions][0]).toMatch(/^\d+\.\d+\.\d+$/)

    for (const { dir, name } of packages) {
      const manifest = readJson(join(dir, 'package.json'))

      expect(manifest.name).toBe(name)
      expect(manifest.license).toBe('MIT')
      expect(manifest.engines?.node).toBe('>=20')
      expect(manifest.publishConfig?.access).toBe('public')
      expect(manifest.description).toBeTruthy()
      expect(manifest.repository?.directory).toBe(dir)
      expect(manifest.files).toEqual(expect.arrayContaining(['src']))
      expect(manifest.files.some((entry: string) => /test|example|scripts/.test(entry))).toBe(false)
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

    for (const target of Object.values(manifest.exports) as string[]) {
      expect(exists(join('packages/cli', target))).toBe(true)
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

  it('generates a provider-less agent configuration for every preset', async () => {
    const { availablePresets, getPreset } = await import('pedyc-harness')

    expect(availablePresets().sort()).toEqual(['generic', 'vue'])

    for (const name of availablePresets()) {
      const preset = getPreset(name)

      expect(preset.agents.providers).toEqual({})
      expect(preset.agents.planner).toEqual({ mode: 'internal' })
      for (const role of ['coder', 'tester', 'reviewer']) {
        expect(preset.agents[role].mode).toBe('external')
        expect(preset.agents[role].provider).toBe('custom')
      }
    }
  })

  it('wires the release check into the root scripts and CI', () => {
    const scripts = readJson('package.json').scripts

    expect(scripts['release:check']).toBe('node scripts/harness/release-check.mjs')
    expect(exists('scripts/harness/release-check.mjs')).toBe(true)

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
