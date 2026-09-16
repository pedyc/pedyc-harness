/** Narrows untrusted JSON to an object without asserting anything about its keys. */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

/**
 * One reason a document is not usable configuration.
 *
 * The field is optional because some problems are about the document as a whole
 * ("policy must be an object"), but naming it whenever it is known is what makes
 * the CLI's configuration errors actionable.
 */
export interface ConfigProblem {
  field?: string
  message: string
}
