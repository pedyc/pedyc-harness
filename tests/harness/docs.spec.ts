import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const read = (relativePath: string) => readFileSync(join(repoRoot, relativePath), 'utf8')
const readJson = (relativePath: string) => JSON.parse(read(relativePath))
const exists = (relativePath: string) => existsSync(join(repoRoot, relativePath))

// The documentation checks live in the docs site, not in `scripts/`. This test
// guards only the wiring: that the harness still exposes one entry point, that
// CI still calls it, and that the site stays out of the build/release pipeline.
describe('documentation site wiring', () => {
  it('delegates the docs gate to the documentation site', () => {
    const scripts = readJson('package.json').scripts
    expect(scripts['docs:check']).toBe('pnpm --dir docs run check')
    expect(read('.github/workflows/harness-verify.yml')).toContain('pnpm run docs:check')

    // The harness-side checker is gone: checks belong to the site package.
    expect(exists('scripts/harness/docs-check.ts')).toBe(false)
    expect(exists('docs/scripts/check-conventions.mjs')).toBe(true)
  })

  it('keeps the site private and outside the build and release pipeline', () => {
    const docs = readJson('docs/package.json')
    expect(docs.private).toBe(true)
    expect(docs.devDependencies.vitepress).toBeTruthy()

    // `check` must cover both halves of the gate: the conventions script and the
    // VitePress build, which fails on dead site links.
    expect(docs.scripts.check).toContain('docs:conventions')
    expect(docs.scripts.check).toContain('docs:build')

    // No plain `build` script: `pnpm -r run build` and the release pipeline
    // iterate workspace packages, and the site must not join them.
    expect(docs.scripts.build).toBeUndefined()

    expect(exists('docs/.vitepress/config.mts')).toBe(true)
    expect(read('docs/.vitepress/config.mts')).toContain('ignoreDeadLinks')
  })
})
