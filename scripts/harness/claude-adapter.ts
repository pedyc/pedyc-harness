import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const chunks: string[] = []

const parseJsonResult = (value: string): unknown => {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(normalized)
  } catch {
    const start = normalized.indexOf('{')
    const end = normalized.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('Claude result did not contain a JSON object.')
    return JSON.parse(normalized.slice(start, end + 1))
  }
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => chunks.push(chunk))
process.stdin.on('end', () => {
  let request: { phase?: string } | undefined

  try {
    request = JSON.parse(chunks.join(''))
  } catch (error) {
    process.stderr.write(`Adapter input is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}\n`)
    process.exit(1)
  }

  const phase = request?.phase ?? 'coder'
  const policy = JSON.parse(readFileSync(resolve(root, '.harness/policy.json'), 'utf8'))
  // Derive the product boundary from the policy instead of hardcoding a stack:
  // the adapter is copied into projects whose layout differs from this one.
  const allowedPaths = Array.isArray(policy.allowedProductPaths) && policy.allowedProductPaths.length > 0
    ? policy.allowedProductPaths.join(', ')
    : 'the configured product paths'
  const prompt = [
    `You are the ${phase} agent in a TypeScript repository harness.`,
    'Work only on the current task and return exactly one JSON object as your final answer.',
    'Do not include Markdown fences or extra text outside the JSON object.',
    `Task payload:\n${JSON.stringify(request, null, 2)}`,
    phase === 'coder'
      ? `Implement the requested product change. Only modify files under ${allowedPaths}. Run the required checks when useful. Return details, changedFiles, and any issues.`
      : phase === 'planner'
        ? 'Analyze the task without editing files. Return implementationPlan as a non-empty string array and include concrete files, acceptance evidence, and risks in details. The JSON shape must be {"implementationPlan":["step"],"details":"..."}.'
        : phase === 'tester'
          ? 'Do not modify files and do not trust coder claims. Judge only the verification array supplied by the Harness. Return JSON shaped like {"approved":true,"evidence":[{"command":"pnpm run type-check","result":"pass","details":"..."}],"issues":[]}. Each evidence item must be an object with exactly command, result, and details. Copy the actual verification entries; never use strings in evidence.'
          : 'Do not modify files. Review the task, verification evidence, and file changes. Return JSON shaped like {"approved":true,"evidence":[{"command":"pnpm run type-check","result":"pass","details":"..."}],"issues":[],"details":"..."}. Each evidence item must be an object with exactly command, result, and details. Approve only when the change is correct, all checks pass, and scope is valid.',
  ].join('\n\n')

  const command = process.platform === 'win32' ? 'claude.cmd' : 'claude'
  const commandArgs = [
    '--print',
    '--output-format',
    'json',
    '--permission-mode',
    phase === 'coder' ? 'acceptEdits' : 'plan',
    '--allowed-tools',
    phase === 'coder' ? 'Read,Edit,Bash(pnpm run type-check),Bash(pnpm run test:unit),Bash(pnpm run build)' : 'Read',
    '--disallowed-tools',
    'WebFetch,WebSearch',
    '--add-dir',
    root,
  ]

  const child = spawn(command, commandArgs, {
    cwd: root,
    windowsHide: true,
    shell: process.platform === 'win32',
  })
  let stdout = ''
  let stderr = ''
  const timeoutMs = Number(policy.agentTimeoutMs ?? 300000)
  const timer = setTimeout(() => {
    child.kill()
    process.stderr.write(`Claude adapter timed out after ${timeoutMs}ms.\n`)
  }, timeoutMs)

  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdin.write(prompt)
  child.stdin.end()
  child.on('error', (error) => {
    clearTimeout(timer)
    process.stderr.write(`Claude adapter failed to start: ${error.message}\n`)
    process.exit(1)
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    if (code !== 0) {
      process.stderr.write(stderr.trim() || `Claude exited with code ${code}.\n`)
      process.exit(code ?? 1)
    }

    try {
      const envelope = JSON.parse(stdout.trim())
      const result = typeof envelope.result === 'string'
        ? parseJsonResult(envelope.result)
        : envelope.result ?? envelope
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } catch (error) {
      process.stderr.write(`Claude returned an invalid structured response: ${error instanceof Error ? error.message : 'unknown error'}\n`)
      process.exit(1)
    }
  })
})
