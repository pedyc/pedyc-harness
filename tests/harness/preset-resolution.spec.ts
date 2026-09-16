import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { loadHarnessConfig, presetPackageName, resolvePresets } from '@pedyc/harness-core'
import type { HarnessConfigError } from '@pedyc/harness-core/contracts'

const repoRoot = resolve(import.meta.dirname, '../..')
const cliPath = join(repoRoot, 'scripts/harness/cli.mjs')

const writeText = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

const writeJson = async (path: string, value: unknown): Promise<void> =>
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)

/** A project with a manifest and, optionally, the documents it declares. */
const createProject = async (
  manifest: Record<string, unknown> = { version: 1 },
  documents: Record<string, string> = {},
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pedyc-preset-'))
  await writeJson(join(root, 'package.json'), { name: 'pedyc-preset-fixture', version: '0.0.0', private: true })
  await writeJson(join(root, '.harness/harness.json'), manifest)
  for (const [file, content] of Object.entries(documents)) await writeText(join(root, file), content)
  return root
}

interface FixturePreset {
  /** The package name, which is also what `extends` entries name. */
  name: string
  preset?: Record<string, unknown>
  files?: Record<string, string>
}

/**
 * Writes a preset package into a project's `node_modules`.
 *
 * A real install is the only other way to produce this layout, and these
 * fixtures need to be packages that do not exist on npm.
 */
const writePresetPackage = async (root: string, { name, preset = {}, files = {} }: FixturePreset): Promise<void> => {
  const directory = join(root, 'node_modules', ...name.split('/'))
  await writeJson(join(directory, 'package.json'), { name, version: '0.0.0' })
  await writeJson(join(directory, 'preset.json'), {
    $schema: 'https://pedyc.dev/schema/preset.json',
    name,
    ...preset,
  })
  for (const [file, content] of Object.entries(files)) await writeText(join(directory, file), content)
}

const policy = (allowedProductPaths: string[], maxIterations = 3): string =>
  `${JSON.stringify({ maxIterations, allowedProductPaths, protectedPaths: [], requiredChecks: [] }, null, 2)}\n`

const readErrors = (root: string): HarnessConfigError[] => {
  const result = loadHarnessConfig(root)
  if (result.ok) throw new Error('Expected the configuration to be rejected, but it loaded.')
  return result.errors
}

const errorsOf = (root: string, requested: string[]): HarnessConfigError[] => {
  const result = resolvePresets(root, requested)
  if (result.ok) throw new Error('Expected the presets to be rejected, but they resolved.')
  return result.errors
}

const orderOf = (root: string, requested: string[]): string[] => {
  const result = resolvePresets(root, requested)
  if (!result.ok) throw new Error(`Expected the presets to resolve, but got: ${result.errors.map(({ message }) => message).join(' ')}`)
  return result.presets.map(({ packageName }) => packageName)
}

describe('M16 preset naming', () => {
  it('expands a short name and passes a package name through', () => {
    expect(presetPackageName('vue')).toBe('@pedyc/harness-preset-vue')
    expect(presetPackageName('@acme/harness-preset-web')).toBe('@acme/harness-preset-web')
    // Anything scoped is already a package name, so a preset nobody published
    // through this project works without a registry entry anywhere.
    expect(presetPackageName('@acme/web')).toBe('@acme/web')
  })
})

describe('M16 preset resolution', () => {
  it('resolves the official presets as npm packages', async () => {
    const root = await createProject({ version: 1, presets: ['generic'] })
    const scope = join(root, 'node_modules', '@pedyc')
    await mkdir(scope, { recursive: true })
    await symlink(join(repoRoot, 'packages/preset-generic'), join(scope, 'harness-preset-generic'), 'junction')

    // Named as a short name in the manifest, resolved as a package: no table in
    // the CLI could have been involved, because the CLI is not running here.
    expect(orderOf(root, ['generic'])).toEqual(['@pedyc/harness-preset-generic'])
  })

  it('fails with an install command when a preset is not installed', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })

    const errors = readErrors(root)

    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('preset_not_installed')
    expect(errors[0].file).toBe('@acme/harness-preset-web')
    expect(errors[0].message).toContain('npm install --save-dev @acme/harness-preset-web')
  })

  it('names the preset that required a missing transitive dependency', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { extends: ['@acme/harness-preset-base'] },
    })

    const errors = errorsOf(root, ['@acme/harness-preset-web'])

    expect(errors[0].code).toBe('preset_not_installed')
    expect(errors[0].message).toContain('@acme/harness-preset-web requires it')
  })

  it('loads a preset once however many chains reach it', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web', '@acme/harness-preset-api'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { extends: ['@acme/harness-preset-base'] },
    })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-api',
      preset: { extends: ['@acme/harness-preset-base'] },
    })
    await writePresetPackage(root, { name: '@acme/harness-preset-base' })

    const order = orderOf(root, ['@acme/harness-preset-web', '@acme/harness-preset-api'])

    expect(order).toEqual([
      '@acme/harness-preset-base',
      '@acme/harness-preset-web',
      '@acme/harness-preset-api',
    ])
    expect(order.filter((name) => name === '@acme/harness-preset-base')).toHaveLength(1)
  })

  it('accepts the same preset listed twice', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-base', '@acme/harness-preset-base'] })
    await writePresetPackage(root, { name: '@acme/harness-preset-base' })

    expect(orderOf(root, ['@acme/harness-preset-base', '@acme/harness-preset-base']))
      .toEqual(['@acme/harness-preset-base'])
  })

  it('reports the whole cycle rather than recursing', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/a'] })
    await writePresetPackage(root, { name: '@acme/a', preset: { extends: ['@acme/b'] } })
    await writePresetPackage(root, { name: '@acme/b', preset: { extends: ['@acme/c'] } })
    await writePresetPackage(root, { name: '@acme/c', preset: { extends: ['@acme/a'] } })

    const errors = readErrors(root)

    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('preset_cyclic')
    // The loop, not just one member of it: which `extends` to remove is the only
    // question a reader has, and one name does not answer it.
    expect(errors[0].message).toContain('@acme/a → @acme/b → @acme/c → @acme/a')
  })

  it('reports a preset that inherits from itself', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/a'] })
    await writePresetPackage(root, { name: '@acme/a', preset: { extends: ['@acme/a'] } })

    const errors = errorsOf(root, ['@acme/a'])

    expect(errors[0].code).toBe('preset_cyclic')
    expect(errors[0].message).toContain('@acme/a → @acme/a')
  })

  it('rejects a preset whose name does not match its package', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, { name: '@acme/harness-preset-web', preset: { name: '@acme/other' } })

    const errors = errorsOf(root, ['@acme/harness-preset-web'])

    expect(errors[0].code).toBe('preset_manifest_invalid')
    expect(errors[0].field).toBe('name')
  })

  it('rejects a document path that leaves the preset package', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { policy: '../../../outside.json' },
    })

    const errors = errorsOf(root, ['@acme/harness-preset-web'])

    expect(errors[0].code).toBe('preset_path_outside_package')
    expect(errors[0].field).toBe('policy')
  })

  it('reports a declared document the package does not contain', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, { name: '@acme/harness-preset-web', preset: { policy: 'missing.json' } })

    const errors = errorsOf(root, ['@acme/harness-preset-web'])

    expect(errors[0].code).toBe('config_file_missing')
    expect(errors[0].file).toBe('@acme/harness-preset-web/preset.json')
    expect(errors[0].field).toBe('policy')
  })

  it('leaves a project with no presets exactly as it was', async () => {
    const root = await createProject({ version: 1 })

    const result = resolvePresets(root, [])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.presets).toEqual([])
  })
})

describe('M16 preset documents', () => {
  it('reads a policy and an agent routing out of the preset package', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { policy: 'policy.json', agents: 'agents.json' },
      files: {
        'policy.json': policy(['web/'], 4),
        'agents.json': `${JSON.stringify({
          providers: {},
          planner: { mode: 'internal' },
          coder: { mode: 'internal' },
          tester: { mode: 'internal' },
          reviewer: { mode: 'internal' },
        }, null, 2)}\n`,
      },
    })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.policy.allowedProductPaths).toEqual(['web/'])
    expect(result.config.policy.maxIterations).toBe(4)
    expect(result.config.sources).toContainEqual({
      kind: 'policy',
      location: '@acme/harness-preset-web/policy.json',
      active: true,
    })
  })

  it('lets the project document outrank the preset that supplies one', async () => {
    const root = await createProject(
      { version: 1, presets: ['@acme/harness-preset-web'] },
      { '.harness/policy.json': policy(['local/'], 9) },
    )
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { policy: 'policy.json' },
      files: { 'policy.json': policy(['web/'], 4) },
    })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Source selection, not field merging: the project's own statement about
    // this project beats a statement about its stack. Merging both is M17.
    expect(result.config.policy.allowedProductPaths).toEqual(['local/'])
    expect(result.config.sources).toContainEqual({ kind: 'policy', location: '.harness/policy.json', active: true })
  })

  it('applies the later preset when two of them provide the same document', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-base',
      preset: { policy: 'policy.json' },
      files: { 'policy.json': policy(['base/'], 2) },
    })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { extends: ['@acme/harness-preset-base'], policy: 'policy.json' },
      files: { 'policy.json': policy(['web/'], 4) },
    })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Dependencies come first, so the preset that inherits is the one that wins.
    expect(result.config.policy.allowedProductPaths).toEqual(['web/'])
  })

  it('falls back to the built-in defaults when no preset provides the document', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-base'] })
    await writePresetPackage(root, { name: '@acme/harness-preset-base' })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.sources).toContainEqual({ kind: 'policy', location: 'built-in defaults', active: true })
    expect(result.config.sources).toContainEqual({ kind: 'preset', location: '@acme/harness-preset-base', active: true })
  })

  it('reports a preset document that is not valid policy as configuration, not as a crash', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { policy: 'policy.json' },
      files: { 'policy.json': '{"maxIterations": 0}\n' },
    })

    const errors = readErrors(root)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every(({ code }) => code === 'config_file_invalid')).toBe(true)
    expect(errors[0].file).toBe('@acme/harness-preset-web/policy.json')
  })
})

type CliResult = { code: number; stdout: string; stderr: string }

const runCli = (cwd: string, ...args: string[]) => new Promise<CliResult>((resolveResult) => {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolveResult({ code: code ?? 1, stdout, stderr }))
})

describe('M16 CLI', () => {
  it('writes the manifest and the contracts, and copies no preset content', async () => {
    const root = await createProject({ version: 1 })
    await rm(join(root, '.harness/harness.json'))
    const scope = join(root, 'node_modules', '@pedyc')
    await mkdir(scope, { recursive: true })
    await symlink(join(repoRoot, 'packages/preset-vue'), join(scope, 'harness-preset-vue'), 'junction')

    const result = await runCli(root, 'init', '--preset', 'vue')

    expect(result.code).toBe(0)
    const manifest = JSON.parse(await readFile(join(root, '.harness/harness.json'), 'utf8'))
    expect(manifest).toEqual({
      $schema: 'https://pedyc.dev/schema/harness.json',
      version: 1,
      presets: ['@pedyc/harness-preset-vue'],
    })
    // The preset's governance stays in the preset: a copy in the tree is what
    // makes upgrading it a diff the project has to resolve by hand.
    await expect(readFile(join(root, '.harness/policy.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(root, '.harness/agents.json'), 'utf8')).rejects.toThrow()
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain('Vue 3')
  })

  it('enforces the preset policy in a project that has no policy of its own', async () => {
    const root = await createProject()
    await rm(join(root, '.harness/harness.json'))
    await writeText(join(root, 'package.json'), '{"name":"pedyc-consumer","version":"0.0.0"}\n')
    const scope = join(root, 'node_modules', '@pedyc')
    await mkdir(scope, { recursive: true })
    await symlink(join(repoRoot, 'packages/preset-vue'), join(scope, 'harness-preset-vue'), 'junction')

    expect((await runCli(root, 'init', '--preset', 'vue')).code).toBe(0)

    // Nothing in the project states these gates: they are read out of the
    // installed package, which is the whole point of declaring a preset.
    const ungated = await runCli(root, 'verify')
    expect(ungated.code).toBe(5)
    expect(ungated.stderr).toContain('type-check')
  })

  it('says so when an existing manifest keeps its own presets', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, { name: '@acme/harness-preset-web' })
    const scope = join(root, 'node_modules', '@pedyc')
    await mkdir(scope, { recursive: true })
    await symlink(join(repoRoot, 'packages/preset-vue'), join(scope, 'harness-preset-vue'), 'junction')

    const result = await runCli(root, 'init', '--preset', 'vue')

    // Initializing over a project that already declares presets must not look
    // like the new preset took effect.
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('declares its own presets')
    expect(JSON.parse(await readFile(join(root, '.harness/harness.json'), 'utf8')).presets)
      .toEqual(['@acme/harness-preset-web'])
  })

  it('lists the presets a project follows and what they inherit', async () => {
    const root = await createProject({ version: 1, presets: ['@acme/harness-preset-web'] })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-base',
      preset: { policy: 'policy.json' },
      files: { 'policy.json': policy(['base/']) },
    })
    await writePresetPackage(root, {
      name: '@acme/harness-preset-web',
      preset: { extends: ['@acme/harness-preset-base'] },
    })

    const result = await runCli(root, 'list-presets')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('@acme/harness-preset-base\tinherited')
    expect(result.stdout).toContain('@acme/harness-preset-web\tdeclared\textends: @acme/harness-preset-base')
  })

  it('refuses to initialize a project whose preset is not installed', async () => {
    const root = await createProject({ version: 1 })
    await rm(join(root, '.harness/harness.json'))

    const result = await runCli(root, 'init', '--preset', '@acme/harness-preset-web', '--no-install')

    expect(result.code).toBe(5)
    expect(result.stderr).toContain('@acme/harness-preset-web is not installed')
  })

  it('reports no presets instead of failing in a project that declares none', async () => {
    const root = await createProject({ version: 1 })

    const result = await runCli(root, 'list-presets')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('No presets are declared')
  })
})
