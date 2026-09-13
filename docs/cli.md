# CLI 使用与生成规则

## 命令

```bash
npx pedyc-harness init --preset generic
npx pedyc-harness init --preset vue
npx pedyc-harness verify
npx pedyc-harness doctor
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

`run` 也可以从任意目录调用，Runtime 会把当前目录作为目标项目 root；底层脚本支持
显式的 `--root <path>`。

## 初始化行为

`init` 创建 `.harness/policy.json`、`.harness/agents.json`、JSON Schema 和
`AGENTS.md`。已有 JSON 配置不会被无条件合并或覆盖；已有 `AGENTS.md` 也只有在
传入 `--force` 时才覆盖。这样初始化可以安全地重复执行。

## 发布建议

建议将 CLI 作为项目的开发依赖：

```bash
npm install --save-dev pedyc-harness
pnpm add --save-dev pedyc-harness
```

CLI 负责生成项目级配置，Runtime 负责执行。配置和提示词进入项目版本库后，Harness
升级可以通过 `init`、模板 diff 或后续 `update` 命令显式完成，而不是隐式改变 CI 行为。

## 包管理器兼容

Harness 仓库使用 `packageManager` 字段固定 pnpm 版本，并在 CI 中使用
`pnpm install --frozen-lockfile`。目标项目不要求使用 pnpm：Runtime 会优先检测
`pnpm-lock.yaml`，其次检测 `yarn.lock`，否则使用 npm 执行 `requiredChecks`。

## 非 npm 项目

Runtime 本身是 Node.js ESM 脚本。Python、Go 等项目可以使用 `npx` 或直接调用 CLI，
只需在 `.harness/policy.json` 中配置自己的验证命令和产品路径。
