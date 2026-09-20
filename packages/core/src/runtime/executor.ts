import type {
  AgentCallResult,
  AgentRole,
  CheckDeclaration,
  Evidence,
  FileChange,
  Finding,
  IndependenceRecord,
  NormalizedTask,
  OrchestrationResult,
  PhaseRecord,
  PhaseStatus,
  Policy,
  PolicyViolation,
  RunAgent,
  ScopeRecord,
  SemanticRecord,
  TerminationReason,
  VerificationCheck,
} from '../contracts/index.js'
import { findingVerdict, reviewerApproved, reviewerVerdict, testerApproved } from './approval-gate.js'
import type { FileSnapshot } from './diff-inspector.js'
import {
  analyzerEvidence,
  claimedEvidence,
  judgingEvidence,
  normalizeEvidence,
  reviewEvidence,
  toVerificationChecks,
} from './evidence.js'
import { claimMismatches, confirmedRules, dedupeFindings, sanitizeEvidenceRefs } from './findings.js'
import { evaluateChangeBudget, evaluateFindings } from './policy-engine.js'
import { judgeScope } from './scope.js'
import { planSemantic } from './semantic.js'
import { runStructuralChecks } from './structural.js'

export interface OrchestratorOptions {
  input: NormalizedTask
  policy: Policy
  dryRun: boolean
  snapshot: () => FileSnapshot
  changedFiles: (before: FileSnapshot, after: FileSnapshot) => string[]
  runAgent: RunAgent
  /**
   * Produces the evidence for one iteration.
   *
   * A caller may still return the legacy `VerificationCheck[]`; those entries
   * are upgraded to evidence with the provenance the harness can honestly claim
   * for them. New callers should return `Evidence[]` so trust, exit codes,
   * durations and digests reach the record.
   */
  runVerification: () => Promise<Array<Evidence | VerificationCheck>>
  writeVerification?: (iteration: number, evidence: Evidence[]) => void
  /**
   * The checks the resolved configuration declares.
   *
   * Only structural constraints are evaluated here; the rule set is what makes a
   * `policy.rules` key legal, so a caller that omits it simply has no declared
   * checks rather than a different rule set.
   */
  checks?: readonly CheckDeclaration[]
  /**
   * Whether the semantic layer may dispatch.
   *
   * `disabled` is the `--semantic=disabled` switch: nothing is called, and the
   * fact that the layer did not run is recorded rather than passed over.
   */
  semantic?: 'enabled' | 'disabled'
  /**
   * How the stages that check each other were routed.
   *
   * Echoed into the result so a run can answer "was the reviewer independent of
   * the coder" from its own record. The caller knows the routing; the harness
   * only records it.
   */
  independence?: IndependenceRecord
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
  checks = [],
  semantic = 'enabled',
  independence,
}: OrchestratorOptions): Promise<OrchestrationResult> => {
  const maxIterations = Math.min(
    Math.max(Number(input.maxIterations ?? policy.maxIterations ?? 3), 1),
    policy.maxIterations ?? 3,
  )
  const phases: PhaseRecord[] = []
  const issues: string[] = []
  const fileChanges: FileChange[] = []
  const violations: PolicyViolation[] = []
  // Every file an agent claimed to have changed, from every stage. The diff is
  // what actually happened; the claims are what the agents say happened, and the
  // two are only allowed to agree.
  const agentClaims: string[] = []

  const recordClaims = (result: AgentCallResult): void => {
    const claimed = result.payload.changedFiles
    if (!Array.isArray(claimed)) return
    for (const file of claimed) {
      if (typeof file === 'string' && !agentClaims.includes(file)) agentClaims.push(file)
    }
  }

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
    return {
      completed: true,
      implementationPlan,
      fileChanges,
      // A dry run observes nothing, so it produces no evidence: recording a
      // check that never ran would be a fabricated fact.
      evidence: [],
      verification: [],
      findings: [],
      violations,      issues,
      phases,
      iterations: 1,
    }
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
  let lastEvidence: Evidence[] = []
  let lastFindings: Finding[] = []
  let lastScope: ScopeRecord | undefined
  let lastSemantic: SemanticRecord | undefined
  let semanticCalls = 0
  const semanticRecord = (status: SemanticRecord['status'], triggered: string[], skipped: SemanticRecord['skipped']): void => {
    lastSemantic = { status, triggered, skipped, calls: semanticCalls }
  }
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
    // Claims are compared against the diff of the iteration that made them, so a
    // claim is not carried over: a stale sentence must not fail a later attempt.
    agentClaims.length = 0
    const before = snapshot()
    recordPhase('coder', 'running', 'Applying the approved implementation plan.', iteration)
    const coder = await runAgent('coder', {
      phase: 'coder',
      input,
      implementationPlan,
      iteration,
      previousVerification: lastVerification,
      previousFindings: lastFindings,
    })
    recordClaims(coder)
    phases[phases.length - 1] = {
      name: 'coder',
      iteration,
      status: coder.ok ? 'passed' : 'failed',
      details: coder.details,
    }
    recordViolations(coder.violations)

    const after = snapshot()
    const iterationChanges = changedFiles(before, after)
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
    const gateResults = await runVerification()
    const evidence = normalizeEvidence(gateResults)
    const externalTest = await runAgent('tester', {
      phase: 'tester',
      input,
      implementationPlan,
      verification: toVerificationChecks(evidence),
      iteration,
    })
    // What the tester says it saw is recorded, but as a claim: it is the
    // inspected party describing itself and only enters the record as a lead.
    const claims = externalTest.payload.evidence
    if (Array.isArray(claims) && claims.length > 0) {
      evidence.push(...claimedEvidence('tester-claim', claims))
    }
    if (!externalTest.ok) {
      evidence.push(...claimedEvidence('tester-error', [{
        command: 'external tester',
        result: 'fail',
        details: externalTest.details,
      }]))
    }
    recordClaims(externalTest)
    recordViolations(externalTest.violations)
    lastEvidence = evidence
    lastVerification = toVerificationChecks(evidence)

    const testerOk = testerApproved(evidence, externalTest)
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
    writeVerification(iteration, evidence)

    if (stoppedByHarness(externalTest)) break
    if (!testerOk && iteration === maxIterations) {
      issues.push('Verification did not pass before maxIterations was reached.')
      termination = 'max_iterations'
      break
    }
    if (!testerOk) continue

    // Scope is a step of its own: the harness compares what changed against what
    // the policy allows, and reports the answer as its own fact. It goes through
    // the policy evaluator rather than a second implementation here, and it runs
    // even when the reviewer has already approved, because approval is an
    // agent's opinion while scope is an observation.
    const actualFiles = fileChanges.map(({ file }) => file)
    recordPhase('scope', 'running', 'Comparing actual changes against the policy scope.', iteration)
    const scope = judgeScope(actualFiles, policy)
    recordViolations(scope.violations)
    const refused = scope.refusedFiles
    phases[phases.length - 1] = {
      name: 'scope',
      iteration,
      status: scope.allowed ? 'passed' : 'failed',
      details: scope.details,
    }
    lastScope = { allowed: scope.allowed, refusedFiles: scope.refusedFiles, details: scope.details }
    // Declared constraints are evaluated against facts the analyzers extracted
    // from the changed files. The facts are evidence (`analyzer-derived`), the
    // comparisons are findings, and a constraint that cannot be evaluated stops
    // the run instead of passing unobserved.
    const structural = runStructuralChecks({
      checks,
      files: actualFiles,
      readFile: (file) => after.get(file) ?? null,
    })
    if (structural.facts.length > 0) {
      evidence.push(...analyzerEvidence(structural.facts))
      lastEvidence = evidence
      // The artifact carries the whole iteration's evidence; the analyzer facts
      // are gathered after the gates ran, so the file is written again rather
      // than left with only half of what was observed.
      writeVerification(iteration, evidence)
    }
    if (structural.errors.length > 0) {
      const message = structural.errors.join(' ')
      issues.push(message)
      termination = 'policy_violation'
      break
    }
    // Findings the harness observed itself: a claimed change the diff does not
    // contain, and every declared constraint that did not hold. They are facts
    // about the run, not opinions about the design, and the reviewer is asked to
    // confirm them rather than to discover them.
    const observed = dedupeFindings([...claimMismatches(agentClaims, actualFiles), ...structural.findings])
    recordPhase('reviewer', 'running', 'Asking the reviewer for a structured judgment.', iteration)
    const reviewer = await runAgent('reviewer', {
      phase: 'reviewer',
      input,
      implementationPlan,
      verification: lastVerification,
      fileChanges,
      findings: observed,
      iteration,
    })
    recordClaims(reviewer)
    recordViolations(reviewer.violations)
    // Citations the iteration cannot account for are dropped, then the whole set
    // is disposed by the one rule family that owns severity and action.
    const reported = (reviewer.payload.findings ?? [])
      .map((finding) => sanitizeEvidenceRefs(finding, actualFiles))
    // The reviewer phase records the reviewer's own verdict; scope, evidence, the
    // semantic layer and the findings verdict are separate facts, and the run's
    // pass condition is their conjunction.
    const stageOk = reviewerVerdict(reviewer, lastEvidence)
    // "There was nothing to approve" is a different failure from "the reviewer
    // said no", and the two must not read the same in the record.
    const noEvidence = judgingEvidence(lastEvidence).length === 0
      ? 'Reviewer cannot approve: no verification evidence was recorded for this iteration.'
      : null
    phases[phases.length - 1] = {
      name: 'reviewer',
      iteration,
      status: stageOk ? 'passed' : 'failed',
      details: noEvidence ?? reviewer.details,
    }
    let findings = dedupeFindings([...observed, ...reported])

    // The semantic layer: declared checks whose triggers fired are batched into
    // one call per role, dispatched by the harness on the role the declaration
    // named. Nothing triggered means no call at all, and a switch-off is
    // recorded instead of being indistinguishable from a clean review.
    const semanticDeclared = checks.some(({ verification }) => verification === 'semantic')
    const plan = planSemantic({
      checks,
      findings,
      disabled: semantic === 'disabled',
      callsUsed: semanticCalls,
      ...(policy.maxSemanticCalls === undefined ? {} : { budget: policy.maxSemanticCalls }),
    })
    const triggeredIds = [...plan.byRole.values()].flat().map(({ id }) => id)
    if (plan.failClosed.length > 0) {
      const message = `Semantic checks could not run within maxSemanticCalls (${String(policy.maxSemanticCalls)}): ${plan.failClosed.join(', ')}.`
      issues.push(message)
      semanticRecord('idle', triggeredIds, plan.skipped)
      termination = 'policy_violation'
      break
    }
    for (const [role, group] of plan.byRole) {
      recordPhase('semantic', 'running', `Dispatching ${group.length} semantic check(s) on the '${role}' role.`, iteration)
      const call = await runAgent(role as AgentRole, {
        phase: 'semantic',
        input,
        implementationPlan,
        checks: group.map((check) => ({
          id: check.id,
          severity: check.severity,
          prompt: check.promptText ?? '',
        })),
        findings,
        verification: lastVerification,
        iteration,
      })
      semanticCalls += 1
      recordClaims(call)
      recordViolations(call.violations)
      const answered = (call.payload.findings ?? []).map((finding) => sanitizeEvidenceRefs(finding, actualFiles))
      if (answered.length > 0) {
        evidence.push(...reviewEvidence(answered, role))
        lastEvidence = evidence
        writeVerification(iteration, evidence)
      }
      phases[phases.length - 1] = {
        name: 'semantic',
        iteration,
        status: call.ok ? 'passed' : 'failed',
        details: call.ok
          ? `${group.length} semantic check(s) answered by the '${role}' provider.`
          : call.details,
      }
      if (stoppedByHarness(call)) break
      if (!call.ok) {
        issues.push(call.details)
        termination = 'agent_error'
        break
      }
      findings = dedupeFindings([...findings, ...answered])
    }
    if (semanticDeclared) semanticRecord(plan.status, triggeredIds, plan.skipped)
    if (issues.length > 0) break

    lastFindings = findings
    const disposition = evaluateFindings(findings, policy, confirmedRules(reported), checks)
    // The disposition is the harness's judgment, so it is recorded beside the
    // violations the other two families produced rather than inside the payload.
    recordViolations(disposition.violations)
    const verdict = findingVerdict(disposition)
    const gateOk = reviewerApproved(reviewer, refused, lastEvidence) && verdict.passed
    if (!gateOk) {
      const unknownRule = disposition.unknown.length > 0
        ? `Reviewer reported rule id(s) no implementation declares: ${disposition.unknown.join(', ')}.`
        : null
      const sentBack = verdict.retry
        ? `Findings sent back to the coder: ${verdict.blocking.map(({ reason }) => reason).join(' ')}`
        : null
      const stopped = sentBack === null && verdict.blocking.length > 0
        ? `Findings stopped the run: ${verdict.blocking.map(({ reason }) => reason).join(' ')}`
        : null
      // A repairable finding is another attempt rather than a failure, which is
      // the one path back to the coder that structured findings open. A refusal
      // is never retried, whatever the reviewer thought of the change.
      if (sentBack !== null && iteration < maxIterations && scope.allowed) continue
      const summary = !scope.allowed
        ? scope.details
        : unknownRule
          ?? noEvidence
          ?? sentBack
          ?? stopped
          ?? reviewer.details
      issues.push(summary)
      termination = !scope.allowed || stopped !== null
        ? 'policy_violation'
        : unknownRule !== null || noEvidence !== null
          ? 'agent_error'
          : sentBack !== null
            ? 'max_iterations'
            : reviewer.termination ?? 'agent_error'
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
    scope: lastScope,
    evidence: lastEvidence,
    verification: lastVerification,
    findings: lastFindings,
    semantic: lastSemantic,
    independence,
    violations,
    issues,
    phases,
    iterations: phases.filter((phase) => phase.name === 'coder').length,
  }
}
