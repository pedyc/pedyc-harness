import { spawn } from 'node:child_process'

/** Why a spawned process stopped. */
export type CommandTermination = 'exited' | 'timeout' | 'cancelled'

/** The outcome of one spawned process. */
export interface CommandResult {
  code: number
  stdout: string
  stderr: string
  /**
   * Distinguishes "the command ran and exited" from "the harness stopped it".
   *
   * `code` alone cannot say this: a process the harness killed also reports a
   * non-zero code, which would be indistinguishable from the command's own
   * failure. Termination reasons downstream are derived from this field.
   */
  termination: CommandTermination
}

/** Optional bounds on how long a command may run, and what may stop it. */
export interface CommandOptions {
  /** Aborting kills the child; the call resolves with `cancelled`. */
  signal?: AbortSignal
  /** Exceeding this kills the child; the call resolves with `timeout`. */
  timeoutMs?: number
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
 * the orchestrator records as evidence, and so is a command the harness stopped.
 *
 * Boundary: the harness can only stop what it started. On Windows the child is a
 * shell, so stopping it means stopping the whole tree — otherwise the work
 * survives the kill and holds the output pipes open. A process that detaches
 * itself from that tree can still outlive the stop, which is the same "the
 * harness controls only what it starts" limit recorded in
 * `docs/decisions/ADR-006-run-lifecycle.md` §2.3.
 */
export const runCommand = (
  root: string,
  command: string,
  args: string[] = [],
  stdin: unknown = null,
  options: CommandOptions = {},
): Promise<CommandResult> => new Promise((resolve) => {
  // A cancelled run does not start new work. Refusing before the spawn is what
  // makes that true, rather than killing a process that has already run and had
  // its side effect.
  if (options.signal?.aborted) {
    resolve({ code: 1, stdout: '', stderr: 'Command was cancelled.', termination: 'cancelled' })
    return
  }

  const child = spawn(normalizeCommand(command), args, {
    cwd: root,
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  let termination: CommandTermination = 'exited'
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let backstop: ReturnType<typeof setTimeout> | undefined

  const finish = (code: number): void => {
    if (settled) return
    settled = true
    if (timer !== undefined) clearTimeout(timer)
    if (backstop !== undefined) clearTimeout(backstop)
    options.signal?.removeEventListener('abort', onAbort)
    resolve({ code, stdout, stderr, termination })
  }

  const killTree = (): void => {
    if (process.platform === 'win32' && child.pid !== undefined) {
      // `child.kill` reaches the shell rather than the process the shell
      // started, so the work would keep running and keep the output pipes open —
      // 'close' would then never fire. `/T` kills the tree.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    }
    child.kill()
  }

  const stop = (reason: CommandTermination, note: string): void => {
    // First reason wins: a timeout landing while a cancellation is in flight must
    // not rewrite why the process actually stopped.
    if (termination !== 'exited' || settled) return
    termination = reason
    stderr = stderr.length > 0 ? `${stderr}\n${note}` : note
    killTree()
    // The stop has already been decided, so the result must not wait on stdio
    // that another process may still hold open.
    backstop = setTimeout(() => finish(1), 2000)
  }

  function onAbort (): void {
    stop('cancelled', 'Command was cancelled.')
  }

  if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
    const limit = options.timeoutMs
    timer = setTimeout(() => stop('timeout', `Command exceeded agentTimeoutMs (${limit} ms).`), limit)
  }

  if (options.signal) {
    options.signal.addEventListener('abort', onAbort, { once: true })
  }

  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  // A deliberately stopped process settles on 'exit': waiting for 'close' would
  // mean waiting for every holder of the output pipes, including anything that
  // outlived the kill.
  child.on('exit', () => {
    if (termination !== 'exited') finish(1)
  })
  child.on('close', (code, signal) => {
    // A killed process closes with a null code; only a code from a process that
    // exited on its own is meaningful.
    if (termination === 'exited' && code === null) {
      termination = 'cancelled'
      const note = `Command was killed (${signal ?? 'unknown signal'}).`
      stderr = stderr.length > 0 ? `${stderr}\n${note}` : note
    }
    finish(code ?? 1)
  })
  child.on('error', (error) => {
    stderr = stderr.length > 0 ? `${stderr}\n${error.message}` : error.message
    finish(1)
  })
  if (stdin !== null) child.stdin.write(`${JSON.stringify(stdin)}\n`)
  child.stdin.end()
})
