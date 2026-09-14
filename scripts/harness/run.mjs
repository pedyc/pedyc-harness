import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { normalizeTask, readTaskFile } from './intake.mjs'
import { detectPackageManager } from './package-manager.mjs'
import { runCommand } from '@pedyc/harness-core/command'
import { changedFiles, snapshotFiles } from '@pedyc/harness-core/snapshots'
import { loadSchemas, createValidators, validationDetails } from '@pedyc/harness-core/schema'
import { findOutOfScopeChanges, validatePolicy } from '@pedyc/harness-core/policy'
import { createProviderRunner } from '@pedyc/harness-core/provider'
import { runOrchestrator } from '@pedyc/harness-core/orchestrator'

const args = process.argv.slice(2)
const readArg = (name, fallback = null) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? fallback : fallback
}
const root = resolve(readArg('--root', process.cwd()))
const hasFlag = (name) => args.includes(name)
const positionalInput = args.find((arg, index) =>
  !arg.startsWith('-') && args[index - 1] !== '--root' && args[index - 1] !== '--input',
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
  process.exit(1)
}

if (taskPath && !existsSync(resolve(root, taskPath))) {
  emit(fail(`Human task was not found: ${taskPath}`, 'intake'))
  process.exit(1)
}
if (!taskPath && !prompt && !existsSync(inputPath)) {
  emit(fail(`Task input was not found: ${relative(root, inputPath)}`))
  process.exit(1)
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
    process.exit(1)
  }
  input = intake.normalizedTask
} catch (error) {
  emit(fail(`Task input is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`))
  process.exit(1)
}

if (!validators.input(input)) {
  emit(fail(`Task input violates input.schema.json: ${validationDetails(validators.ajv, validators.input)}`))
  process.exit(1)
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
  process.exit(1)
}

emit(result)
process.exit(orchestration.completed ? 0 : 1)
