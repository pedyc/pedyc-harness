// The default export is typed as a namespace under NodeNext; the named export is
// the class, and ajv ships it on both the ESM and CJS sides.
import { Ajv2020 } from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ErrorObject, ValidateFunction } from 'ajv'

/** The raw JSON Schema documents a project commits under `.harness/`. */
export interface HarnessSchemas {
  input: object
  output: object
  agentResponse: object
}

export interface HarnessValidators {
  ajv: Ajv2020
  input: ValidateFunction
  output: ValidateFunction
  agentResponse: ValidateFunction
}

/** A compiled validator, including the `errors` it records on failure. */
export interface ResponseValidator {
  (value: unknown): boolean
  errors?: null | ErrorObject[]
}

/** The only Ajv capability the agent-response parser needs. */
export type SchemaErrorFormatter = Pick<Ajv2020, 'errorsText'>

export const loadSchemas = (root: string): HarnessSchemas => {
  const read = (name: string): object =>
    JSON.parse(readFileSync(join(root, '.harness', name), 'utf8')) as object

  return {
    input: read('input.schema.json'),
    output: read('output.schema.json'),
    agentResponse: read('agent-response.schema.json'),
  }
}

export const createValidators = (schemas: HarnessSchemas): HarnessValidators => {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  return {
    ajv,
    input: ajv.compile(schemas.input),
    output: ajv.compile(schemas.output),
    agentResponse: ajv.compile(schemas.agentResponse),
  }
}

export const validationDetails = (ajv: SchemaErrorFormatter, validator: ResponseValidator): string =>
  ajv.errorsText(validator.errors)
