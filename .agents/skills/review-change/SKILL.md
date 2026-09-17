---
name: review-change
description: Review a completed harness change for correctness, scope, contract compliance, and verification evidence.
---

# Reviewing a change

Review the diff against the acceptance criteria and `.harness/evaluation.json`.
Report high-confidence defects first:

- incorrect runtime behavior or missing states;
- type or runtime errors;
- contract drift between TypeScript types, the JSON Schemas, and the published
  package entry points;
- unsafe input handling or command construction;
- changes outside the product boundary;
- execution capability leaking into Core (agent loop, tool orchestration, memory,
  scheduling, session state) — apply the boundary test in `docs/项目目标.md`:
  does the change make the agent more capable, or the execution more governable?
- missing verification evidence.

If no defect is found, state that clearly and list the checks that passed.
