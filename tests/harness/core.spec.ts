import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  changedFiles,
  detectPackageManager,
  normalizeTask,
  packageScriptCommand,
  snapshotFiles,
  runOrchestrator,
} from '@pedyc/harness-core'

describe('harness core', () => {
  it('normalizes a task without Vue dependencies', () => {
    const result = normalizeTask({
      task: 'Add a feature',
      goal: 'Deliver the feature',
      acceptance: ['It works'],
    })
    expect(result.status).toBe('ready')
    expect(result.normalizedTask.feature).toBe('Add a feature')
  })

  it('creates package commands and detects workspace files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-core-'))
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    expect(detectPackageManager(root).name).toBe('pnpm')
    expect(packageScriptCommand(root, 'build').display).toBe('pnpm run build')
  })

  it('reports changed files from snapshots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-core-'))
    await writeFile(join(root, 'before.txt'), 'before')
    const before = snapshotFiles(root)
    await writeFile(join(root, 'before.txt'), 'after')
    await writeFile(join(root, 'new.txt'), 'new')
    expect(changedFiles(before, snapshotFiles(root)).sort()).toEqual(['before.txt', 'new.txt'])
  })

  it('ignores dependency and build directories below the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pedyc-core-'))
    await mkdir(join(root, 'backend/node_modules'), { recursive: true })
    await mkdir(join(root, 'backend/dist'), { recursive: true })
    await mkdir(join(root, 'backend/src'), { recursive: true })
    await writeFile(join(root, 'backend/node_modules/dependency.js'), 'dependency')
    await writeFile(join(root, 'backend/dist/bundle.js'), 'bundle')
    await writeFile(join(root, 'backend/src/real.ts'), 'real')
    expect([...snapshotFiles(root).keys()]).toEqual(['backend/src/real.ts'])
  })

  it('runs the planner, coder, tester and reviewer loop in dry-run mode', async () => {
    const result = await runOrchestrator({
      input: {
        feature: 'Feature',
        objective: 'Objective',
        constraints: [],
        acceptanceCriteria: ['Done'],
        testHints: [],
        maxIterations: 1,
      },
      policy: { maxIterations: 1, allowedProductPaths: ['src/'] },
      dryRun: true,
      snapshot: () => new Map(),
      changedFiles: () => [],
      runAgent: async (name: string) => name === 'tester'
        ? { ok: true, details: 'approved', payload: { approved: true, evidence: [{ command: 'check', result: 'pass', details: 'ok' }] } }
        : { ok: true, details: 'ok', payload: {} },
      runVerification: async () => [{ command: 'check', result: 'pass', details: 'ok' }],
    })
    expect(result.completed).toBe(true)
    expect(result.phases.map(({ name }) => name)).toEqual(['planner', 'coder', 'tester', 'reviewer'])
  })

  it('never invokes a provider or gate during a dry run', async () => {
    let agentCalls = 0
    let gateCalls = 0
    const result = await runOrchestrator({
      input: {
        feature: 'Feature',
        objective: 'Objective',
        constraints: [],
        acceptanceCriteria: ['Done'],
        testHints: [],
        maxIterations: 1,
      },
      policy: { maxIterations: 1, allowedProductPaths: ['src/'] },
      dryRun: true,
      snapshot: () => new Map(),
      changedFiles: () => [],
      runAgent: async () => {
        agentCalls += 1
        throw new Error('dry run must not call an agent provider')
      },
      runVerification: async () => {
        gateCalls += 1
        throw new Error('dry run must not execute verification gates')
      },
    })

    expect(result.completed).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.verification).toEqual([])
    expect(agentCalls).toBe(0)
    expect(gateCalls).toBe(0)
  })
})
