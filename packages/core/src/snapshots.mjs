import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const listFiles = (root, directory = root, result = []) => {
  if (!existsSync(directory)) return result
  for (const entry of readdirSync(directory)) {
    if (directory === root && ['node_modules', 'dist', '.git'].includes(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) listFiles(root, path, result)
    else result.push(relative(root, path).replaceAll('\\', '/'))
  }
  return result
}

export const snapshotFiles = (root) => new Map(
  listFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8')]),
)

export const changedFiles = (before, after) => [...new Set([...before.keys(), ...after.keys()])]
  .filter((file) => !before.has(file) || !after.has(file) || before.get(file) !== after.get(file))
