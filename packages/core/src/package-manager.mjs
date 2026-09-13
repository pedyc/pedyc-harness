import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const detectPackageManager = (root) => {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return { name: 'pnpm', command: 'pnpm', args: ['run'] }
  if (existsSync(join(root, 'yarn.lock'))) return { name: 'yarn', command: 'yarn', args: [] }
  return { name: 'npm', command: 'npm', args: ['run'] }
}

export const packageScriptCommand = (root, script) => {
  const manager = detectPackageManager(root)
  return {
    ...manager,
    args: [...manager.args, script],
    display: `${manager.command} ${[...manager.args, script].join(' ')}`,
  }
}
