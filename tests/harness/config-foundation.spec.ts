import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { loadHarnessConfig } from '@pedyc/harness-core'
import type { HarnessConfigError } from '@pedyc/harness-core/contracts'

const repoRoot = resolve(import.meta.dirname, '../..')
const cliPath = join(repoRoot, 'scripts/harness/cli.mjs')

type CliResult = { code: number; stdout: string; stderr: string }

const runCli = (cwd: string, ...args: string[]) => new Promise<CliResult>((resolveResult) => {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolveResult({ code: code ?? 1, stdout, stderr }))
})

const writeText = async (path: string, content: string) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

const writeJson = async (path: string, value: unknown) =>
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)

const readErrors = (root: string): HarnessConfigError[] => {
  const result = loadHarnessConfig(root)
  if (result.ok) throw new Error('Expected the configuration to be rejected, but it loaded.')
  return result.errors
}

const codesOf = (errors: HarnessConfigError[]): string[] => errors.map(({ code }) => code)

/** A project directory with a manifest and nothing else under `.harness/`. */
const createProject = async (manifest?: unknown | string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pedyc-config-'))
  await mkdir(join(root, '.harness'), { recursive: true })
  await writeJson(join(root, 'package.json'), { name: 'pedyc-config-fixture', version: '0.0.0', private: true })
  if (manifest !== undefined) {
    if (typeof manifest === 'string') await writeText(join(root, '.harness/harness.json'), manifest)
    else await writeJson(join(root, '.harness/harness.json'), manifest)
  }
  return root
}

/** Copy of an initialized example, which is what a real project looks like. */
const copyExample = async (name: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), `pedyc-config-${name}-`))
  await cp(join(repoRoot, 'examples', name), root, {
    recursive: true,
    filter: (source) => !source.includes(join('.harness', 'runs')),
  })
  return root
}

describe('M15 config loader', () => {
  it('loads a project that has only a manifest, falling back to the conventional documents', async () => {
    const root = await createProject({ version: 1 })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.manifest?.version).toBe(1)
    // The one decision worth pinning: a source that is not a file says so,
    // rather than reporting a path that was never read.
    expect(result.config.sources).toContainEqual({ kind: 'policy', location: 'built-in defaults', active: true })
    expect(result.config.sources).toContainEqual({ kind: 'agents', location: 'built-in defaults', active: true })
    expect(result.config.sources[0]).toEqual({ kind: 'manifest', location: '.harness/harness.json', active: true })
  })

  it('records a declared preset without consuming it', async () => {
    const root = await createProject({ version: 1, presets: ['@pedyc/harness-preset-vue'] })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.sources).toContainEqual({
      kind: 'preset',
      location: '@pedyc/harness-preset-vue',
      active: false,
    })
  })

  it('reads relative paths, and refuses paths that leave the governance directory', async () => {
    const root = await createProject({ version: 1, policy: 'config/policy.json' })
    await writeJson(join(root, '.harness/config/policy.json'), {
      maxIterations: 2,
      allowedProductPaths: ['src/'],
      protectedPaths: [],
      requiredChecks: [],
    })
    const nested = loadHarnessConfig(root)
    expect(nested.ok).toBe(true)
    if (nested.ok) expect(nested.config.policy.maxIterations).toBe(2)

    for (const escaping of ['../policy.json', '/etc/policy.json', 'nested/../../policy.json']) {
      const outside = await createProject({ version: 1, policy: escaping })
      expect(codesOf(readErrors(outside)), escaping).toEqual(['config_path_outside_harness'])
    }
  })

  it('names both the offending file and the field when a declared document is bad', async () => {
    const missing = await createProject({ version: 1, policy: 'missing.json' })
    const missingErrors = readErrors(missing)
    expect(codesOf(missingErrors)).toEqual(['config_file_missing'])
    expect(missingErrors[0].file).toBe('.harness/harness.json')
    expect(missingErrors[0].field).toBe('policy')

    const invalid = await createProject({ version: 1, policy: 'policy.json' })
    await writeJson(join(invalid, '.harness/policy.json'), { maxIterations: 0, allowedProductPaths: [] })
    const invalidErrors = readErrors(invalid)
    expect(invalidErrors.length).toBeGreaterThan(0)
    expect(invalidErrors.every(({ code }) => code === 'config_file_invalid')).toBe(true)
    expect(invalidErrors.every(({ file }) => file === '.harness/policy.json')).toBe(true)
    expect(invalidErrors.map(({ field }) => field)).toEqual(
      expect.arrayContaining(['allowedProductPaths', 'maxIterations']),
    )
  })

  it('reports an unreadable document and unparsable JSON as separate causes', async () => {
    const unparsable = await createProject('{ "version": 1, }')
    const unparsableErrors = readErrors(unparsable)
    expect(codesOf(unparsableErrors)).toEqual(['manifest_invalid_json'])
    expect(unparsableErrors[0].file).toBe('.harness/harness.json')

    const directory = await createProject({ version: 1 })
    await mkdir(join(directory, '.harness/agents.json'), { recursive: true })
    const directoryErrors = readErrors(directory)
    expect(codesOf(directoryErrors)).toEqual(['config_file_unreadable'])
    expect(directoryErrors[0].file).toBe('.harness/agents.json')
  })

  it('rejects a manifest whose shape is wrong, naming the field', async () => {
    const unknownField = await createProject({ version: 1, extends: '@pedyc/harness-preset-vue' })
    const unknownErrors = readErrors(unknownField)
    expect(codesOf(unknownErrors)).toEqual(['manifest_invalid'])
    expect(unknownErrors[0].file).toBe('.harness/harness.json')
    expect(unknownErrors[0].field).toBe('extends')

    const wrongVersion = await createProject({ version: 2 })
    expect(codesOf(readErrors(wrongVersion))).toEqual(['manifest_invalid'])

    const notAnObject = await createProject([1, 2, 3])
    expect(codesOf(readErrors(notAnObject))).toEqual(['manifest_invalid'])
  })

  it('reports a missing governance directory rather than defaulting silently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-config-empty-'))
    const errors = readErrors(root)
    expect(codesOf(errors)).toEqual(['harness_directory_missing'])
    expect(errors[0].file).toBe('.harness')
  })

  it('keeps a project without a manifest on the pre-manifest behaviour', async () => {
    const root = await createProject()
    await writeJson(join(root, '.harness/policy.json'), {
      maxIterations: 3,
      allowedProductPaths: ['lib/'],
      protectedPaths: ['.harness/'],
      requiredChecks: [],
    })
    await writeJson(join(root, '.harness/agents.json'), {
      providers: {},
      planner: { mode: 'internal' },
      coder: { mode: 'internal' },
      tester: { mode: 'internal' },
      reviewer: { mode: 'internal' },
    })

    const result = loadHarnessConfig(root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.manifest).toBeNull()
    expect(result.config.policy.allowedProductPaths).toEqual(['lib/'])
    expect(result.config.sources).toEqual([
      { kind: 'policy', location: '.harness/policy.json', active: true },
      { kind: 'agents', location: '.harness/agents.json', active: true },
    ])
  })
})

describe('M15 config layer boundaries', () => {
  const sourceFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return entry.name.endsWith('.ts') ? [path] : []
    })

  const importsOf = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])

  it('never lets the config layer reach into the runtime', () => {
    for (const file of sourceFiles(join(repoRoot, 'packages/core/src/config'))) {
      const climbing = importsOf(file).filter((specifier) => specifier.includes('runtime'))
      expect(climbing, file).toEqual([])
    }
  })

  it('keeps contracts free of file system access and side effects', () => {
    for (const file of sourceFiles(join(repoRoot, 'packages/core/src/contracts'))) {
      const modules = importsOf(file).filter((specifier) => specifier.startsWith('node:'))
      expect(modules, file).toEqual([])
    }
  })

  it('reads no configuration document in the runtime layer', () => {
    // Matches the read, not the string: a runtime module may *name* a document
    // in an error message, which is what makes the failure actionable, but the
    // loader must stay the only thing that opens one. A second reader is how
    // two definitions of "valid configuration" drift apart again.
    const configRead = /(?:readFileSync|readJson|readFile)\s*\([^)]*\.harness/

    for (const file of sourceFiles(join(repoRoot, 'packages/core/src/runtime'))) {
      expect(readFileSync(file, 'utf8').match(configRead)?.[0] ?? null, file).toBeNull()
    }
  })
})

describe('M15 CLI integration', () => {
  it('initializes a manifest that names the preset package', async () => {
    const root = await copyExample('generic-project')
    await rm(join(root, '.harness/harness.json'))

    const result = await runCli(root, 'init', '--preset', 'generic')

    expect(result.code).toBe(0)
    const manifest = JSON.parse(await readFile(join(root, '.harness/harness.json'), 'utf8'))
    expect(manifest).toMatchObject({ version: 1, presets: ['@pedyc/harness-preset-generic'] })
  })

  it('verifies and dry-runs a project whose only configuration is the manifest', async () => {
    const root = await copyExample('generic-project')
    await rm(join(root, '.harness/policy.json'))
    await rm(join(root, '.harness/agents.json'))

    const verify = await runCli(root, 'verify')
    expect(verify.code).toBe(0)

    const dryRun = await runCli(root, 'run', '--dry-run', '--json')
    expect(dryRun.code).toBe(0)
    expect(JSON.parse(dryRun.stdout).status).toBe('passed')
  })

  it('exits with the configuration code and names the file and field', async () => {
    const root = await copyExample('generic-project')
    await writeJson(join(root, '.harness/harness.json'), { version: 1, policy: '../outside.json' })

    const result = await runCli(root, 'verify')

    expect(result.code).toBe(5)
    expect(result.stderr).toContain('.harness/harness.json')
    expect(result.stderr).toContain('policy')
  })

  it('reports the sources a run will actually use', async () => {
    const root = await copyExample('vue-project')

    const result = await runCli(root, 'doctor')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('manifest\t.harness/harness.json')
    expect(result.stdout).toContain('policy\t.harness/policy.json')
    expect(result.stdout).toContain('preset\t@pedyc/harness-preset-vue\t(declared, not yet consumed)')
  })

  it('reports a configuration error from doctor instead of a healthy-looking report', async () => {
    const root = await copyExample('vue-project')
    await writeText(join(root, '.harness/harness.json'), '{ not json')

    const result = await runCli(root, 'doctor')

    expect(result.code).toBe(5)
    expect(result.stderr).toContain('.harness/harness.json')
  })
})
