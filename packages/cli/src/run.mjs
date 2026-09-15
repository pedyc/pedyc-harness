import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { normalizeTask, readTaskFile } from '@pedyc/harness-core/intake'
import { detectPackageManager } from '@pedyc/harness-core/package-manager'
import { runCommand } from '@pedyc/harness-core/command'
import { changedFiles, snapshotFiles } from '@pedyc/harness-core/snapshots'
import { loadSchemas, createValidators, validationDetails } from '@pedyc/harness-core/schema'
import { validatePolicy } from '@pedyc/harness-core/policy'
import { createProviderRunner } from '@pedyc/harness-core/provider'
import { runOrchestrator } from '@pedyc/harness-core/orchestrator'

// Runs one harness execution against a target project. Returns a process exit
// code instead of terminating the process so the CLI and the compatibility
// shims can share the same implementation.
export const runHarness = async ({ argv = process.argv.slice(2), cwd = process.cwd() } = {}) => {
  const readArg = (name, fallback = null) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] ?? fallback : fallback
  }
  const root = resolve(cwd, readArg('--root', cwd))
  const hasFlag = (name) => argv.includes(name)
  const positionalInput = argv.find((arg, index) =>
    !arg.startsWith('-') && argv[index - 1] !== '--root' && argv[index - 1] !== '--input',
  )
  const inputPath = resolve(root, readArg('--input', positionalInput ?? '.harness/task.json'))
  const taskPath = readArg('--task')
  const prompt = readArg('--prompt')
  const outputPath = readArg('--output')
  const dryRun = hasFlag('--dry-run')
  const jsonOnly = hasFlag('--json')
  const runId = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
  const runDirectory = join(root, '.harness', 'runs', runId)

  const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
  const writeJson = (path, value) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }

  const fail = (message, phase = 'input') => ({
    status: 'failed',
    summary: `Harness stopped during ${phase}.`,
    implementationPlan: [`Stop before implementation because the ${phase} phase failed.`],
    fileChanges: [],
    verification: [{ command: `harness:${phase}`, result: 'fail', details: message }],
    issues: [message],
    phases: [{ name: phase, status: 'failed', details: message }],
    iterations: 0,
    dryRun,
  })

  const emit = (result) => {
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (outputPath) writeFileSync(resolve(root, outputPath), serialized, 'utf8')
    writeJson(join(runDirectory, 'output.json'), result)
    if (jsonOnly || !outputPath) process.stdout.write(serialized)
  }

  const validators = createValidators(loadSchemas(root))
  const policy = readJson(join(root, '.harness/policy.json'))
  const agents = readJson(join(root, '.harness/agents.json'))
  const policyError = validatePolicy(policy)
  if (policyError) {
    emit(fail(policyError, 'policy'))
    return 1
  }

  if (taskPath && !existsSync(resolve(root, taskPath))) {
    emit(fail(`Human task was not found: ${taskPath}`, 'intake'))
    return 1
  }
  if (!taskPath && !prompt && !existsSync(inputPath)) {
    emit(fail(`Task input was not found: ${relative(root, inputPath)}`))
    return 1
  }

  let input
  try {
    const intake = taskPath
      ? readTaskFile(resolve(root, taskPath))
      : prompt
        ? normalizeTask({ task: prompt, goal: prompt })
        : { status: 'ready', normalizedTask: readJson(inputPath), questions: [] }
    if (intake.status !== 'ready') {
      emit(fail(`Intake requires clarification: ${intake.questions.join(' ')}`, 'intake'))
      return 1
    }
    input = intake.normalizedTask
  } catch (error) {
    emit(fail(`Task input is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`))
    return 1
  }

  if (!validators.input(input)) {
    emit(fail(`Task input violates input.schema.json: ${validationDetails(validators.ajv, validators.input)}`))
    return 1
  }

  const runPackageScript = (script) => {
    const packageManager = detectPackageManager(root)
    return runCommand(root, packageManager.command, [...packageManager.args, script])
  }

  const runAgent = createProviderRunner({
    root,
    agents,
    policy,
    validator: validators.agentResponse,
    ajv: validators.ajv,
  })

  writeJson(join(runDirectory, 'input.json'), input)
  writeJson(join(runDirectory, 'policy.json'), policy)

  const orchestration = await runOrchestrator({
    input,
    policy,
    dryRun,
    runAgent,
    snapshot: () => snapshotFiles(root),
    changedFiles,
    runVerification: async () => {
      const verification = []
      for (const script of policy.requiredChecks) {
        const packageManager = detectPackageManager(root)
        const commandResult = await runPackageScript(script)
        verification.push({
          command: `${packageManager.command} ${packageManager.args.join(' ')} ${script}`.trim(),
          result: commandResult.code === 0 ? 'pass' : 'fail',
          details: commandResult.code === 0 ? 'Command completed successfully.' : commandResult.stderr.trim() || 'Command failed.',
        })
      }
      return verification
    },
    writeVerification: (iteration, verification) => writeJson(join(runDirectory, `iteration-${iteration}-verification.json`), verification),
  })

  const result = {
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
          result: orchestration.completed ? 'pass' : 'fail',
          details: orchestration.issues[0] ?? 'No verification was recorded.',
        }],
    issues: orchestration.issues,
    phases: orchestration.phases,
    iterations: orchestration.iterations,
    dryRun,
  }

  if (!validators.output(result)) {
    emit(fail(`Harness output violates output.schema.json: ${validationDetails(validators.ajv, validators.output)}`, 'output'))
    return 1
  }

  emit(result)
  return orchestration.completed ? 0 : 1
}
