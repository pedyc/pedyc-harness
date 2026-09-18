import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderRunner, runCommand } from '@pedyc/harness-core'

const task = {
  feature: 'Feature',
  objective: 'Objective',
  constraints: [],
  acceptanceCriteria: ['Done'],
  testHints: [],
  maxIterations: 1,
}

const coderRequest = { phase: 'coder' as const, input: task, implementationPlan: [], iteration: 1, previousVerification: [] }

/**
 * A project whose provider is a script file rather than `node -e '...'`.
 *
 * Not incidental: `runCommand` spawns through `shell: true` on Windows and does
 * not quote arguments, so an inline script containing spaces is split by the
 * shell and the process exits before it can hang. Passing one token (`hang.mjs`)
 * keeps this test about the timeout rather than about argument quoting.
 */
const projectWith = async (script: string, name = 'provider.mjs') => {
  const root = await mkdtemp(join(tmpdir(), 'pedyc-bounds-'))
  await writeFile(join(root, name), script)
  return root
}

// Five seconds, not a minute: when a kill cannot reach a grandchild the stray
// process is bounded, so a failing test cannot leak one for long.
const hang = 'setTimeout(() => {}, 5000)\n'

describe('command bounds', () => {
  it('reports a command that exits on its own as exited', async () => {
    const root = await projectWith('console.log(1)\n')
    const result = await runCommand(root, 'node', ['provider.mjs'])
    expect(result.termination).toBe('exited')
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe('1')
  })

  it('stops a command that runs past its timeout, and says so', async () => {
    const root = await projectWith(hang)
    const result = await runCommand(root, 'node', ['provider.mjs'], null, { timeoutMs: 150 })
    expect(result.termination).toBe('timeout')
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('agentTimeoutMs')
  })

  it('stops a command when the run is cancelled', async () => {
    const root = await projectWith(hang)
    const controller = new AbortController()
    const pending = runCommand(root, 'node', ['provider.mjs'], null, { signal: controller.signal })
    setTimeout(() => controller.abort(), 100)
    const result = await pending
    expect(result.termination).toBe('cancelled')
    expect(result.code).not.toBe(0)
  })

  it('does not run a command whose signal is already aborted', async () => {
    const root = await projectWith('console.log("ran")\n')
    const controller = new AbortController()
    controller.abort()
    const result = await runCommand(root, 'node', ['provider.mjs'], null, { signal: controller.signal })
    expect(result.termination).toBe('cancelled')
    expect(result.stdout).toBe('')
  })
})

describe('provider stage bounds', () => {
  const slowRunner = async (options: { agentTimeoutMs?: number; signal?: AbortSignal }) => {
    const root = await projectWith(hang)
    return createProviderRunner({
      root,
      agents: {
        providers: { slow: { command: 'node', args: ['provider.mjs'] } },
        coder: { mode: 'external', provider: 'slow' },
      },
      policy: {},
      validator: () => true,
      ajv: { errorsText: () => '' },
      ...options,
    })
  }

  it('ends the stage as timeout when agentTimeoutMs elapses', async () => {
    const runner = await slowRunner({ agentTimeoutMs: 150 })
    const result = await runner('coder', coderRequest)
    expect(result.ok).toBe(false)
    expect(result.termination).toBe('timeout')
  })

  it('ends the stage as cancelled when the run is cancelled', async () => {
    const controller = new AbortController()
    const runner = await slowRunner({ signal: controller.signal })
    const pending = runner('coder', coderRequest)
    setTimeout(() => controller.abort(), 100)
    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.termination).toBe('cancelled')
  })

  it('leaves termination unset when the provider exits by itself', async () => {
    const root = await projectWith('process.stdin.resume();process.stdin.on("end",() => console.log("{}"))\n')
    const runner = createProviderRunner({
      root,
      agents: {
        providers: { echo: { command: 'node', args: ['provider.mjs'] } },
        coder: { mode: 'external', provider: 'echo' },
      },
      policy: {},
      validator: () => true,
      ajv: { errorsText: () => '' },
    })
    const result = await runner('coder', coderRequest)
    expect(result.termination).toBeUndefined()
  })
})
