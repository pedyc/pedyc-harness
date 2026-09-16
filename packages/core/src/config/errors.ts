import type { ConfigErrorCode, HarnessConfigError } from '../contracts/index.js'

/** Builds one structured configuration error. */
export const configError = (
  code: ConfigErrorCode,
  file: string,
  message: string,
  field?: string,
): HarnessConfigError => (field === undefined ? { code, file, message } : { code, file, field, message })

/**
 * Renders an error the way the CLI prints it.
 *
 * The file and the field are both part of the sentence on purpose: "the
 * configuration is invalid" is not actionable, ".harness/harness.json → presets"
 * is.
 */
export const formatConfigError = (error: HarnessConfigError): string =>
  `${error.file}${error.field ? ` → ${error.field}` : ''}: ${error.message}`
