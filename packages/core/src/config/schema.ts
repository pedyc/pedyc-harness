import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAjv } from '../contracts/validator.js'
import type { HarnessSchemas, HarnessValidators } from '../contracts/validator.js'

// Compiling a schema is pure, so it lives in `contracts/`; this module adds the
// file system access the config layer owns. Both halves are re-exported here so
// the public `./schema` subpath keeps the shape it had before the split.
export { createAjv, createValidators, validationDetails } from '../contracts/validator.js'
export type {
  HarnessSchemas,
  HarnessValidators,
  ResponseValidator,
  SchemaErrorFormatter,
} from '../contracts/validator.js'

/** Compiles one schema document with the settings every Harness schema expects. */
export const compileSchema = (schema: object): HarnessValidators['input'] =>
  createAjv().compile(schema)

/** Reads one JSON Schema document out of `.harness/`. */
export const readSchema = (root: string, name: string): object =>
  JSON.parse(readFileSync(join(root, '.harness', name), 'utf8')) as object

/**
 * Reads the three contracts every target project commits.
 *
 * The manifest schema is deliberately not part of this set: it only has to be
 * present once a project has a `harness.json`, so loading it here would make a
 * project that predates the manifest fail.
 */
export const loadSchemas = (root: string): HarnessSchemas => ({
  input: readSchema(root, 'input.schema.json'),
  output: readSchema(root, 'output.schema.json'),
  agentResponse: readSchema(root, 'agent-response.schema.json'),
})
