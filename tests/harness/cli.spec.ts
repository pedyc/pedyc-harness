import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectPackageManager } from '../../scripts/harness/package-manager.mjs'
import { presetPackageName } from '../../packages/cli/src/presets.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const cliPath = join(projectRoot, 'scripts/harness/cli.mjs')

const runCli = (cwd: string, ...args: string[]) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
})

/**
 * A project with the official presets resolvable from it.
 *
 * A preset is a dependency, so `init` can only resolve one the project can see.
 * Linking the workspace package is what an install would have produced.
 */
const createProject = async (presets: string[] = ['generic', 'vue']): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pedyc-harness-'))
  await writeFile(join(root, 'package.json'), '{"name":"pedyc-cli-fixture","version":"0.0.0"}\n')
  if (presets.length > 0) {
    const scope = join(root, 'node_modules', '@pedyc')
    await mkdir(scope, { recursive: true })
    for (const preset of presets) {
      await symlink(join(projectRoot, `packages/preset-${preset}`), join(scope, `harness-preset-${preset}`), 'junction')
    }
  }
  return root
}

describe('pedyc-harness CLI', () => {
  it('initializes a project by declaring the preset rather than copying it', async () => {
    const root = await createProject()

    const result = await runCli(root, 'init', '--preset', 'generic')

    expect(result.code).toBe(0)
    expect(JSON.parse(await readFile(join(root, '.harness/harness.json'), 'utf8'))).toEqual({
      $schema: 'https://pedyc.dev/schema/harness.json',
      version: 1,
      presets: ['@pedyc/harness-preset-generic'],
    })
    // The governance stays in the package, so upgrading the preset is a version
    // bump rather than a diff the project has to merge by hand.
    await expect(readFile(join(root, '.harness/policy.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(root, '.harness/agents.json'), 'utf8')).rejects.toThrow()
  })

  it('leaves a project file alone unless --force is given', async () => {
    const root = await createProject()
    await runCli(root, 'init', '--preset', 'generic')
    const agentsPath = join(root, 'AGENTS.md')
    await writeFile(agentsPath, '# house rules\n')

    const again = await runCli(root, 'init', '--preset', 'generic')
    expect(again.code).toBe(0)
    expect(await readFile(agentsPath, 'utf8')).toBe('# house rules\n')

    const forced = await runCli(root, 'init', '--preset', 'generic', '--force')
    expect(forced.code).toBe(0)
    expect(await readFile(agentsPath, 'utf8')).toContain('Harness project instructions')
  })

  it('is idempotent, producing the same tree on a second run', async () => {
    const root = await createProject()
    await runCli(root, 'init', '--preset', 'generic')
    const first = await readFile(join(root, '.harness/harness.json'), 'utf8')

    const second = await runCli(root, 'init', '--preset', 'generic')

    expect(second.code).toBe(0)
    expect(await readFile(join(root, '.harness/harness.json'), 'utf8')).toBe(first)
  })

  it('seeds the Vue preset instructions and policy', async () => {
    const root = await createProject()

    const result = await runCli(root, 'init', '--preset', 'vue')

    expect(result.code).toBe(0)
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain('Vue 3')
    const verify = await runCli(root, 'verify')
    expect(verify.code).toBe(5)
    expect(verify.stderr).toContain('type-check')
  })

  it('reports contract differences and updates only missing files by default', async () => {
    const root = await createProject()
    await runCli(root, 'init', '--preset', 'generic')
    const taskPath = join(root, '.harness/task.example.json')
    await writeFile(taskPath, '{"custom":true}\n')

    const diffResult = await runCli(root, 'diff')
    expect(diffResult.code).toBe(0)
    expect(diffResult.stdout).toContain('modified\t.harness/task.example.json')
    expect(diffResult.stdout).toContain('unchanged\t.harness/input.schema.json')

    await runCli(root, 'update')
    expect(await readFile(taskPath, 'utf8')).toBe('{"custom":true}\n')
  })

  it('updates modified contracts only with --force', async () => {
    const root = await createProject()
    await runCli(root, 'init', '--preset', 'generic')
    const taskPath = join(root, '.harness/task.example.json')
    await writeFile(taskPath, '{"custom":true}\n')

    const result = await runCli(root, 'update', '--force')

    expect(result.code).toBe(0)
    expect(await readFile(taskPath, 'utf8')).toContain('"acceptanceCriteria"')
  })
})

describe('preset naming', () => {
  it('expands a short name into the package it must be, and only that', () => {
    expect(presetPackageName('generic')).toBe('@pedyc/harness-preset-generic')
    expect(presetPackageName('vue')).toBe('@pedyc/harness-preset-vue')
    // A name with a scope is already a package name: that is what lets a team
    // preset work without an entry in any list this repository ships.
    expect(presetPackageName('@acme/web')).toBe('@acme/web')
  })
})

describe('package manager detection', () => {
  it('prefers pnpm, then yarn, and falls back to npm', async () => {
    const pnpmRoot = await mkdtemp(join(tmpdir(), 'pedyc-pnpm-'))
    await writeFile(join(pnpmRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    expect(detectPackageManager(pnpmRoot).name).toBe('pnpm')

    const yarnRoot = await mkdtemp(join(tmpdir(), 'pedyc-yarn-'))
    await writeFile(join(yarnRoot, 'yarn.lock'), '')
    expect(detectPackageManager(yarnRoot).name).toBe('yarn')

    const npmRoot = await mkdtemp(join(tmpdir(), 'pedyc-npm-'))
    expect(detectPackageManager(npmRoot).name).toBe('npm')
  })
})
