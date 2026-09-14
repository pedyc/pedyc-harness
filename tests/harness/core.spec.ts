import { mkdtemp, writeFile } from 'node:fs/promises'
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

  it('runs the planner, coder, tester and reviewer loop in dry-run mode', async () => {
    const result = await runOrchestrator({
      input: { feature: 'Feature', objective: 'Objective', acceptanceCriteria: ['Done'], maxIterations: 1 },
      policy: { maxIterations: 1, allowedProductPaths: ['src/'] },
      dryRun: true,
      snapshot: () => new Map(),
      changedFiles: () => [],
      runAgent: async (name) => name === 'tester'
        ? { ok: true, details: 'approved', payload: { approved: true, evidence: [{ command: 'check', result: 'pass', details: 'ok' }] } }
        : { ok: true, details: 'ok', payload: {} },
      runVerification: async () => [{ command: 'check', result: 'pass', details: 'ok' }],
    })
    expect(result.completed).toBe(true)
    expect(result.phases.map(({ name }) => name)).toEqual(['planner', 'coder', 'tester', 'reviewer'])
  })
})
