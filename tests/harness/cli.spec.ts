import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectPackageManager } from '../../scripts/harness/package-manager.mjs'

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

describe('pedyc-harness CLI', () => {
  it('initializes generic preset without overwriting existing configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-harness-'))
    await writeFile(join(root, 'package.json'), '{}')
    await runCli(root, 'init', '--preset', 'generic')
    const policyPath = join(root, '.harness/policy.json')
    const original = await readFile(policyPath, 'utf8')
    await writeFile(policyPath, '{"custom":true}\n')

    const result = await runCli(root, 'init', '--preset', 'generic')
    expect(result.code).toBe(0)
    expect(await readFile(policyPath, 'utf8')).toBe('{"custom":true}\n')
    expect(original).toContain('"allowedProductPaths"')
  })

  it('overwrites generated files only with --force', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-harness-'))
    await writeFile(join(root, 'package.json'), '{}')
    await runCli(root, 'init', '--preset', 'generic')
    const policyPath = join(root, '.harness/policy.json')
    await writeFile(policyPath, '{"custom":true}\n')

    const result = await runCli(root, 'init', '--preset', 'generic', '--force')
    expect(result.code).toBe(0)
    expect(await readFile(policyPath, 'utf8')).toContain('"allowedProductPaths"')
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
