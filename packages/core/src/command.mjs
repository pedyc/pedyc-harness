import { spawn } from 'node:child_process'

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

export const runCommand = (root, command, args = [], stdin = null) => new Promise((resolve) => {
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
