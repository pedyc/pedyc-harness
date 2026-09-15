#!/usr/bin/env node

// Deterministic offline Agent Provider used by the compatibility tests. It speaks
// the same stdin/stdout JSON protocol as scripts/harness/claude-adapter.ts, but
// never touches the network so a non-Vue project can run the full four-phase loop
// in CI.

const responses = {
  planner: {
    details: 'Fixture planner accepted the task.',
    implementationPlan: [
      'Inspect the sample project layout.',
      'Apply the requested change under src/.',
      'Run the configured verification gates.',
    ],
  },
  coder: {
    details: 'Fixture coder produced no file changes.',
    changedFiles: [],
  },
  tester: {
    details: 'Fixture tester approved the gates.',
    approved: true,
    evidence: [
      { command: 'configured gates', result: 'pass', details: 'All configured checks passed.' },
    ],
  },
  reviewer: {
    details: 'Fixture reviewer approved the change.',
    approved: true,
  },
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  const request = JSON.parse(raw || '{}')
  const response = responses[request.phase] ?? { details: `Fixture adapter received the '${request.phase}' phase.` }
  process.stdout.write(JSON.stringify(response))
})
