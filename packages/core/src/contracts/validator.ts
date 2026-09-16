// The default export is typed as a namespace under NodeNext; the named export is
// the class, and ajv ships it on both the ESM and CJS sides.
import { Ajv2020 } from 'ajv/dist/2020.js'
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

/** Creates an Ajv instance configured the way every Harness schema expects. */
export const createAjv = (): Ajv2020 => new Ajv2020({ allErrors: true, strict: false })

/**
 * Compiles schema documents into validators.
 *
 * This half of the schema boundary is pure: it touches no file system, which is
 * what lets `contracts/` stay free of I/O. Reading the documents off disk is the
 * config layer's job.
 */
export const createValidators = (schemas: HarnessSchemas): HarnessValidators => {
  const ajv = createAjv()
  return {
    ajv,
    input: ajv.compile(schemas.input),
    output: ajv.compile(schemas.output),
    agentResponse: ajv.compile(schemas.agentResponse),
  }
}

export const validationDetails = (ajv: SchemaErrorFormatter, validator: ResponseValidator): string =>
  ajv.errorsText(validator.errors)
