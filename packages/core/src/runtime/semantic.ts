import type { CheckDeclaration, Finding, SemanticRecord, SemanticTrigger, Severity } from '../contracts/index.js'

/**
 * A declaration the semantic layer may dispatch.
 *
 * `promptText` is optional because the config layer adds it after resolving the
 * prompt path; a caller that hands in a bare declaration gets an empty prompt
 * rather than a file read outside the workspace.
 */
export type SemanticCandidate = CheckDeclaration & { promptText?: string }

/** The rule ids that produced a finding this iteration. */
export const ruleHits = (findings: readonly Finding[]): Set<string> =>
  new Set(findings.map(({ rule }) => rule))

const matches = (trigger: SemanticTrigger, hits: ReadonlySet<string>): boolean => {
  if (trigger.kind === 'rules') return trigger.rules.some((rule) => hits.has(rule))
  return trigger.triggers.some((entry) => matches(entry, hits))
}

/** Every semantic check the resolved configuration declares. */
export const semanticChecks = (checks: readonly SemanticCandidate[]): SemanticCandidate[] =>
  checks.filter(({ verification }) => verification === 'semantic')

/** Whether one declaration's trigger fired. */
export const triggerFired = (check: SemanticCandidate, hits: ReadonlySet<string>): boolean =>
  check.trigger !== undefined && matches(check.trigger, hits)

export interface SemanticPlanOptions {
  checks: readonly SemanticCandidate[]
  /** The findings of this iteration; their rule ids are the trigger facts. */
  findings: readonly Finding[]
  /** `--semantic=disabled`: the layer is switched off and says so. */
  disabled?: boolean
  /** Semantic calls already made in this run. */
  callsUsed?: number
  /** `policy.maxSemanticCalls`; absent means no budget. */
  budget?: number
}

export interface SemanticPlan {
  /** The checks to hand to one call, grouped by the role that serves them. */
  byRole: Map<string, SemanticCandidate[]>
  skipped: Array<{ id: string; severity: Severity; reason: string }>
  /** Triggers that fired but could not run and are `error`: fail closed. */
  failClosed: string[]
  status: SemanticRecord['status']
}

/**
 * Decides what the semantic layer does this round.
 *
 * The rule is ADR-005's: a check runs when its trigger fires, nothing runs when
 * nothing triggered, and everything that did trigger travels in the same call.
 * Running out of budget splits by severity — a `warning` may be skipped and
 * recorded, an `error` may not, because skipping it would let a run pass on
 * coverage it never had. See `docs/decisions/ADR-005-semantic-governance.md` §2.7.
 */
export const planSemantic = ({
  checks,
  findings,
  disabled = false,
  callsUsed = 0,
  budget,
}: SemanticPlanOptions): SemanticPlan => {
  const declared = semanticChecks(checks)
  if (declared.length === 0) {
    return { byRole: new Map(), skipped: [], failClosed: [], status: 'idle' }
  }
  if (disabled) {
    return {
      byRole: new Map(),
      skipped: declared.map(({ id, severity }) => ({
        id,
        severity,
        reason: 'Semantic review is disabled (--semantic=disabled); this layer did not run.',
      })),
      failClosed: [],
      status: 'disabled',
    }
  }

  const hits = ruleHits(findings)
  const triggered = declared.filter((check) => triggerFired(check, hits))
  if (triggered.length === 0) {
    return { byRole: new Map(), skipped: [], failClosed: [], status: 'idle' }
  }

  if (budget !== undefined && callsUsed >= budget) {
    const skipped = triggered
      .filter(({ severity }) => severity !== 'error')
      .map(({ id, severity }) => ({
        id,
        severity,
        reason: `Semantic call budget exhausted (maxSemanticCalls: ${budget}); the check was skipped.`,
      }))
    return {
      byRole: new Map(),
      skipped,
      failClosed: triggered.filter(({ severity }) => severity === 'error').map(({ id }) => id),
      status: 'idle',
    }
  }

  const byRole = new Map<string, SemanticCandidate[]>()
  for (const check of triggered) {
    const role = check.role ?? 'reviewer'
    byRole.set(role, [...(byRole.get(role) ?? []), check])
  }
  return { byRole, skipped: [], failClosed: [], status: 'ran' }
}
