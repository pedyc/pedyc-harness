import { describe, expect, it } from 'vitest'
import {
  claimedEvidence,
  digest,
  evidenceFromCommand,
  judgingEvidence,
  normalizeEvidence,
  reviewerApproved,
  runOrchestrator,
  skippedEvidence,
  testerApproved,
  toVerificationCheck,
} from '@pedyc/harness-core'
import type { AgentCallResult, Evidence, Policy, VerificationCheck } from '@pedyc/harness-core'

const commandResult = (overrides: Partial<{ code: number; stdout: string; stderr: string }> = {}) => ({
  code: 0,
  stdout: '',
  stderr: '',
  termination: 'exited' as const,
  ...overrides,
})

const approved = (payload: AgentCallResult['payload'] = { approved: true }): AgentCallResult => ({
  ok: true,
  details: 'approved',
  payload,
})

const policy: Policy = { maxIterations: 1, allowedProductPaths: ['src/'] }

const task = {
  feature: 'Feature',
  objective: 'Objective',
  constraints: [],
  acceptanceCriteria: ['Done'],
  testHints: [],
  maxIterations: 1,
}

describe('verification evidence', () => {
  it('records the command, exit code, duration, digests and trust', () => {
    const evidence = evidenceFromCommand({
      id: 'requiredChecks:1:build',
      source: 'requiredChecks',
      name: 'build',
      command: 'pnpm run build',
      packageManager: 'pnpm',
      result: commandResult({ code: 0, stdout: 'built' }),
      durationMs: 42,
      startedAt: '2026-09-17T00:00:00.000Z',
    })

    expect(evidence).toMatchObject({
      id: 'requiredChecks:1:build',
      source: 'requiredChecks',
      trust: 'harness-executed',
      command: 'pnpm run build',
      packageManager: 'pnpm',
      exitCode: 0,
      durationMs: 42,
      details: 'Command completed successfully.',
    })
    expect(evidence.stdoutDigest).toBe(digest('built'))
    expect(evidence.stderrDigest).toBe(digest(''))
  })

  it('digests the whole output while storing a truncated copy', () => {
    const long = 'x'.repeat(3000)
    const evidence = evidenceFromCommand({
      id: 'requiredChecks:1:check',
      source: 'requiredChecks',
      command: 'pnpm run check',
      result: commandResult({ stdout: long }),
      durationMs: 1,
    })

    expect(evidence.stdoutDigest).toBe(digest(long))
    expect(evidence.stdout).toContain('…[truncated]')
    expect(evidence.stdout?.length).toBeLessThan(long.length)
  })

  it('derives the legacy check, including for a check that never ran', () => {
    const passed = toVerificationCheck(evidenceFromCommand({
      id: 'requiredChecks:1:check',
      source: 'requiredChecks',
      command: 'pnpm run check',
      result: commandResult(),
      durationMs: 1,
    }))
    expect(passed).toMatchObject({ command: 'pnpm run check', result: 'pass' })

    const refused = toVerificationCheck(skippedEvidence({
      id: 'requiredChecks:1:publish',
      source: 'requiredChecks',
      command: 'npm publish',
      reason: "Command matches forbiddenCommands entry 'npm publish': npm publish",
    }))
    // Nothing ran, so the projection says so with a message rather than
    // inventing an exit code for a process that never existed.
    expect(refused.result).toBe('fail')
    expect(refused.details).toContain('forbiddenCommands')
  })

  it('upgrades a legacy check without inventing facts it never recorded', () => {
    const legacy: VerificationCheck[] = [{ command: 'pnpm run build', result: 'fail', details: 'boom' }]

    const [upgraded] = normalizeEvidence(legacy) as Evidence[]

    expect(upgraded).toMatchObject({
      source: 'legacy-check',
      trust: 'harness-executed',
      command: 'pnpm run build',
      exitCode: 1,
    })
    expect(upgraded?.durationMs).toBeUndefined()
    expect(upgraded?.stdoutDigest).toBeUndefined()
  })

  it('never lets an agent claim rescue a failed gate', () => {
    const evidence: Evidence[] = [
      evidenceFromCommand({
        id: 'requiredChecks:1:test',
        source: 'requiredChecks',
        command: 'pnpm run test',
        result: commandResult({ code: 1, stderr: 'failed' }),
        durationMs: 3,
      }),
      ...claimedEvidence('tester-claim', [{ command: 'pnpm run test', result: 'pass', details: 'all green' }]),
    ]

    expect(judgingEvidence(evidence)).toHaveLength(1)
    expect(testerApproved(evidence, approved())).toBe(false)
  })

  it('refuses reviewer approval when no evidence was produced at all', () => {
    expect(reviewerApproved(approved(), [], [])).toBe(false)
    // A tester echoing its own claim is not evidence either.
    const claims = claimedEvidence('tester-claim', [{ command: 'check', result: 'pass', details: 'ok' }])
    expect(reviewerApproved(approved(), [], claims)).toBe(false)
  })

  it('records evidence for the iteration and fails a run that observed nothing', async () => {
    const recorded: Evidence[][] = []
    const result = await runOrchestrator({
      input: task,
      policy,
      dryRun: false,
      snapshot: () => new Map(),
      changedFiles: () => [],
      runAgent: async () => approved(),
      runVerification: async () => [],
      writeVerification: (_iteration, evidence) => recorded.push(evidence),
    })

    expect(result.completed).toBe(false)
    expect(result.termination).toBe('agent_error')
    expect(result.issues.join(' ')).toContain('no verification evidence')
    expect(result.evidence).toEqual([])
    expect(recorded).toEqual([[]])
  })

  it('writes structured evidence into the run record', async () => {
    const recorded: Evidence[][] = []
    const result = await runOrchestrator({
      input: task,
      policy,
      dryRun: false,
      snapshot: () => new Map(),
      changedFiles: () => [],
      runAgent: async () => approved(),
      runVerification: async () => [
        evidenceFromCommand({
          id: 'requiredChecks:1:build',
          source: 'requiredChecks',
          command: 'pnpm run build',
          result: commandResult({ stdout: 'ok' }),
          durationMs: 7,
        }),
      ],
      writeVerification: (_iteration, evidence) => recorded.push(evidence),
    })

    expect(result.completed).toBe(true)
    expect(recorded[0]?.[0]).toMatchObject({ trust: 'harness-executed', exitCode: 0, durationMs: 7 })
    expect(result.verification).toEqual([
      { command: 'pnpm run build', result: 'pass', details: 'Command completed successfully.' },
    ])
  })
})
