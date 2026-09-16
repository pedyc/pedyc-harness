import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** File contents keyed by repository-relative POSIX path. */
export type FileSnapshot = Map<string, string>

// Build output and installed dependencies are never part of a product change.
const ignoredAtRoot = ['node_modules', 'dist', '.git']

const listFiles = (root: string, directory: string = root, result: string[] = []): string[] => {
  if (!existsSync(directory)) return result
  for (const entry of readdirSync(directory)) {
    if (directory === root && ignoredAtRoot.includes(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) listFiles(root, path, result)
    else result.push(relative(root, path).replaceAll('\\', '/'))
  }
  return result
}

/** Captures every product file's contents so a later snapshot can be compared. */
export const snapshotFiles = (root: string): FileSnapshot =>
  new Map(listFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8')]))

/** Names the files that were added, removed or modified between two snapshots. */
export const changedFiles = (before: FileSnapshot, after: FileSnapshot): string[] =>
  [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => !before.has(file) || !after.has(file) || before.get(file) !== after.get(file))
