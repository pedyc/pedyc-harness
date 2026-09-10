import Ajv2020 from 'ajv/dist/2020.js'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizeTask, readTaskFile } from './intake.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const readArg = (name, fallback = null) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? fallback : fallback
}
const hasFlag = (name) => args.includes(name)
const positionalInput = args.find((arg) => !arg.startsWith('-'))
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

const inputSchema = readJson(join(root, '.harness/input.schema.json'))
const outputSchema = readJson(join(root, '.harness/output.schema.json'))
const agentResponseSchema = readJson(join(root, '.harness/agent-response.schema.json'))
const policy = readJson(join(root, '.harness/policy.json'))
const agents = readJson(join(root, '.harness/agents.json'))
const ajv = new Ajv2020({ allErrors: true, strict: false })
const validateInput = ajv.compile(inputSchema)
const validateOutput = ajv.compile(outputSchema)
const validateAgentResponse = ajv.compile(agentResponseSchema)

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

if (!validateInput(input)) {
  emit(fail(`Task input violates input.schema.json: ${ajv.errorsText(validateInput.errors)}`))
  process.exit(1)
}

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

const normalizeCommand = (command) => {
  if (
    process.platform === 'win32'
    && ['npm', 'npx', 'pnpm', 'yarn'].includes(command)
    && !command.endsWith('.cmd')
  ) {
    return `${command}.cmd`
  }
  return command
}

const runCommand = (command, commandArgs = [], stdin = null) => new Promise((resolvePromise) => {
  const child = spawn(normalizeCommand(command), commandArgs, {
    cwd: root,
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }))
  child.on('error', (error) => resolvePromise({ code: 1, stdout, stderr: error.message }))
  if (stdin !== null) child.stdin.write(`${JSON.stringify(stdin)}\n`)
  child.stdin.end()
})

const listFiles = (directory, result = []) => {
  if (!existsSync(directory)) return result
  for (const entry of readdirSync(directory)) {
    if (directory === root && ['node_modules', 'dist', '.git'].includes(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) listFiles(path, result)
    else result.push(relative(root, path).replaceAll('\\', '/'))
  }
  return result
}

const snapshotFiles = () => new Map(
  listFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8')]),
)

const parseAgentResponse = (name, stdout) => {
  const trimmed = stdout.trim()
  if (!trimmed) return { ok: true, details: `${name} completed without a response payload.`, payload: {} }
  try {
    const payload = JSON.parse(trimmed)
    if (!validateAgentResponse(payload)) {
      return { ok: false, details: `${name} returned an invalid response: ${ajv.errorsText(validateAgentResponse.errors)}`, payload: {} }
    }
    return { ok: true, details: payload.details ?? `${name} returned a structured response.`, payload }
  } catch {
    return { ok: false, details: `${name} must return one JSON object on stdout.`, payload: {} }
  }
}

const validateStageResponse = (name, payload) => {
  if (name === 'planner' && (!Array.isArray(payload.implementationPlan) || payload.implementationPlan.length === 0)) {
    return 'planner must return a non-empty implementationPlan.'
  }
  if (name === 'tester') {
    if (typeof payload.approved !== 'boolean') return 'tester must return a boolean approved field.'
    if (!Array.isArray(payload.evidence) || payload.evidence.length === 0) return 'tester must return non-empty evidence.'
  }
  if (name === 'reviewer' && typeof payload.approved !== 'boolean') {
    return 'reviewer must return a boolean approved field.'
  }
  return null
}

const runAgent = async (name, payload) => {
  const config = agents[name]
  if (!config || config.mode === 'internal') {
    return { ok: true, details: `${name} completed using the built-in stage.`, payload: {} }
  }
  if (config.mode !== 'external' || typeof config.provider !== 'string') {
    return { ok: false, details: `${name} requires a configured provider in .harness/agents.json.`, payload: {} }
  }
  const provider = agents.providers?.[config.provider]
  if (!provider || typeof provider.command !== 'string' || !Array.isArray(provider.args)) {
    return { ok: false, details: `${name} provider '${config.provider}' is not configured.`, payload: {} }
  }
  if (policy.allowedAgentCommands?.length && !policy.allowedAgentCommands.includes(provider.command)) {
    return { ok: false, details: `${name} provider command is not in policy.allowedAgentCommands.`, payload: {} }
  }
  const result = await runCommand(provider.command, provider.args, { ...payload, provider: config.provider })
  if (result.code !== 0) {
    return { ok: false, details: result.stderr.trim() || `${name} exited with code ${result.code}.`, payload: {} }
  }
  const response = parseAgentResponse(name, result.stdout)
  if (!response.ok) return response
  const stageError = validateStageResponse(name, response.payload)
  return stageError
    ? { ok: false, details: stageError, payload: response.payload }
    : response
}

const recordPhase = (name, status, details, iteration) => {
  const phase = { name, status, details }
  if (iteration) phase.iteration = iteration
  phases.push(phase)
  return phase
}

writeJson(join(runDirectory, 'input.json'), input)
writeJson(join(runDirectory, 'policy.json'), policy)

recordPhase('planner', 'running', 'Validating task input and preparing an implementation plan.')
const plan = await runAgent('planner', { phase: 'planner', input, implementationPlan })
phases[phases.length - 1] = {
  name: 'planner',
  status: plan.ok ? 'passed' : 'failed',
  details: plan.details,
}
if (plan.payload?.implementationPlan?.length) {
  implementationPlan.splice(0, implementationPlan.length, ...plan.payload.implementationPlan)
}
if (!plan.ok) issues.push(plan.details)

let lastVerification = []
let completed = false

for (let iteration = 1; iteration <= maxIterations && issues.length === 0; iteration += 1) {
  const before = snapshotFiles()
  recordPhase('coder', 'running', 'Applying the approved implementation plan.', iteration)
  const coder = dryRun
    ? { ok: true, details: 'Dry run: coder execution skipped; no product files were changed.', payload: {} }
    : await runAgent('coder', {
        phase: 'coder',
        input,
        implementationPlan,
        iteration,
        previousVerification: lastVerification,
      })
  phases[phases.length - 1] = { name: 'coder', iteration, status: coder.ok ? 'passed' : 'failed', details: coder.details }

  const after = snapshotFiles()
  const changedFiles = new Set([...before.keys(), ...after.keys()])
  for (const file of changedFiles) {
    if (!before.has(file) || !after.has(file) || before.get(file) !== after.get(file)) {
      fileChanges.push({ file, change: `Changed during coder iteration ${iteration}.` })
    }
  }
  if (!coder.ok) {
    issues.push(coder.details)
    break
  }

  recordPhase('tester', 'running', 'Running required verification gates.', iteration)
  const verification = []
  for (const script of policy.requiredChecks) {
    const commandResult = await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script])
    verification.push({
      command: `npm run ${script}`,
      result: commandResult.code === 0 ? 'pass' : 'fail',
      details: commandResult.code === 0 ? 'Command completed successfully.' : commandResult.stderr.trim() || 'Command failed.',
    })
  }
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
    details: testerOk ? 'All required gates passed and tester approved the evidence.' : externalTest.ok
      ? 'At least one required gate failed or tester rejected the evidence.'
      : externalTest.details,
  }
  writeJson(join(runDirectory, `iteration-${iteration}-verification.json`), verification)
  if (!testerOk && iteration === maxIterations) {
    issues.push('Verification did not pass before maxIterations was reached.')
    break
  }
  if (!testerOk) continue

  recordPhase('reviewer', 'running', 'Checking scope, output contract, and acceptance criteria.', iteration)
  const outOfScopeChanges = fileChanges.filter(({ file }) =>
    !policy.allowedProductPaths.some((allowedPath) => file.startsWith(allowedPath)),
  )
  const reviewer = await runAgent('reviewer', {
    phase: 'reviewer',
    input,
    implementationPlan,
    verification,
    fileChanges,
    iteration,
  })
  const reviewerApproved = reviewer.ok
    && reviewer.payload?.approved === true
    && outOfScopeChanges.length === 0
  const reviewerDetails = outOfScopeChanges.length
    ? `Out-of-scope files changed: ${outOfScopeChanges.map(({ file }) => file).join(', ')}`
    : reviewer.details
  phases[phases.length - 1] = {
    name: 'reviewer',
    iteration,
    status: reviewerApproved ? 'passed' : 'failed',
    details: reviewerDetails,
  }
  if (!reviewerApproved) {
    issues.push(reviewerDetails)
    break
  }
  completed = true
  break
}

const result = {
  status: completed ? 'passed' : 'failed',
  summary: completed
    ? `Harness completed ${input.feature.trim()} through Planner, Coder, Tester, and Reviewer.`
    : `Harness could not complete ${input.feature.trim()}.`,
  implementationPlan,
  fileChanges,
  verification: lastVerification.length > 0
    ? lastVerification
    : [{
        command: `harness:${phases.at(-1)?.name ?? 'execution'}`,
        result: completed ? 'pass' : 'fail',
        details: issues[0] ?? 'No verification was recorded.',
      }],
  issues,
  phases,
  iterations: phases.filter((phase) => phase.name === 'coder').length,
  dryRun,
}

if (!validateOutput(result)) {
  emit(fail(`Harness output violates output.schema.json: ${ajv.errorsText(validateOutput.errors)}`, 'output'))
  process.exit(1)
}

emit(result)
process.exit(completed ? 0 : 1)
