import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const loadSchemas = (root) => {
  const read = (name) => JSON.parse(readFileSync(join(root, '.harness', name), 'utf8'))
  return {
    input: read('input.schema.json'),
    output: read('output.schema.json'),
    agentResponse: read('agent-response.schema.json'),
  }
}

export const createValidators = (schemas) => {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  return {
    ajv,
    input: ajv.compile(schemas.input),
    output: ajv.compile(schemas.output),
    agentResponse: ajv.compile(schemas.agentResponse),
  }
}

export const validationDetails = (ajv, validator) => ajv.errorsText(validator.errors)
