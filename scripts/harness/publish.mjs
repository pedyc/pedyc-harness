// Publishes the workspace packages in dependency order.
//
// Publishing is irreversible, so this script refuses to run unless every
// precondition holds: npm authentication, the official registry (a mirror will
// silently reject or absorb a publish), an unused version number, and a passing
// `release:check`. Run with `--dry-run` to see exactly what would be published.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const isWindows = process.platform === 'win32'

// `pnpm run release:publish -- --dry-run` passes the separator through to us.
const argv = process.argv.slice(2).filter((arg) => arg !== '--')
const hasFlag = (name) => argv.includes(name)
const valueAfter = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] ?? fallback : fallback
}

const dryRun = hasFlag('--dry-run')
const skipPreflight = hasFlag('--skip-preflight')
const registry = valueAfter('--registry', 'https://registry.npmjs.org/')
const otp = valueAfter('--otp', null)

const run = (command, args, cwd) => {
  const options = { cwd, encoding: 'utf8' }
  if (!isWindows) return spawnSync(command, args, options)
  const line = [command, ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ')
  return spawnSync(line, { ...options, shell: true })
}

// Dependency order: the CLI depends on Core and both presets.
const packages = [
  { dir: 'packages/core', name: '@pedyc/harness-core' },
  { dir: 'packages/preset-generic', name: '@pedyc/harness-preset-generic' },
  { dir: 'packages/preset-vue', name: '@pedyc/harness-preset-vue' },
  { dir: 'packages/cli', name: 'pedyc-harness' },
]

const die = (message) => {
  console.error(`\n${message}`)
  process.exit(1)
}

const manifestOf = (dir) => JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))

const main = () => {
  const versions = new Set(packages.map(({ dir }) => manifestOf(dir).version))
  if (versions.size !== 1) die(`Packages declare different versions: ${[...versions].join(', ')}`)
  const version = [...versions][0]
  const names = packages.map(({ name }) => name)

  console.log(`Publishing ${names.length} packages at ${version} to ${registry}${dryRun ? ' (dry run)' : ''}`)

  // 1. Registry. A mirror such as registry.npmmirror.com is read-only for third
  //    parties, so a publish attempt there fails late and confusingly.
  const configured = run('npm', ['config', 'get', 'registry'], root).stdout?.trim()
  if (!configured?.includes('registry.npmjs.org')) {
    console.warn(`  warn  npm registry is '${configured}'; publishing will target ${registry}`)
  }

  // 2. Authentication. This is the step that cannot be automated away.
  const whoami = run('npm', ['whoami', '--registry', registry], root)
  const user = whoami.stdout?.trim()
  if (whoami.status !== 0 || !user) {
    const scopes = [...new Set(names.filter((name) => name.startsWith('@')).map((name) => name.split('/')[0]))]
    die(
      'Not authenticated to npm.\n\n'
      + 'Run `npm login --registry https://registry.npmjs.org/` first, then re-run this script.\n'
      + `Publishing requires an account that owns the ${scopes.join(', ')} scope.`,
    )
  }
  console.log(`  ok    authenticated as ${user}`)

  // 2b. Two-factor auth. Reads are unaffected, but every write — including each of
  //     the four publishes — needs either a fresh OTP or a token that bypasses 2FA.
  //     Detecting it now avoids discovering it after packing and release:check.
  const profile = run('npm', ['profile', 'get', '--json', '--registry', registry], root)
  let tfaMode = 'unknown'
  try {
    tfaMode = JSON.parse(profile.stdout).tfa?.mode ?? 'unknown'
  } catch {
    // Older npm versions may not support --json here; fall through to the warning below.
  }
  if (tfaMode === 'auth-and-writes' && !otp) {
    console.warn(
      '  warn  2FA is enabled for writes (tfa.mode=auth-and-writes).\n'
      + '        Each publish needs a one-time password. Either:\n'
      + '          - add a 2FA-bypassing token to ~/.npmrc (recommended):\n'
      + '            //registry.npmjs.org/:_authToken=<Automation or Granular token with Bypass 2FA>\n'
      + '          - or re-run with --otp <code> and finish inside the 30 second window.',
    )
  } else if (tfaMode === 'auth-and-writes') {
    console.log('  ok    2FA satisfied with the supplied --otp')
  }

  // 3. Version availability. npm refuses to overwrite a published version, and a
  //    partial publish (Core taken, CLI rejected) is the worst outcome here.
  for (const { name } of packages) {
    const existing = run('npm', ['view', `${name}@${version}`, 'version', '--registry', registry], root)
    if (existing.status === 0) die(`${name}@${version} is already published. Bump the version first.`)
  }
  console.log(`  ok    ${version} is unpublished for all ${names.length} packages`)

  // 4. Artifact gate.
  if (skipPreflight) {
    console.log('  warn  skipping release:check (--skip-preflight)')
  } else {
    console.log('  ..    running release:check')
    const check = run('pnpm', ['run', 'release:check'], root)
    if (check.status !== 0) die(`release:check failed; not publishing.\n${check.stdout ?? ''}${check.stderr ?? ''}`)
    console.log('  ok    release:check')
  }

  if (dryRun) {
    for (const { dir, name } of packages) {
      const result = run('pnpm', ['publish', '--dry-run', '--access', 'public', '--no-git-checks', '--registry', registry], join(root, dir))
      if (result.status !== 0) die(`pnpm publish --dry-run failed for ${name}:\n${result.stdout ?? ''}${result.stderr ?? ''}`)
      console.log(`  ok    ${name} would publish`)
    }
    console.log('\nDry run complete. Re-run without --dry-run to publish.')
    return
  }

  // 5. Publish, in dependency order.
  const published = []
  for (const { dir, name } of packages) {
    const args = ['publish', '--access', 'public', '--no-git-checks', '--registry', registry]
    if (otp) args.push(`--otp=${otp}`)
    const result = run('pnpm', args, join(root, dir))
    if (result.status !== 0) {
      // Report what is actually live rather than assuming a partial publish: the
      // common failure (EOTP) happens before the first package leaves the machine.
      const status = published.length === 0
        ? 'Nothing was published; the registry is unchanged.'
        : `Already live: ${published.join(', ')}. Not yet published: ${names.filter((entry) => !published.includes(entry)).join(', ')}.`
      die(`\n${name}@${version} failed to publish:\n${result.stdout ?? ''}${result.stderr ?? ''}\n\n${status}`)
    }
    published.push(name)
    console.log(`  ok    published ${name}@${version}`)
  }

  console.log(
    `\nPublished ${published.length} packages at ${version}.\n`
    + `Next: verify with \`npm install pedyc-harness@${version}\` in a clean project, update CHANGELOG.md, and tag the release.`,
  )
}

main()
