import type { Finding } from '../contracts/index.js'

/**
 * The rule that catches "the agent said it changed this, but it did not".
 *
 * The id is declared in `config/rules.ts`; this module only produces findings
 * for it. Keeping the production of the fact separate from the declaration of
 * the rule is the same split ADR-007 asks of analyzers and rules.
 */
const CLAIM_RULE = 'change.claimed-file-missing'

/**
 * Every file an agent claimed to have changed that the diff does not contain.
 *
 * Silently ignoring a claim the diff contradicts is how a run reports success
 * for work that never happened, so a mismatch is listed explicitly. It defaults
 * to a `warning`: suspicious, not proven harmful, and therefore something a
 * reviewer has to confirm rather than something the harness silently discards.
 * See `docs/milestones/M08.md`.
 */
export const claimMismatches = (
  claims: readonly string[],
  actualFiles: readonly string[],
): Finding[] => {
  const seen = new Set<string>()
  const findings: Finding[] = []
  for (const file of claims) {
    if (actualFiles.includes(file) || seen.has(file)) continue
    seen.add(file)
    findings.push({
      rule: CLAIM_RULE,
      target: file,
      severity: 'warning',
      reason: `An agent claimed to change ${file}, but this iteration's diff does not contain it.`,
      retryable: true,
    })
  }
  return findings
}

/**
 * Drops evidence references that this iteration cannot account for.
 *
 * A finding may cite a path; a path the snapshot and diff do not contain is a
 * hallucinated citation, so it is removed while the finding itself stays —
 * the observation may still be valid even when its citation was not.
 */
export const sanitizeEvidenceRefs = (
  finding: Finding,
  actualFiles: readonly string[],
): Finding => {
  const refs = finding.evidence
  if (!refs || refs.length === 0) return finding
  const kept = refs.filter((ref) => actualFiles.includes(ref))
  return kept.length === refs.length ? finding : { ...finding, evidence: kept }
}

/** Findings de-duplicated by rule and target; the first of a pair wins. */
export const dedupeFindings = (findings: readonly Finding[]): Finding[] => {
  const seen = new Set<string>()
  const unique: Finding[] = []
  for (const finding of findings) {
    const key = `${finding.rule}\u0000${finding.target}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(finding)
  }
  return unique
}

/** The rule ids a set of findings declares, used as reviewer confirmations. */
export const confirmedRules = (findings: readonly Finding[]): string[] => [
  ...new Set(findings.map(({ rule }) => rule)),
]
