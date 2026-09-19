#!/usr/bin/env node
// Documentation conventions for the docs site (`docs/CONVENTIONS.md`).
//
// Two checks live in the site rather than in `scripts/`:
//
//   1. this script — the rules VitePress cannot express: heading structure,
//      filenames, empty link targets, navigation completeness, and link
//      integrity *from live documents*;
//   2. `vitepress build` — site-wide route and anchor integrity. VitePress fails
//      the build on a dead link, so that is the second half of the gate.
//
// `docs/archived/` is never a source of checks: it holds superseded designs kept
// for traceability, and holding them to the current conventions would produce
// noise with no maintenance payoff. Archived files stay valid link *targets*, so
// a live document pointing at a deleted archive entry is still fatal — that is
// the one guarantee worth keeping.
//
// Convention findings are reported, not fatal: the existing documents predate
// the conventions. Pass `--strict` to make them fail as well, so the policy can
// be tightened without touching this script.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const strict = process.argv.includes('--strict')
const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const indexFile = join(docsRoot, 'README.md')

// The VitePress home page is frontmatter-driven and carries no H1 by design.
const homePage = 'index.md'

const linkPattern = /\]\(([^)\s]+)\)/g
const fencePattern = /^\s*```/
const headingPattern = /^(#{1,6})\s+\S/

const rel = (file) => relative(docsRoot, file).split('\\').join('/')
const isArchived = (file) => rel(file).startsWith('archived/')

const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.vitepress') return []
      return walk(full)
    }
    return extname(entry.name) === '.md' ? [full] : []
  })
}

const collectLinks = (file, text) => {
  const links = []
  let inFence = false
  text.split('\n').forEach((line, index) => {
    if (fencePattern.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    for (const match of line.matchAll(linkPattern)) {
      const target = match[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      links.push({ file, line: index + 1, target })
    }
  })
  return links
}

const targetPathOf = (link) => {
  const withoutAnchor = link.target.split('#')[0]
  if (!withoutAnchor) return null
  let decoded = withoutAnchor
  try {
    decoded = decodeURIComponent(withoutAnchor)
  } catch {
    // A malformed escape resolves to nothing; the caller reports it as broken.
  }
  return resolve(dirname(link.file), decoded)
}

const main = () => {
  if (!existsSync(docsRoot)) {
    console.error(`No docs directory at ${docsRoot}`)
    process.exitCode = 1
    return
  }

  const all = walk(docsRoot).sort()
  const sources = all.filter((file) => !isArchived(file))
  const archived = all.filter(isArchived)

  const warnings = []
  const broken = []

  for (const file of sources) {
    const name = rel(file)
    if (basename(file).includes(' ')) {
      warnings.push(`${name}: filename contains a space`)
    }

    const text = readFileSync(file, 'utf8')
    if (name !== homePage) {
      let inFence = false
      let h1 = 0
      let previousLevel = 0
      let lineNumber = 0
      for (const line of text.split('\n')) {
        lineNumber += 1
        if (fencePattern.test(line)) {
          inFence = !inFence
          continue
        }
        if (inFence) continue
        const level = headingPattern.exec(line)?.[1]?.length ?? 0
        if (level === 0) continue
        if (level === 1) h1 += 1
        // A section may not skip a level: an H1 followed directly by an H3
        // leaves that heading with no parent, which breaks the outline and the
        // generated sidebar.
        if (previousLevel > 0 && level > previousLevel + 1) {
          warnings.push(`${name}: heading level jumps H${previousLevel} -> H${level} (line ${lineNumber})`)
        }
        previousLevel = level
      }
      if (h1 === 0) warnings.push(`${name}: no H1 heading`)
      else if (h1 > 1) warnings.push(`${name}: ${h1} H1 headings (expected 1)`)
    }

    for (const link of collectLinks(file, text)) {
      const path = targetPathOf(link)
      if (path === null || !existsSync(path)) {
        broken.push(`${name}:${link.line} -> ${link.target}`)
      } else if (statSync(path).isFile() && statSync(path).size === 0) {
        warnings.push(`${name}: links to an empty file: ${link.target} (line ${link.line})`)
      }
    }
  }

  // Navigation completeness: direct links only, and not for the home page or
  // archived documents.
  // Navigation completeness is transitive: `docs/README.md` links a directory's
  // README, and that README indexes the directory's own members. Without the
  // recursion every document in a subdirectory would have to be listed at the top
  // level, which turns the map into a list and defeats the point of a directory.
  const indexed = new Set()
  const pendingIndexes = [indexFile]
  const scannedIndexes = new Set()
  while (pendingIndexes.length > 0) {
    const from = pendingIndexes.pop()
    if (scannedIndexes.has(resolve(from))) continue
    scannedIndexes.add(resolve(from))
    const links = collectLinks(from, existsSync(from) ? readFileSync(from, 'utf8') : [])
      .map(targetPathOf)
      .filter((value) => value !== null)
      .map((value) => resolve(value))
    for (const link of links) {
      indexed.add(link)
      if (basename(link) === 'README.md') pendingIndexes.push(link)
    }
  }
  for (const file of sources) {
    if (rel(file) === homePage || resolve(file) === resolve(indexFile)) continue
    if (!indexed.has(resolve(file))) warnings.push(`${rel(file)}: not reachable from docs/README.md`)
  }

  for (const entry of broken) console.log(`broken  ${entry}`)
  if (warnings.length > 0 && broken.length > 0) console.log('')
  for (const entry of warnings) console.log(`warn    ${entry}`)

  console.log('')
  console.log(`${sources.length} live documents, ${broken.length} broken link(s).`)
  console.log(`docs/archived/ is not checked (non-normative): ${archived.length} documents ignored.`)
  if (warnings.length > 0) console.log(`${warnings.length} convention warning(s) — see docs/CONVENTIONS.md.`)

  if (broken.length > 0) {
    console.error('\nA relative link in a live document must resolve from the file that contains it.')
    process.exitCode = 1
    return
  }
  if (strict && warnings.length > 0) {
    console.error('\n--strict: convention warnings are treated as failures.')
    process.exitCode = 1
    return
  }
  console.log('Live-document links and conventions verified.')
}

main()
