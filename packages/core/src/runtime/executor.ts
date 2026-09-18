import type {
  AgentCallResult,
  FileChange,
  NormalizedTask,
  OrchestrationResult,
  PhaseRecord,
  PhaseStatus,
  Policy,
  PolicyViolation,
  RunAgent,
  TerminationReason,
  VerificationCheck,
} from '../contracts/index.js'
import { reviewerApproved, testerApproved } from './approval-gate.js'
import type { FileSnapshot } from './diff-inspector.js'
import { describeFileViolations, evaluateChangeBudget, evaluateFiles, refusedFiles } from './policy-engine.js'

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
  const violations: PolicyViolation[] = []

  // Judgments are recorded once each: the loop can revisit the same file across
  // iterations, and a repeated identical refusal is noise in the record.
  const recordViolations = (found: PolicyViolation[] = []): void => {
    for (const violation of found) {
      const seen = violations.some((existing) =>
        existing.kind === violation.kind
        && existing.rule === violation.rule
        && existing.target === violation.target
        && existing.action === violation.action)
      if (!seen) violations.push(violation)
    }
  }
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
    return { completed: true, implementationPlan, fileChanges, verification: [], violations, issues, phases, iterations: 1 }
  }

  const recordPhase = (name: string, status: PhaseStatus, details: string, iteration?: number): PhaseRecord => {
    const phase: PhaseRecord = { name, status, details }
    if (iteration) phase.iteration = iteration
    phases.push(phase)
    return phase
  }

  recordPhase('planner', 'running', 'Validating task input and preparing an implementation plan.')
  const plan = await runAgent('planner', { phase: 'planner', input, implementationPlan })
  recordViolations(plan.violations)
  phases[phases.length - 1] = { name: 'planner', status: plan.ok ? 'passed' : 'failed', details: plan.details }
  if (plan.payload.implementationPlan?.length) {
    implementationPlan.splice(0, implementationPlan.length, ...plan.payload.implementationPlan)
  }
  if (!plan.ok) issues.push(plan.details)

  let lastVerification: VerificationCheck[] = []
  let completed = false
  let termination: TerminationReason | undefined = plan.ok ? undefined : plan.termination ?? 'agent_error'

  // A stage the harness itself stopped — the provider ran past `agentTimeoutMs`,
  // or the run was cancelled — ends the loop instead of being retried. Retrying a
  // stage that ran out of time usually runs out of time again, and a cancellation
  // is a user asking for the run to stop.
  const stoppedByHarness = (result: AgentCallResult): boolean => {
    if (result.termination === undefined) return false
    issues.push(result.details)
    termination = result.termination
    return true
  }

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
    recordViolations(coder.violations)

    const iterationChanges = changedFiles(before, snapshot())
    for (const file of iterationChanges) {
      fileChanges.push({ file, change: `Changed during coder iteration ${iteration}.` })
    }
    if (stoppedByHarness(coder)) break
    if (!coder.ok) {
      issues.push(coder.details)
      termination = 'agent_error'
      break
    }

    const budget = evaluateChangeBudget(iterationChanges.length, policy)
    recordViolations(budget.violations)
    // A reported budget overrun is recorded and the run continues; only a
    // rejection stops it. That is the whole meaning of `onViolation`.
    if (!budget.allowed && budget.violations.some(({ action }) => action === 'reject')) {
      issues.push(budget.violations.map(({ reason: text }) => text).join(' '))
      termination = 'policy_violation'
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
    recordViolations(externalTest.violations)
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

    if (stoppedByHarness(externalTest)) break
    if (!testerOk && iteration === maxIterations) {
      issues.push('Verification did not pass before maxIterations was reached.')
      termination = 'max_iterations'
      break
    }
    if (!testerOk) continue

    recordPhase('reviewer', 'running', 'Checking scope, output contract, and acceptance criteria.', iteration)
    // Scope is the harness's own comparison of what changed against what the
    // policy allows, and it goes through the policy evaluator rather than a
    // second implementation here. A protected-path hit is reported as itself:
    // such a path is normally *inside* the allowed set, so calling it
    // "out of scope" would misdescribe why the change was refused.
    const fileDecision = evaluateFiles(fileChanges.map(({ file }) => file), policy)
    recordViolations(fileDecision.violations)
    const refused = refusedFiles(fileDecision.violations)
    const reviewer = await runAgent('reviewer', {
      phase: 'reviewer',
      input,
      implementationPlan,
      verification,
      fileChanges,
      iteration,
    })
    recordViolations(reviewer.violations)
    const reviewerOk = reviewerApproved(reviewer, refused)
    const reviewerDetails = refused.length
      ? describeFileViolations(fileDecision.violations)
      : reviewer.details
    phases[phases.length - 1] = {
      name: 'reviewer',
      iteration,
      status: reviewerOk ? 'passed' : 'failed',
      details: reviewerDetails,
    }
    if (!reviewerOk) {
      issues.push(reviewerDetails)
      termination = refused.length > 0 ? 'policy_violation' : reviewer.termination ?? 'agent_error'
      break
    }

    completed = true
    termination = 'completed'
    break
  }

  return {
    completed,
    // A run that fell out of the loop without recording a reason is, by
    // definition, one that used up its iteration budget.
    termination: termination ?? 'max_iterations',
    implementationPlan,
    fileChanges,
    verification: lastVerification,
    violations,
    issues,
    phases,
    iterations: phases.filter((phase) => phase.name === 'coder').length,
  }
}
