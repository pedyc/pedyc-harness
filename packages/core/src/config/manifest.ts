import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileSchema } from './schema.js'
import { configError } from './errors.js'
import type { ErrorObject } from 'ajv'
import type { HarnessConfigError, HarnessManifest } from '../contracts/index.js'

/** The repository-relative path of a project's manifest. */
export const manifestFile = '.harness/harness.json'

export const manifestPath = (root: string): string => join(root, manifestFile)

// The manifest is a contract between a project and the runtime, so the runtime
// checks it against its own copy of the schema rather than one the project
// supplies: a project must not be able to loosen the rules its own manifest is
// validated against. The copy under `packages/core/schemas/` is derived from the
// repository's `schemas/` by `pnpm run schemas:sync`, and `manifest.js` compiles
// to `dist/config/`, so `../../schemas` is the package root either way.
const bundledSchemaPath = fileURLToPath(new URL('../../schemas/harness.schema.json', import.meta.url))

export type ManifestResult =
  | { ok: true; manifest: HarnessManifest }
  | { ok: false; errors: HarnessConfigError[] }

/** Turns one Ajv failure into the dot path of the field it is about. */
const fieldOf = (error: ErrorObject): string | undefined => {
  const params = error.params as { missingProperty?: string; additionalProperty?: string }
  const path = error.instancePath.replace(/^\//, '').replaceAll('/', '.')
  const leaf = params.missingProperty ?? params.additionalProperty
  if (leaf) return path ? `${path}.${leaf}` : leaf
  return path || undefined
}

let cachedValidator: ReturnType<typeof compileSchema> | null = null

const manifestValidator = (): ReturnType<typeof compileSchema> => {
  cachedValidator ??= compileSchema(JSON.parse(readFileSync(bundledSchemaPath, 'utf8')) as object)
  return cachedValidator
}

/**
 * Reads and validates `.harness/harness.json`.
 *
 * Every failure is structured: a caller gets the document, the field and a
 * stable code, which is what lets the CLI fail before execution with a message
 * a human can act on.
 */
export const readManifest = (root: string): ManifestResult => {
  let raw: string
  try {
    raw = readFileSync(manifestPath(root), 'utf8')
  } catch (error) {
    return {
      ok: false,
      errors: [configError('manifest_unreadable', manifestFile, `The manifest could not be read: ${error instanceof Error ? error.message : 'unknown error'}`)],
    }
  }

  let document: unknown
  try {
    document = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      errors: [configError('manifest_invalid_json', manifestFile, `The manifest is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`)],
    }
  }

  let validate: ReturnType<typeof compileSchema>
  try {
    validate = manifestValidator()
  } catch (error) {
    return {
      ok: false,
      errors: [configError(
        'harness_schema_unreadable',
        'packages/core/schemas/harness.schema.json',
        `The bundled manifest schema could not be loaded, so the installation is incomplete: ${error instanceof Error ? error.message : 'unknown error'}`,
      )],
    }
  }

  if (!validate(document)) {
    return {
      ok: false,
      errors: (validate.errors ?? []).map((error) =>
        configError('manifest_invalid', manifestFile, error.message ?? 'is invalid', fieldOf(error))),
    }
  }

  return { ok: true, manifest: document as HarnessManifest }
}
