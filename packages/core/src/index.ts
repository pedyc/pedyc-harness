import { createRequire } from 'node:module'

// Three layers, with dependencies pointing one way: `contracts/` holds pure
// types and schema compilation, `config/` owns every read of a project's
// configuration documents, and `runtime/` executes a run against values the
// config layer already resolved. See `docs/architecture/system.md`.
export type * from './contracts/index.js'
export type { ConfigProblem, ManifestResult } from './config/index.js'
export {
  agentProblems,
  analyzerDeclarations,
  analyzerTarget,
  asRecord,
  builtInRules,
  compileSchema,
  configError,
  createAjv,
  createValidators,
  defaultActionFor,
  defaultAgents,
  defaultPolicy,
  effectiveRules,
  formatConfigError,
  harnessDirectory,
  independenceOf,
  isKnownAnalyzer,
  isKnownRule,
  knownRule,
  loadHarnessConfig,
  loadSchemas,
  manifestFile,
  manifestPath,
  mergeChecks,
  policyProblems,
  presetDocument,
  presetFile,
  presetPackageName,
  presetSchema,
  readManifest,
  readSchema,
  resolvePresets,
  stricterAction,
  stricterSeverity,
  validateAgents,
  validatePolicy,
  validationDetails,
  verificationProblems,
} from './config/index.js'
export type {
  AnalyzerDeclaration,
  CheckConflict,
  CheckSource,
  CollectedChecks,
  HarnessSchemas,
  HarnessValidators,
  PresetsResult,
  ResponseValidator,
  SchemaErrorFormatter,
} from './config/index.js'

export { detectPackageManager, packageScriptCommand } from './runtime/package-manager.js'
export type { PackageManager, PackageScriptCommand } from './runtime/package-manager.js'

export { normalizeTask, readTaskFile } from './runtime/intake.js'
export { runCommand } from './runtime/command.js'
export type { CommandResult } from './runtime/command.js'

export { changedFiles, snapshotFiles } from './runtime/diff-inspector.js'
export type { FileSnapshot } from './runtime/diff-inspector.js'

export { parseAgentResponse, validateStageResponse } from './runtime/agent.js'
export type { ParsedAgentResponse } from './runtime/agent.js'

export {
  analyzerEvidence,
  claimedEvidence,
  digest,
  evidenceFromCommand,
  isEvidence,
  judgingEvidence,
  mayJudge,
  normalizeEvidence,
  reviewEvidence,
  skippedEvidence,
  toVerificationCheck,
  toVerificationChecks,
  truncate,
} from './runtime/evidence.js'
export type { CommandEvidenceInput, SkippedEvidenceInput } from './runtime/evidence.js'

export { builtInAnalyzers } from './runtime/analyzers.js'
export type { Analyzer, AnalyzerContext, AnalyzerFact } from './runtime/analyzers.js'
export { compareConstraint, runStructuralChecks } from './runtime/structural.js'
export type { Comparison, StructuralOptions, StructuralOutcome } from './runtime/structural.js'
export { planSemantic, ruleHits, semanticChecks, triggerFired } from './runtime/semantic.js'
export type { SemanticCandidate, SemanticPlan, SemanticPlanOptions } from './runtime/semantic.js'

export {
  describeFileViolations,
  evaluateChangeBudget,
  evaluateCommand,
  evaluateFiles,
  evaluateFindings,
  findOutOfScopeChanges,
  isCommandAllowed,
  refusedFiles,
  actionFor,
} from './runtime/policy-engine.js'
export type { FindingDecision, PolicyDecision, PolicyViolation, ViolationKind } from './runtime/policy-engine.js'
export { findingVerdict, reviewerApproved, reviewerVerdict, testerApproved } from './runtime/approval-gate.js'
export type { FindingVerdict } from './runtime/approval-gate.js'
export { claimMismatches, confirmedRules, dedupeFindings, sanitizeEvidenceRefs } from './runtime/findings.js'
export { judgeScope } from './runtime/scope.js'
export type { ScopeJudgment } from './runtime/scope.js'

export { createProviderRunner } from './runtime/provider-runner.js'
export type { ProviderRunnerOptions } from './runtime/provider-runner.js'

export { runOrchestrator } from './runtime/executor.js'
export type { OrchestratorOptions } from './runtime/executor.js'

// Read from the manifest rather than repeating the literal here: a hardcoded copy silently
// kept reporting the previous release after the version was bumped.
export const harnessCoreVersion: string = createRequire(import.meta.url)('../package.json').version
