import { readFileSync } from 'node:fs'
import type { IntakeResult, NormalizedTask, RawTaskInput } from '../contracts/index.js'

const defaultChecks = ['pnpm run harness:verify', 'pnpm run type-check', 'pnpm run test:unit', 'pnpm run build']

/**
 * Folds any of the three input layers into the normalized task contract.
 *
 * Missing key information is reported as questions instead of an error, so the
 * caller can ask a human rather than fail the run.
 */
export const normalizeTask = (task: RawTaskInput): IntakeResult => {
  const normalized: NormalizedTask = {
    feature: task.task?.trim() || task.feature?.trim() || '',
    objective: task.goal?.trim() || task.objective?.trim() || '',
    constraints: task.specialConstraints ?? task.constraints ?? [],
    acceptanceCriteria: task.acceptance ?? task.acceptanceCriteria ?? [],
    testHints: task.testHints ?? defaultChecks,
    maxIterations: task.maxIterations ?? 3,
  }

  const questions: string[] = []
  if (!normalized.feature) questions.push('要实现的任务或功能是什么？')
  if (!normalized.objective) questions.push('任务的目标是什么？')
  if (!normalized.acceptanceCriteria.length) questions.push('完成任务的验收标准是什么？')

  return {
    status: questions.length > 0 ? 'needs_input' : 'ready',
    questions,
    normalizedTask: normalized,
  }
}

/** Reads a human task file and normalizes it. */
export const readTaskFile = (path: string): IntakeResult =>
  normalizeTask(JSON.parse(readFileSync(path, 'utf8')) as RawTaskInput)
