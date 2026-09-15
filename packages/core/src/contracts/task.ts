/** The normalized task every stage receives; matches `input.schema.json`. */
export interface NormalizedTask {
  feature: string
  objective: string
  constraints: string[]
  acceptanceCriteria: string[]
  testHints: string[]
  maxIterations: number
}

/**
 * The three input layers accept different field names for the same concept.
 * Only `normalizeTask` sees this raw shape.
 */
export interface RawTaskInput {
  task?: string
  feature?: string
  goal?: string
  objective?: string
  specialConstraints?: string[]
  constraints?: string[]
  acceptance?: string[]
  acceptanceCriteria?: string[]
  testHints?: string[]
  maxIterations?: number
}

/**
 * The result of intake. `needs_input` lists the questions a human still has to
 * answer; `ready` carries a task that can go straight to the planner.
 */
export interface IntakeResult {
  status: 'ready' | 'needs_input'
  questions: string[]
  normalizedTask: NormalizedTask
}
