import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PackageManager {
  name: 'pnpm' | 'yarn' | 'npm'
  command: string
  args: string[]
}

export interface PackageScriptCommand extends PackageManager {
  /** The command as a human would type it, for evidence output. */
  display: string
}

/** Picks the package manager from the lockfile a project committed. */
export const detectPackageManager = (root: string): PackageManager => {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return { name: 'pnpm', command: 'pnpm', args: ['run'] }
  if (existsSync(join(root, 'yarn.lock'))) return { name: 'yarn', command: 'yarn', args: [] }
  return { name: 'npm', command: 'npm', args: ['run'] }
}

/** Builds the invocation that runs one package script in `root`. */
export const packageScriptCommand = (root: string, script: string): PackageScriptCommand => {
  const manager = detectPackageManager(root)
  return {
    ...manager,
    args: [...manager.args, script],
    display: `${manager.command} ${[...manager.args, script].join(' ')}`,
  }
}
