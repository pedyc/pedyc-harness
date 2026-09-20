import { loadSchemas, createValidators, parseAgentResponse, validateStageResponse } from '@pedyc/harness-core'
import { createProviderRunner, findOutOfScopeChanges, validatePolicy } from '@pedyc/harness-core'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')

describe('core schema and agent contracts', () => {
  it('loads project schemas and validates agent responses', () => {
    const validators = createValidators(loadSchemas(root))
    const response = parseAgentResponse(
      'planner',
      JSON.stringify({ implementationPlan: ['Do the work'], details: 'ok' }),
      validators.agentResponse,
      validators.ajv,
    )
    expect(response.ok).toBe(true)
    expect(validateStageResponse('planner', response.payload)).toBeNull()
  })

  it('rejects invalid stage responses with actionable details', () => {
    expect(validateStageResponse('tester', { approved: true })).toContain('evidence')
    expect(validateStageResponse('reviewer', {})).toContain('approved')
    // The structured channel is enough on its own: `approved` is the pre-1.3
    // shape, not the requirement.
    expect(validateStageResponse('reviewer', { findings: [] })).toBeNull()
  })

  it('validates policy and identifies out-of-scope files', () => {
    const policy = {
      maxIterations: 3,
      protectedPaths: ['.harness/'],
      requiredChecks: [],
      allowedProductPaths: ['src/'],
    }
    expect(validatePolicy(policy)).toBeNull()
    expect(findOutOfScopeChanges(['src/App.vue', '.harness/policy.json'], policy))
      .toEqual(['.harness/policy.json'])
  })

  it('keeps internal providers explicit and structured', async () => {
    const runner = createProviderRunner({
      root,
      agents: { planner: { mode: 'internal' } },
      policy: { allowedAgentCommands: [] },
      validator: () => true,
      ajv: { errorsText: () => '' },
    })
    await expect(runner('planner', {
      phase: 'planner',
      input: {
        feature: 'Feature',
        objective: 'Objective',
        constraints: [],
        acceptanceCriteria: ['Done'],
        testHints: [],
        maxIterations: 1,
      },
      implementationPlan: [],
    })).resolves.toEqual({
      ok: true,
      details: 'planner completed using the built-in stage.',
      payload: {},
    })
  })
})
