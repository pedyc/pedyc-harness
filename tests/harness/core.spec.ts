import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  changedFiles,
  detectPackageManager,
  normalizeTask,
  packageScriptCommand,
  snapshotFiles,
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
})
