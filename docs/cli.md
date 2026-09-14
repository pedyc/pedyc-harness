# CLI 使用与生成规则

CLI 是 [项目目标](./项目目标.md) 中的工具链入口：npm 包提供稳定的运行时和模板，CLI 把
适配当前项目的配置、脚本和提示词生成到目标项目中。

## 命令

已实现：

```bash
npx pedyc-harness init --preset generic
npx pedyc-harness init --preset vue
npx pedyc-harness verify
npx pedyc-harness doctor
npx pedyc-harness diff --preset generic
npx pedyc-harness update --preset generic
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

`run` 也可以从任意目录调用，CLI 会把当前目录作为目标项目 root；底层脚本支持显式的
`--root <path>`。

规划中：

- `list-presets`：列出可用 Preset，避免让用户记忆 Preset 名称。

## 初始化行为

`init` 创建 `.harness/policy.json`、`.harness/agents.json`、JSON Schema 和 `AGENTS.md`。
按 [项目目标](./项目目标.md) 第七节的原则，初始化必须可以安全地重复执行：已有 JSON 配置
不会被无条件合并或覆盖；已有 `AGENTS.md` 也只有在传入 `--force` 时才覆盖。

`--force` 会重新生成 Preset 管理的配置和入口说明，适合显式升级模板：

```bash
npx pedyc-harness init --preset vue --force
```

`diff` 比较当前项目与 Preset 的受管模板文件，输出 `missing`、`unchanged` 或 `modified`
状态，不会修改文件。`update` 只补充缺失文件，并默认跳过已经修改的文件；传入 `--force`
才会覆盖已修改的模板。

## 发布建议

建议将 CLI 作为项目的开发依赖：

```bash
npm install --save-dev pedyc-harness
pnpm add --save-dev pedyc-harness
```

CLI 负责生成项目级配置，Runtime 负责执行。配置和提示词进入项目版本库后，Harness 升级可以
通过 `init`、`diff` 或 `update` 显式完成，而不是隐式改变 CI 行为。

## 包管理器兼容

Harness 仓库使用 `packageManager` 字段固定 pnpm 版本，并在 CI 中使用
`pnpm install --frozen-lockfile`。目标项目不要求使用 pnpm：Runtime 会优先检测
`pnpm-lock.yaml`，其次检测 `yarn.lock`，否则使用 npm 执行 `requiredChecks`。
`doctor` 会显示检测到的包管理器，便于确认项目接入环境。

## 非 npm 项目

Runtime 本身是 Node.js ESM 脚本。Python、Go 等项目可以使用 `npx` 或直接调用 CLI，
只需在 `.harness/policy.json` 中配置自己的验证命令和产品路径。
