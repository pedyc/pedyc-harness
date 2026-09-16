import { spawn } from 'node:child_process'

/** The outcome of one spawned process. */
export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

// Windows resolves these through .cmd shims, which spawn cannot find by bare name.
const normalizeCommand = (command: string): string => {
  if (
    process.platform === 'win32'
    && ['npm', 'npx', 'pnpm', 'yarn'].includes(command)
    && !command.endsWith('.cmd')
  ) {
    return `${command}.cmd`
  }
  return command
}

/**
 * Runs a command in `root` and resolves with its exit code and output.
 *
 * Failures resolve rather than reject: a non-zero exit is a normal result that
 * the orchestrator records as evidence.
 */
export const runCommand = (
  root: string,
  command: string,
  args: string[] = [],
  stdin: unknown = null,
): Promise<CommandResult> => new Promise((resolve) => {
  const child = spawn(normalizeCommand(command), args, {
    cwd: root,
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }))
  if (stdin !== null) child.stdin.write(`${JSON.stringify(stdin)}\n`)
  child.stdin.end()
})
