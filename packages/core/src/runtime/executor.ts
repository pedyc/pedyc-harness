import type {
  FileChange,
  NormalizedTask,
  OrchestrationResult,
  PhaseRecord,
  PhaseStatus,
  Policy,
  RunAgent,
  VerificationCheck,
} from '../contracts/index.js'
import { reviewerApproved, testerApproved } from './approval-gate.js'
import type { FileSnapshot } from './diff-inspector.js'
import { findOutOfScopeChanges } from './policy-engine.js'

export interface OrchestratorOptions {
  input: NormalizedTask
  policy: Policy
  dryRun: boolean
  snapshot: () => FileSnapshot
  changedFiles: (before: FileSnapshot, after: FileSnapshot) => string[]
  runAgent: RunAgent
  runVerification: () => Promise<VerificationCheck[]>
  writeVerification?: (iteration: number, verification: VerificationCheck[]) => void
}

/**
 * Runs the fixed Planner → Coder → Tester → Reviewer pipeline.
 *
 * The loop retries the coder only while the tester has not approved and the
 * iteration budget allows it; a planner, coder or reviewer failure stops the
 * run outright.
 */
export const runOrchestrator = async ({
  input,
  policy,
  dryRun,
  snapshot,
  changedFiles,
  runAgent,
  runVerification,
  writeVerification = (): void => {},
}: OrchestratorOptions): Promise<OrchestrationResult> => {
  const maxIterations = Math.min(
    Math.max(Number(input.maxIterations ?? policy.maxIterations ?? 3), 1),
    policy.maxIterations ?? 3,
  )
  const phases: PhaseRecord[] = []
  const issues: string[] = []
  const fileChanges: FileChange[] = []
  const implementationPlan: string[] = [
    `Analyze the requested feature: ${input.feature.trim()}.`,
    `Implement the objective while satisfying ${input.acceptanceCriteria.length} acceptance criteria.`,
    'Run configured verification gates and review the result before reporting completion.',
  ]

  if (dryRun) {
    // A dry run is a safe preview: no Agent Provider is invoked, no verification
    // gate is executed, and no product file can change. Report the same four
    // phases so callers can consume the result with the regular output contract.
    for (const [name, details] of [
      ['planner', 'Dry run: planner execution skipped; no agent provider was invoked.'],
      ['coder', 'Dry run: coder execution skipped; no product files were changed.'],
      ['tester', 'Dry run: tester execution skipped; no verification gates were executed.'],
      ['reviewer', 'Dry run: reviewer execution skipped; no product files were changed.'],
    ] as const) {
      phases.push({ name, iteration: 1, status: 'passed', details })
    }
    return { completed: true, implementationPlan, fileChanges, verification: [], issues, phases, iterations: 1 }
  }

  const recordPhase = (name: string, status: PhaseStatus, details: string, iteration?: number): PhaseRecord => {
    const phase: PhaseRecord = { name, status, details }
    if (iteration) phase.iteration = iteration
    phases.push(phase)
    return phase
  }

  recordPhase('planner', 'running', 'Validating task input and preparing an implementation plan.')
  const plan = await runAgent('planner', { phase: 'planner', input, implementationPlan })
  phases[phases.length - 1] = { name: 'planner', status: plan.ok ? 'passed' : 'failed', details: plan.details }
  if (plan.payload.implementationPlan?.length) {
    implementationPlan.splice(0, implementationPlan.length, ...plan.payload.implementationPlan)
  }
  if (!plan.ok) issues.push(plan.details)

  let lastVerification: VerificationCheck[] = []
  let completed = false
  for (let iteration = 1; iteration <= maxIterations && issues.length === 0; iteration += 1) {
    const before = snapshot()
    recordPhase('coder', 'running', 'Applying the approved implementation plan.', iteration)
    const coder = await runAgent('coder', {
      phase: 'coder',
      input,
      implementationPlan,
      iteration,
      previousVerification: lastVerification,
    })
    phases[phases.length - 1] = {
      name: 'coder',
      iteration,
      status: coder.ok ? 'passed' : 'failed',
      details: coder.details,
    }

    for (const file of changedFiles(before, snapshot())) {
      fileChanges.push({ file, change: `Changed during coder iteration ${iteration}.` })
    }
    if (!coder.ok) {
      issues.push(coder.details)
      break
    }

    recordPhase('tester', 'running', 'Running required verification gates.', iteration)
    const verification = await runVerification()
    const externalTest = await runAgent('tester', {
      phase: 'tester',
      input,
      implementationPlan,
      verification,
      iteration,
    })
    if (!externalTest.ok) {
      verification.push({ command: 'external tester', result: 'fail', details: externalTest.details })
    }
    lastVerification = verification

    const testerOk = testerApproved(verification, externalTest)
    phases[phases.length - 1] = {
      name: 'tester',
      iteration,
      status: testerOk ? 'passed' : 'failed',
      details: testerOk
        ? 'All required gates passed and tester approved the evidence.'
        : externalTest.ok
          ? 'At least one required gate failed or tester rejected the evidence.'
          : externalTest.details,
    }
    writeVerification(iteration, verification)

    if (!testerOk && iteration === maxIterations) {
      issues.push('Verification did not pass before maxIterations was reached.')
      break
    }
    if (!testerOk) continue

    recordPhase('reviewer', 'running', 'Checking scope, output contract, and acceptance criteria.', iteration)
    const outOfScopeChanges = findOutOfScopeChanges(fileChanges.map(({ file }) => file), policy)
    const reviewer = await runAgent('reviewer', {
      phase: 'reviewer',
      input,
      implementationPlan,
      verification,
      fileChanges,
      iteration,
    })
    const reviewerOk = reviewerApproved(reviewer, outOfScopeChanges)
    const reviewerDetails = outOfScopeChanges.length
      ? `Out-of-scope files changed: ${outOfScopeChanges.join(', ')}`
      : reviewer.details
    phases[phases.length - 1] = {
      name: 'reviewer',
      iteration,
      status: reviewerOk ? 'passed' : 'failed',
      details: reviewerDetails,
    }
    if (!reviewerOk) {
      issues.push(reviewerDetails)
      break
    }

    completed = true
    break
  }

  return {
    completed,
    implementationPlan,
    fileChanges,
    verification: lastVerification,
    issues,
    phases,
    iterations: phases.filter((phase) => phase.name === 'coder').length,
  }
}
