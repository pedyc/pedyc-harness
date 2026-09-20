import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { normalizeTask, readTaskFile } from '@pedyc/harness-core/intake'
import { detectPackageManager } from '@pedyc/harness-core/package-manager'
import { runCommand } from '@pedyc/harness-core/command'
import { changedFiles, snapshotFiles } from '@pedyc/harness-core/snapshots'
import { formatConfigError, independenceOf, loadHarnessConfig } from '@pedyc/harness-core/config'
import { loadSchemas, createValidators, validationDetails } from '@pedyc/harness-core/schema'
import { createProviderRunner } from '@pedyc/harness-core/provider'
import { runOrchestrator } from '@pedyc/harness-core/orchestrator'
import { evaluateCommand } from '@pedyc/harness-core/policy'
import { evidenceFromCommand, skippedEvidence } from '@pedyc/harness-core'
import type {
  Evidence,
  IntakeResult,
  NormalizedTask,
  PolicyViolation,
  RunResult,
} from '@pedyc/harness-core/contracts'

// Exit codes from `docs/interfaces/cli.md` §8.
const EXIT_FAILED = 1
const EXIT_CONFIG = 5

interface RunOptions {
  argv?: string[]
  cwd?: string
  /** Cancelling it kills a running provider process and ends the run as cancelled. */
  signal?: AbortSignal
}

// Runs one harness execution against a target project. Returns a process exit
// code instead of terminating the process so the CLI and the compatibility
// shims can share the same implementation.
export const runHarness = async ({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  signal,
}: RunOptions = {}): Promise<number> => {
  const readArg = (name: string, fallback: string | null = null): string | null => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] ?? fallback : fallback
  }
  const root = resolve(cwd, readArg('--root', cwd) as string)
  const hasFlag = (name: string): boolean => argv.includes(name)
  const positionalInput = argv.find((arg, index) =>
    !arg.startsWith('-') && argv[index - 1] !== '--root' && argv[index - 1] !== '--input',
  )
  const inputPath = resolve(root, readArg('--input', positionalInput ?? '.harness/task.json') as string)
  const taskPath = readArg('--task')
  const prompt = readArg('--prompt')
  const outputPath = readArg('--output')
  const dryRun = hasFlag('--dry-run')
  const jsonOnly = hasFlag('--json')
  // `--semantic=disabled` and `--semantic disabled` both read as the switch;
  // anything else (including absence) leaves the layer enabled.
  const semanticValue = argv.find((arg) => arg.startsWith('--semantic='))?.slice('--semantic='.length)
    ?? readArg('--semantic')
  const semantic = semanticValue === 'disabled' ? 'disabled' as const : 'enabled' as const
  const runId = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
  const runDirectory = join(root, '.harness', 'runs', runId)

  const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
  const writeJson = (path: string, value: unknown): void => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }

  const fail = (message: string, phase = 'input'): RunResult => ({
    status: 'failed',
    summary: `Harness stopped during ${phase}.`,
    implementationPlan: [`Stop before implementation because the ${phase} phase failed.`],
    fileChanges: [],
    // Nothing was observed, so nothing is claimed: a failure before execution
    // has no evidence to record, only an issue.
    evidence: [],
    verification: [{ command: `harness:${phase}`, result: 'fail', details: message }],
    findings: [],
    violations: [],
    issues: [message],
    phases: [{ name: phase, status: 'failed', details: message }],
    iterations: 0,
    dryRun,
  })

  const emit = (result: RunResult): void => {
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (outputPath) writeFileSync(resolve(root, outputPath), serialized, 'utf8')
    writeJson(join(runDirectory, 'output.json'), result)
    if (jsonOnly || !outputPath) process.stdout.write(serialized)
  }

  // Configuration is resolved before anything runs, and a project that cannot
  // be resolved is never partially executed: a bad policy must not fail
  // halfway through a run with a provider already paid for.
  const loaded = loadHarnessConfig(root)
  if (!loaded.ok) {
    const details = loaded.errors.map(formatConfigError).join(' ')
    emit(fail(details, 'config'))
    for (const error of loaded.errors) console.error(formatConfigError(error))
    return EXIT_CONFIG
  }
  const { policy: checkedPolicy, agents, checks } = loaded.config

  const validators = createValidators(loadSchemas(root))

  if (taskPath && !existsSync(resolve(root, taskPath))) {
    emit(fail(`Human task was not found: ${taskPath}`, 'intake'))
    return EXIT_FAILED
  }
  if (!taskPath && !prompt && !existsSync(inputPath)) {
    emit(fail(`Task input was not found: ${relative(root, inputPath)}`))
    return EXIT_FAILED
  }

  let input: NormalizedTask
  try {
    const intake: IntakeResult = taskPath
      ? readTaskFile(resolve(root, taskPath))
      : prompt
        ? normalizeTask({ task: prompt, goal: prompt })
        : { status: 'ready', normalizedTask: readJson(inputPath) as NormalizedTask, questions: [] }
    if (intake.status !== 'ready') {
      emit(fail(`Intake requires clarification: ${intake.questions.join(' ')}`, 'intake'))
      return EXIT_FAILED
    }
    input = intake.normalizedTask
  } catch (error) {
    emit(fail(`Task input is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`))
    return EXIT_FAILED
  }

  if (!validators.input(input)) {
    emit(fail(`Task input violates input.schema.json: ${validationDetails(validators.ajv, validators.input)}`))
    return EXIT_FAILED
  }

  const runPackageScript = (script: string) => {
    const packageManager = detectPackageManager(root)
    return runCommand(root, packageManager.command, [...packageManager.args, script])
  }

  // Violations the orchestrator cannot see — a verification command the policy
  // refused — are collected here and merged into the result beside the ones the
  // orchestrator already gathered.
  const verificationViolations: PolicyViolation[] = []

  const runAgent = createProviderRunner({
    root,
    agents,
    policy: checkedPolicy,
    validator: validators.agentResponse,
    ajv: validators.ajv,
    // `agentTimeoutMs` bounds provider invocations only: the field names the
    // agent stage, and a verification gate is the project's own script, which
    // keeps whatever timeout its author gave it.
    agentTimeoutMs: checkedPolicy.agentTimeoutMs,
    signal,
  })

  writeJson(join(runDirectory, 'input.json'), input)
  writeJson(join(runDirectory, 'policy.json'), checkedPolicy)

  const orchestration = await runOrchestrator({
    input,
    policy: checkedPolicy,
    dryRun,
    runAgent,
    snapshot: () => snapshotFiles(root),
    changedFiles,
    // Declared checks come from the resolved configuration, so a project's
    // `policy.rules` and its `verification` documents describe the same rule set
    // the run actually evaluates.
    checks,
    semantic,
    independence: independenceOf(agents),
    runVerification: async () => {
      const evidence: Evidence[] = []
      for (const [index, script] of (checkedPolicy.requiredChecks ?? []).entries()) {
        const packageManager = detectPackageManager(root)
        const command = `${packageManager.command} ${packageManager.args.join(' ')} ${script}`.trim()
        const id = `requiredChecks:${index + 1}:${script}`
        // A gate whose command the policy refuses is never started, so it cannot
        // have passed. `onViolation` decides whether the refusal also fails the
        // run; it never decides whether the command may run.
        const decision = evaluateCommand(packageManager.command, [...packageManager.args, script], checkedPolicy)
        if (!decision.allowed) {
          verificationViolations.push(...decision.violations)
          evidence.push(skippedEvidence({
            id,
            source: 'requiredChecks',
            name: script,
            command,
            packageManager: packageManager.name,
            reason: decision.violations.map(({ reason }) => reason).join(' '),
          }))
          continue
        }
        const startedAt = new Date().toISOString()
        const startedAtMs = Date.now()
        const commandResult = await runPackageScript(script)
        evidence.push(evidenceFromCommand({
          id,
          source: 'requiredChecks',
          name: script,
          command,
          packageManager: packageManager.name,
          result: commandResult,
          durationMs: Date.now() - startedAtMs,
          startedAt,
        }))
      }
      return evidence
    },
    writeVerification: (iteration, evidence) => writeJson(join(runDirectory, `iteration-${iteration}-verification.json`), evidence),
  })

  const result: RunResult = {
    status: orchestration.completed ? 'passed' : 'failed',
    termination: orchestration.termination,
    summary: orchestration.completed
      ? `Harness completed ${input.feature.trim()} through Planner, Coder, Tester, and Reviewer.`
      : `Harness could not complete ${input.feature.trim()}.`,
    implementationPlan: orchestration.implementationPlan,
    fileChanges: orchestration.fileChanges,
    scope: orchestration.scope,
    evidence: orchestration.evidence,
    findings: orchestration.findings,
    semantic: orchestration.semantic,
    independence: orchestration.independence,
    verification: orchestration.verification.length > 0
      ? orchestration.verification
      : [{
          command: `harness:${orchestration.phases.at(-1)?.name ?? 'execution'}`,
          result: orchestration.completed ? 'pass' as const : 'fail' as const,
          details: orchestration.issues[0] ?? 'No verification was recorded.',
        }],
    issues: orchestration.issues,
    violations: [...orchestration.violations, ...verificationViolations],
    phases: orchestration.phases,
    iterations: orchestration.iterations,
    dryRun,
  }

  if (!validators.output(result)) {
    emit(fail(`Harness output violates output.schema.json: ${validationDetails(validators.ajv, validators.output)}`, 'output'))
    return EXIT_FAILED
  }

  emit(result)
  return orchestration.completed ? 0 : EXIT_FAILED
}
