# GitHub configuration instructions

These rules apply when changing `.github/`.

## Agent configuration

- Keep agent roles focused and composable.
- Every agent definition must include YAML frontmatter with `name`,
  `description`, and `tools`.
- Agent instructions must point to an executable verification command.
- Do not put product implementation code in `.github/`.

## Workflow security

- Use `pull_request` unless `pull_request_target` is required and reviewed.
- Give jobs the minimum required permissions.
- Pin third-party actions to a full commit SHA before production use.
- Never interpolate untrusted issue or pull-request text into shell commands.
- Do not expose secrets in logs or generated artifacts.
