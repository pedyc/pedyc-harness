import { loadSchemas, createValidators, parseAgentResponse, validateStageResponse } from '@pedyc/harness-core'
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
  })
})
