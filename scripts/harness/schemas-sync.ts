// Keep every copy of the JSON contracts byte-identical.
//
// `schemas/` is the single source of truth. The repository contract directory,
// the CLI template directory and each example project carry copies because a
// generated project must be able to validate itself without reaching back into
// this repository. Those copies are derived, so they must never be edited by
// hand.
//
// Usage:
//   node scripts/harness/schemas-sync.ts          # rewrite the copies
//   node scripts/harness/schemas-sync.ts --check  # fail if any copy differs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const exampleProjects = readdirSync(join(root, 'examples'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `examples/${entry.name}`)

// A destination containing `*` is expanded over the example projects.
const destinations = (pattern: string): string[] => pattern.startsWith('examples/*')
  ? exampleProjects.map((project) => pattern.replace('examples/*', project))
  : [pattern]

// Each contract lists every location that must hold an identical copy.
const contracts: Array<[string, string[]]> = [
  ['input.schema.json', ['.harness', 'packages/cli/templates', 'examples/*/.harness']],
  ['output.schema.json', ['.harness', 'packages/cli/templates', 'examples/*/.harness']],
  ['agent-response.schema.json', ['.harness', 'packages/cli/templates', 'examples/*/.harness']],
  // The manifest schema is the one copy a project never gets to choose: the
  // runtime validates `harness.json` against the copy bundled with the core
  // package, so a project cannot loosen the rules its own manifest is held to.
  // The copies listed here are for editors and for drift detection.
  ['harness.schema.json', ['.harness', 'packages/cli/templates', 'packages/core/schemas', 'examples/*/.harness']],
  // A preset manifest is read out of an installed package and a project never
  // holds one, so the only copy that has to exist is the one the runtime
  // validates against. Projects get no copy to drift from.
  ['preset.schema.json', ['packages/core/schemas']],
  // The human intake contract is only used by this repository's own harness run.
  ['task.schema.json', ['.harness']],
  ['task.example.json', ['.harness', 'packages/cli/templates', 'examples/*/.harness']],
]

const checkOnly = process.argv.includes('--check')
const drifted: string[] = []
let written = 0

for (const [file, patterns] of contracts) {
  const source = readFileSync(join(root, 'schemas', file), 'utf8')

  for (const pattern of patterns) {
    for (const destination of destinations(pattern)) {
      const target = join(root, destination, file)
      let current: string | null = null
      try {
        current = readFileSync(target, 'utf8')
      } catch {
        // A missing copy is drift too: the destination is declared, not optional.
      }
      if (current === source) continue

      if (checkOnly) {
        drifted.push(`${destination}/${file}`)
        continue
      }

      writeFileSync(target, source, 'utf8')
      written += 1
    }
  }
}

if (checkOnly) {
  if (drifted.length > 0) {
    console.error(`Schema copies differ from schemas/:\n  ${drifted.join('\n  ')}`)
    console.error('Run `pnpm run schemas:sync` to regenerate them.')
    process.exit(1)
  }
  console.log(`Schema copies verified: ${contracts.length} contract(s) match schemas/.`)
} else {
  console.log(`Schema copies synchronized: ${written} file(s) updated from schemas/.`)
}
