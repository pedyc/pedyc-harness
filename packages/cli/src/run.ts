import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { normalizeTask, readTaskFile } from '@pedyc/harness-core/intake'
import { detectPackageManager } from '@pedyc/harness-core/package-manager'
import { runCommand } from '@pedyc/harness-core/command'
import { changedFiles, snapshotFiles } from '@pedyc/harness-core/snapshots'
import { formatConfigError, loadHarnessConfig } from '@pedyc/harness-core/config'
import { loadSchemas, createValidators, validationDetails } from '@pedyc/harness-core/schema'
import { createProviderRunner } from '@pedyc/harness-core/provider'
import { runOrchestrator } from '@pedyc/harness-core/orchestrator'
import { evaluateCommand } from '@pedyc/harness-core/policy'
import type {
  IntakeResult,
  NormalizedTask,
  PolicyViolation,
  RunResult,
  VerificationCheck,
} from '@pedyc/harness-core/contracts'

// Exit codes from `docs/interfaces/cli.md` §8.
const EXIT_FAILED = 1
const EXIT_CONFIG = 5

interface RunOptions {
  argv?: string[]
  cwd?: string
}

// Runs one harness execution against a target project. Returns a process exit
// code instead of terminating the process so the CLI and the compatibility
// shims can share the same implementation.
export const runHarness = async ({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
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
    verification: [{ command: `harness:${phase}`, result: 'fail', details: message }],
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
  const { policy: checkedPolicy, agents } = loaded.config

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
    runVerification: async () => {
      const verification: VerificationCheck[] = []
      for (const script of checkedPolicy.requiredChecks ?? []) {
        const packageManager = detectPackageManager(root)
        const command = `${packageManager.command} ${packageManager.args.join(' ')} ${script}`.trim()
        // A gate whose command the policy refuses is never started, so it cannot
        // have passed. `onViolation` decides whether the refusal also fails the
        // run; it never decides whether the command may run.
        const decision = evaluateCommand(packageManager.command, [...packageManager.args, script], checkedPolicy)
        if (!decision.allowed) {
          verificationViolations.push(...decision.violations)
          verification.push({
            command,
            result: 'fail' as const,
            details: decision.violations.map(({ reason }) => reason).join(' '),
          })
          continue
        }
        const commandResult = await runPackageScript(script)
        verification.push({
          command,
          result: commandResult.code === 0 ? 'pass' as const : 'fail' as const,
          details: commandResult.code === 0 ? 'Command completed successfully.' : commandResult.stderr.trim() || 'Command failed.',
        })
      }
      return verification
    },
    writeVerification: (iteration, verification) => writeJson(join(runDirectory, `iteration-${iteration}-verification.json`), verification),
  })

  const result: RunResult = {
    status: orchestration.completed ? 'passed' : 'failed',
    summary: orchestration.completed
      ? `Harness completed ${input.feature.trim()} through Planner, Coder, Tester, and Reviewer.`
      : `Harness could not complete ${input.feature.trim()}.`,
    implementationPlan: orchestration.implementationPlan,
    fileChanges: orchestration.fileChanges,
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
