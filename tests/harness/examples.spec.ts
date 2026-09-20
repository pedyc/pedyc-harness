import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const cliPath = join(repoRoot, 'scripts/harness/cli.mjs')
const schemaFiles = ['input.schema.json', 'output.schema.json', 'agent-response.schema.json']

type CliResult = { code: number; stdout: string; stderr: string }

const runCli = (cwd: string, ...args: string[]) => new Promise<CliResult>((resolveResult) => {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolveResult({ code: code ?? 1, stdout, stderr }))
})

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

const task = {
  feature: 'Exercise the harness',
  objective: 'Prove the harness runs without Vue-specific project layout.',
  acceptanceCriteria: ['The harness reports a structured result'],
  maxIterations: 1,
}

const basePolicy = (overrides: Record<string, unknown> = {}) => ({
  maxIterations: 1,
  protectedPaths: ['.harness/'],
  requiredChecks: [],
  forbiddenCommands: [],
  allowedAgentCommands: [],
  allowedProductPaths: ['src/'],
  agentTimeoutMs: 300000,
  ...overrides,
})

const internalAgents = {
  providers: {},
  planner: { mode: 'internal' },
  coder: { mode: 'internal' },
  tester: { mode: 'internal' },
  reviewer: { mode: 'internal' },
}

const createProject = async ({
  policy,
  agents,
  scripts = {},
  sourceFiles = {},
}: {
  policy: Record<string, unknown>
  agents: Record<string, unknown>
  scripts?: Record<string, string>
  sourceFiles?: Record<string, string>
}) => {
  const root = await mkdtemp(join(tmpdir(), 'pedyc-fixture-'))
  await mkdir(join(root, '.harness'), { recursive: true })
  for (const schema of schemaFiles) {
    await copyFile(join(repoRoot, '.harness', schema), join(root, '.harness', schema))
  }
  await writeJson(join(root, '.harness/policy.json'), policy)
  await writeJson(join(root, '.harness/agents.json'), agents)
  await writeJson(join(root, '.harness/task.json'), task)
  await writeJson(join(root, 'package.json'), {
    name: 'pedyc-fixture',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts,
  })
  for (const [relativePath, content] of Object.entries(sourceFiles)) {
    const path = join(root, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
  return root
}

const copyExample = async (name: string, preset: string) => {
  const root = await mkdtemp(join(tmpdir(), `pedyc-example-${name}-`))
  await cp(join(repoRoot, 'examples', name), root, {
    recursive: true,
    filter: (source) => !source.includes(join('.harness', 'runs')),
  })
  // The example declares a preset, and a preset is resolved like any other
  // dependency: outside the workspace that means an install, so the copy needs
  // the package resolvable from its own directory.
  const scope = join(root, 'node_modules', '@pedyc')
  await mkdir(scope, { recursive: true })
  await symlink(join(repoRoot, `packages/preset-${preset}`), join(scope, `harness-preset-${preset}`), 'junction')
  return root
}

const examples = [
  { directory: 'generic-project', preset: 'generic', manager: 'pnpm' },
  { directory: 'vue-project', preset: 'vue', manager: 'yarn' },
  { directory: 'node-project', preset: 'generic', manager: 'npm' },
]

describe('external project examples', () => {
  it.each(examples)('passes init, verify, doctor and dry-run for $directory', async ({ directory, preset, manager }) => {
    const root = await copyExample(directory, preset)
    const policyPath = join(root, '.harness/policy.json')
    const before = await readFile(policyPath, 'utf8')

    const init = await runCli(root, 'init', '--preset', preset)
    expect(init.code).toBe(0)
    expect(await readFile(policyPath, 'utf8')).toBe(before)

    const verify = await runCli(root, 'verify')
    expect(verify.code).toBe(0)

    const doctor = await runCli(root, 'doctor')
    expect(doctor.code).toBe(0)
    expect(doctor.stdout).toContain(`Package manager: ${manager}`)

    const dryRun = await runCli(root, 'run', '--dry-run', '--json')
    expect(dryRun.code).toBe(0)
    const output = JSON.parse(dryRun.stdout) as { status: string; dryRun: boolean }
    expect(output.status).toBe('passed')
    expect(output.dryRun).toBe(true)
  })
})

describe('external project compatibility', () => {
  it('rejects an invalid policy with a structured failure', async () => {
    const root = await createProject({ policy: basePolicy({ allowedProductPaths: [] }), agents: internalAgents })

    const result = await runCli(root, 'run', '--dry-run', '--json')

    // A project that cannot be resolved is a configuration error, which
    // `docs/interfaces/cli.md` §8 gives its own exit code rather than folding into a
    // failed run.
    expect(result.code).toBe(5)
    const output = JSON.parse(result.stdout) as { status: string; phases: { name: string }[]; issues: string[] }
    expect(output.status).toBe('failed')
    expect(output.phases[0].name).toBe('config')
    expect(output.issues.join(' ')).toContain('allowedProductPaths')
  })

  it('reports a missing provider as a structured failure', async () => {
    const root = await createProject({
      policy: basePolicy(),
      agents: { ...internalAgents, coder: { mode: 'external', provider: 'ghost' } },
    })

    const result = await runCli(root, 'run', '--input', '.harness/task.json', '--json')

    expect(result.code).toBe(1)
    const output = JSON.parse(result.stdout) as { status: string; issues: string[] }
    expect(output.status).toBe('failed')
    expect(output.issues.join(' ')).toContain("provider 'ghost' is not configured")
  })

  it('reports a missing verification script as a failed gate', async () => {
    const root = await createProject({
      policy: basePolicy({ requiredChecks: ['missing-check'] }),
      agents: internalAgents,
    })

    const result = await runCli(root, 'run', '--input', '.harness/task.json', '--json')

    expect(result.code).toBe(1)
    const output = JSON.parse(result.stdout) as {
      status: string
      verification: { command: string; result: string }[]
    }
    expect(output.status).toBe('failed')
    expect(output.verification[0].result).toBe('fail')
    expect(output.verification[0].command).toContain('missing-check')
  })

  it('runs the full loop against a non-Vue project with an external provider', async () => {
    const root = await createProject({
      policy: basePolicy({ requiredChecks: ['check'] }),
      agents: {
        providers: { fixture: { command: 'node', args: ['scripts/echo-adapter.mjs'] } },
        planner: { mode: 'external', provider: 'fixture' },
        coder: { mode: 'external', provider: 'fixture' },
        tester: { mode: 'external', provider: 'fixture' },
        reviewer: { mode: 'external', provider: 'fixture' },
      },
      scripts: { check: 'node src/index.mjs' },
      sourceFiles: { 'src/index.mjs': "console.log('fixture ok')\n" },
    })
    await mkdir(join(root, 'scripts'), { recursive: true })
    await copyFile(join(repoRoot, 'tests/fixtures/echo-adapter.mjs'), join(root, 'scripts/echo-adapter.mjs'))

    const result = await runCli(root, 'run', '--input', '.harness/task.json', '--json')

    expect(result.code).toBe(0)
    const output = JSON.parse(result.stdout) as {
      status: string
      phases: { name: string; status: string }[]
      scope: { allowed: boolean; refusedFiles: string[] }
      evidence: { trust: string; exitCode: number; durationMs: number; stdoutDigest: string }[]
      verification: { command: string; result: string }[]
    }
    expect(output.status).toBe('passed')
    expect(output.verification[0].command).toContain('npm run check')
    expect(output.verification[0].result).toBe('pass')
    // The verdict has to be re-checkable, not just asserted: the gate evidence
    // carries its own provenance and the facts a later reader would re-run.
    expect(output.evidence[0]).toMatchObject({ trust: 'harness-executed', exitCode: 0 })
    expect(output.evidence[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(output.evidence[0].stdoutDigest).toMatch(/^sha256:/)
    // Scope is reported as its own fact, separately from the reviewer's verdict.
    expect(output.scope).toMatchObject({ allowed: true, refusedFiles: [] })

    const runIds = await readdir(join(root, '.harness/runs'))
    const artifact = JSON.parse(
      await readFile(join(root, '.harness/runs', runIds[0] as string, 'iteration-1-verification.json'), 'utf8'),
    ) as { trust: string; exitCode: number; durationMs: number }[]
    expect(artifact[0]).toMatchObject({ trust: 'harness-executed', exitCode: 0 })
    expect(artifact[0]?.durationMs).toBeGreaterThanOrEqual(0)

    expect(output.phases.map(({ name }) => name)).toEqual(['planner', 'coder', 'tester', 'scope', 'reviewer'])
    expect(output.phases.every(({ status }) => status === 'passed')).toBe(true)
  })
})
