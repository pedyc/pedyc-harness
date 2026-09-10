---
name: review-change
description: Review a completed Vue product change for correctness, scope, accessibility, and verification evidence.
---

# Reviewing a change

Review the diff against the acceptance criteria and `.harness/evaluation.json`.
Report high-confidence defects first:

- incorrect runtime behavior or missing states;
- invalid or unsafe props;
- accessibility regressions;
- changes outside the product boundary;
- missing verification evidence.

If no defect is found, state that clearly and list the checks that passed.
