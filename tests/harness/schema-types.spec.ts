import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createValidators, loadSchemas } from '@pedyc/harness-core'
import type { NormalizedTask, RunResult, VerificationCheck } from '@pedyc/harness-core'

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
    const sample: RunResult = {
      status: 'passed',
      summary: 'Completed the requested feature.',
      implementationPlan: ['Inspect the current behaviour.', 'Apply the change.'],
      fileChanges: [{ file: 'packages/core/src/index.ts', change: 'Exported the new helper.' }],
      verification,
      issues: [],
      phases: [{ name: 'coder', status: 'passed', details: 'Applied the plan.', iteration: 1 }],
      iterations: 1,
      dryRun: false,
    }

    expect(validators.output(sample), JSON.stringify(validators.output.errors)).toBe(true)
  })
})
