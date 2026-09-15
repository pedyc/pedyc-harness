import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('harness contracts', () => {
  it('keeps the policy gates mapped to npm scripts', () => {
    const policy = JSON.parse(readFileSync(resolve(root, '.harness/policy.json'), 'utf8')) as {
      requiredChecks: string[]
    }
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    for (const check of policy.requiredChecks) {
      expect(packageJson.scripts[check]).toBeTypeOf('string')
    }
  })

  it('keeps product code outside the harness directories', () => {
    const instructions = readFileSync(resolve(root, 'AGENTS.md'), 'utf8')
    expect(instructions).toContain('`packages/` contains the Harness runtime, CLI, and preset product code.')
    expect(instructions).toContain('`.harness/` contains machine-readable contracts')
  })

  it('routes external agents through configured providers', () => {
    const agents = JSON.parse(readFileSync(resolve(root, '.harness/agents.json'), 'utf8')) as {
      providers: Record<string, { command: string; args: string[] }>
      coder: { provider: string }
    }

    expect(agents.providers[agents.coder.provider].command).toBe('node')
    expect(agents.providers[agents.coder.provider].args).toContain('scripts/dist/claude-adapter.js')
  })

  it('keeps the human task intake contract available', () => {
    const taskSchema = JSON.parse(readFileSync(resolve(root, '.harness/task.schema.json'), 'utf8')) as {
      required: string[]
    }

    expect(taskSchema.required).toEqual(['task', 'goal', 'acceptance'])
  })
})
