import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createValidators, loadSchemas } from '@pedyc/harness-core'
import type { Evidence, Finding, NormalizedTask, RunResult, VerificationCheck } from '@pedyc/harness-core'

const root = resolve(import.meta.dirname, '../..')
const validators = createValidators(loadSchemas(root))

// The samples below are annotated with the contract types on purpose. If a type
// and its JSON Schema drift apart, the schema rejects the sample and this fails,
// which is the only thing keeping the two definitions honest without codegen.
describe('contract types match their JSON Schemas', () => {
  it('accepts a NormalizedTask that satisfies input.schema.json', () => {
    const sample: NormalizedTask = {
      feature: 'Add a retry budget',
      objective: 'Stop retrying after a bounded number of attempts',
      constraints: ['No new dependencies'],
      acceptanceCriteria: ['The budget is configurable'],
      testHints: ['pnpm run test:unit'],
      maxIterations: 3,
    }

    expect(validators.input(sample), JSON.stringify(validators.input.errors)).toBe(true)
  })

  it('accepts a RunResult that satisfies output.schema.json', () => {
    const verification: VerificationCheck[] = [
      { command: 'pnpm run type-check', result: 'pass', details: 'No type errors.' },
    ]
    // The structured evidence the projection above is derived from; both shapes
    // are part of the output contract, so both are checked against the schema.
    const evidence: Evidence[] = [
      {
        id: 'requiredChecks:1:type-check',
        source: 'requiredChecks',
        trust: 'harness-executed',
        name: 'type-check',
        command: 'pnpm run type-check',
        packageManager: 'pnpm',
        exitCode: 0,
        durationMs: 1234,
        startedAt: '2026-09-17T00:00:00.000Z',
        stdoutDigest: 'sha256:0f343b0931126a20f133d67c2b018a3b',
        stderrDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb924',
        details: 'Command completed successfully.',
      },
    ]
    const sample: RunResult = {
      status: 'passed',
      summary: 'Completed the requested feature.',
      implementationPlan: ['Inspect the current behaviour.', 'Apply the change.'],
      fileChanges: [{ file: 'packages/core/src/index.ts', change: 'Exported the new helper.' }],
      // Scope is an optional field: a dry run judges nothing and omits it, so
      // the sample uses the judgment a real run produces.
      scope: {
        allowed: true,
        refusedFiles: [],
        details: 'Scope judgment passed: 1 changed file(s) stayed inside the policy.',
      },
      evidence,
      verification,
      // A sample finding, not an empty list: the structured judgment shape is
      // part of the output contract too.
      findings: [
        {
          rule: 'change.claimed-file-missing',
          target: 'packages/core/src/absent.ts',
          severity: 'warning',
          reason: 'An agent claimed to change packages/core/src/absent.ts, but the diff does not contain it.',
          retryable: true,
          confidence: 0.4,
          evidence: ['packages/core/src/index.ts'],
        } satisfies Finding,
      ],
      // A sample violation, not an empty list: the policy judgment shape is part
      // of the output contract, so it has to be checked against the schema too.
      violations: [
        {
          kind: 'file',
          rule: 'protectedPaths',
          target: 'src/generated/client.ts',
          severity: 'error',
          action: 'reject',
          reason: "Changed file is inside protected path 'src/generated/': src/generated/client.ts",
          retryable: false,
        },
      ],
      issues: [],
      phases: [{ name: 'coder', status: 'passed', details: 'Applied the plan.', iteration: 1 }],
      iterations: 1,
      dryRun: false,
    }

    expect(validators.output(sample), JSON.stringify(validators.output.errors)).toBe(true)
  })
})
