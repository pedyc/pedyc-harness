import { readFileSync } from 'node:fs'

const defaultChecks = ['pnpm run harness:verify', 'pnpm run type-check', 'pnpm run test:unit', 'pnpm run build']

export const normalizeTask = (task) => {
  const normalized = {
    feature: task.task?.trim() || task.feature?.trim() || '',
    objective: task.goal?.trim() || task.objective?.trim() || '',
    constraints: task.specialConstraints ?? task.constraints ?? [],
    acceptanceCriteria: task.acceptance ?? task.acceptanceCriteria ?? [],
    testHints: task.testHints ?? defaultChecks,
    maxIterations: task.maxIterations ?? 3,
  }
  const questions = []
  if (!normalized.feature) questions.push('要实现的任务或功能是什么？')
  if (!normalized.objective) questions.push('任务的目标是什么？')
  if (!normalized.acceptanceCriteria.length) questions.push('完成任务的验收标准是什么？')
  return questions.length > 0
    ? { status: 'needs_input', questions, normalizedTask: normalized }
    : { status: 'ready', normalizedTask: normalized, questions: [] }
}

export const readTaskFile = (path) => normalizeTask(JSON.parse(readFileSync(path, 'utf8')))
