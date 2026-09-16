import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compileSchema } from './schema.js'
import type { ErrorObject } from 'ajv'

// Bundled schemas are the contracts a project and a preset are checked against,
// so the runtime reads its own copies rather than ones a project supplies: a
// project must not be able to loosen the rules its own configuration is validated
// against. The copies under `packages/core/schemas/` are derived from the
// repository's `schemas/` by `pnpm run schemas:sync`. Both this module's source and
// its compiled form sit two directories below the package root, so `../../schemas`
// resolves to `packages/core/schemas` either way.
const bundledPath = (name: string): string =>
  fileURLToPath(new URL(`../../schemas/${name}`, import.meta.url))

/** How a bundled schema is named in an error, since it is not part of the project. */
export const bundledSchemaFile = (name: string): string => `packages/core/schemas/${name}`

const validators = new Map<string, ReturnType<typeof compileSchema>>()

/**
 * Compiles, and caches, one schema bundled with this package.
 *
 * Throws when the schema cannot be read: a missing bundled schema means the
 * installation is incomplete, which the caller reports rather than masking.
 */
export const bundledValidator = (name: string): ReturnType<typeof compileSchema> => {
  const cached = validators.get(name)
  if (cached) return cached
  const compiled = compileSchema(JSON.parse(readFileSync(bundledPath(name), 'utf8')) as object)
  validators.set(name, compiled)
  return compiled
}

/** Turns one Ajv failure into the dot path of the field it is about. */
export const fieldOf = (error: ErrorObject): string | undefined => {
  const params = error.params as { missingProperty?: string; additionalProperty?: string }
  const path = error.instancePath.replace(/^\//, '').replaceAll('/', '.')
  const leaf = params.missingProperty ?? params.additionalProperty
  if (leaf) return path ? `${path}.${leaf}` : leaf
  return path || undefined
}
