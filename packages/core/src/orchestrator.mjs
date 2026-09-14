import { findOutOfScopeChanges } from './policy.mjs'

export const runOrchestrator = async ({
  input,
  policy,
  dryRun,
  snapshot,
  changedFiles,
  runAgent,
  runVerification,
  writeVerification = () => {},
}) => {
  const maxIterations = Math.min(
    Math.max(Number(input.maxIterations ?? policy.maxIterations ?? 3), 1),
    policy.maxIterations ?? 3,
  )
  const phases = []
  const issues = []
  const fileChanges = []
  const implementationPlan = [
    `Analyze the requested feature: ${input.feature.trim()}.`,
    `Implement the objective while satisfying ${input.acceptanceCriteria.length} acceptance criteria.`,
    'Run configured verification gates and review the result before reporting completion.',
  ]
  const recordPhase = (name, status, details, iteration) => {
    const phase = { name, status, details }
    if (iteration) phase.iteration = iteration
    phases.push(phase)
    return phase
  }

  recordPhase('planner', 'running', 'Validating task input and preparing an implementation plan.')
  const plan = await runAgent('planner', { phase: 'planner', input, implementationPlan })
  phases[phases.length - 1] = { name: 'planner', status: plan.ok ? 'passed' : 'failed', details: plan.details }
  if (plan.payload?.implementationPlan?.length) {
    implementationPlan.splice(0, implementationPlan.length, ...plan.payload.implementationPlan)
  }
  if (!plan.ok) issues.push(plan.details)

  let lastVerification = []
  let completed = false
  for (let iteration = 1; iteration <= maxIterations && issues.length === 0; iteration += 1) {
    const before = snapshot()
    recordPhase('coder', 'running', 'Applying the approved implementation plan.', iteration)
    const coder = dryRun
      ? { ok: true, details: 'Dry run: coder execution skipped; no product files were changed.', payload: {} }
      : await runAgent('coder', { phase: 'coder', input, implementationPlan, iteration, previousVerification: lastVerification })
    phases[phases.length - 1] = { name: 'coder', iteration, status: coder.ok ? 'passed' : 'failed', details: coder.details }

    for (const file of changedFiles(before, snapshot())) {
      fileChanges.push({ file, change: `Changed during coder iteration ${iteration}.` })
    }
    if (!coder.ok) {
      issues.push(coder.details)
      break
    }

    recordPhase('tester', 'running', 'Running required verification gates.', iteration)
    const verification = await runVerification()
    const externalTest = await runAgent('tester', { phase: 'tester', input, implementationPlan, verification, iteration })
    if (!externalTest.ok) verification.push({ command: 'external tester', result: 'fail', details: externalTest.details })
    lastVerification = verification
    const testerOk = verification.every((check) => check.result === 'pass')
      && externalTest.ok
      && externalTest.payload.approved === true
    phases[phases.length - 1] = {
      name: 'tester',
      iteration,
      status: testerOk ? 'passed' : 'failed',
      details: testerOk ? 'All required gates passed and tester approved the evidence.'
        : externalTest.ok ? 'At least one required gate failed or tester rejected the evidence.' : externalTest.details,
    }
    writeVerification(iteration, verification)
    if (!testerOk && iteration === maxIterations) {
      issues.push('Verification did not pass before maxIterations was reached.')
      break
    }
    if (!testerOk) continue

    if (dryRun) {
      recordPhase('reviewer', 'passed', 'Dry run: reviewer execution skipped because no product files were changed.', iteration)
      completed = true
      break
    }

    recordPhase('reviewer', 'running', 'Checking scope, output contract, and acceptance criteria.', iteration)
    const outOfScopeChanges = findOutOfScopeChanges(fileChanges.map(({ file }) => file), policy)
    const reviewer = await runAgent('reviewer', { phase: 'reviewer', input, implementationPlan, verification, fileChanges, iteration })
    const reviewerApproved = reviewer.ok && reviewer.payload?.approved === true && outOfScopeChanges.length === 0
    const reviewerDetails = outOfScopeChanges.length
      ? `Out-of-scope files changed: ${outOfScopeChanges.join(', ')}`
      : reviewer.details
    phases[phases.length - 1] = { name: 'reviewer', iteration, status: reviewerApproved ? 'passed' : 'failed', details: reviewerDetails }
    if (!reviewerApproved) {
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
