import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundledSchemaFile, bundledValidator, fieldOf } from './bundled.js'
import { configError } from './errors.js'
import type { HarnessConfigError, HarnessManifest } from '../contracts/index.js'

/** The repository-relative path of a project's manifest. */
export const manifestFile = '.harness/harness.json'

export const manifestPath = (root: string): string => join(root, manifestFile)

/** The bundled schema a project manifest is validated against. */
export const manifestSchema = 'harness.schema.json'

export type ManifestResult =
  | { ok: true; manifest: HarnessManifest }
  | { ok: false; errors: HarnessConfigError[] }

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

  let validate: ReturnType<typeof bundledValidator>
  try {
    validate = bundledValidator(manifestSchema)
  } catch (error) {
    return {
      ok: false,
      errors: [configError(
        'harness_schema_unreadable',
        bundledSchemaFile(manifestSchema),
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
