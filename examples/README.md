# 外部项目样例

这些最小项目用于验证 Harness 不依赖当前仓库的 Vue 目录结构。它们都是普通项目，通过
`init` 生成的 `.harness/`、`AGENTS.md` 接入 Harness，并各自使用不同的包管理器锁文件来
覆盖锁文件识别。

| 样例 | Preset | 锁文件 | 检测到的包管理器 |
| --- | --- | --- | --- |
| `generic-project` | `generic` | `pnpm-lock.yaml` | pnpm |
| `vue-project` | `vue` | `yarn.lock` | yarn |
| `node-project` | `generic` | `package-lock.json` | npm |

## 验收命令

在每个样例目录中执行：

```bash
pnpm exec pedyc-harness init
pnpm exec pedyc-harness verify
pnpm exec pedyc-harness run --dry-run --json
pnpm exec pedyc-harness doctor
```

`init` 是幂等的：样例中已经提交了生成的 `.harness/` 配置和 `AGENTS.md`，重复执行不会
覆盖。`verify` 校验配置和 Schema。`run --dry-run --json` 返回结构化结果，不调用任何
Agent Provider，也不执行验证命令。`doctor` 显示检测到的包管理器。

在仓库根目录执行 `pnpm run verify:examples` 会依次对三个样例运行上述命令并检查退出码和
输出。

## Provider

样例默认不配置 Provider，因此只运行 `verify`、`doctor` 和 `run --dry-run`。真实执行
`run`（非 dry-run）前，需要在对应项目的 `.harness/agents.json` 中配置 Provider，例如：

```json
{
  "providers": {
    "custom": { "command": "node", "args": ["scripts/harness/echo-adapter.mjs"] }
  }
}
```

`vue-project` 提交的 `.harness/agents.json` 使用空 `providers`，而不是 `init --preset vue`
生成的 `scripts/dist/claude-adapter.js`。后者是本仓库内部的 Claude Code 适配器，
外部项目需要替换成自己的适配器，样例因此显式覆盖为未配置状态。

## 限制

- 样例只提交配置和最小源码，不安装依赖；`run --dry-run` 不需要依赖即可运行。
- `vue-project` 的 `requiredChecks` 指向类型检查、测试和构建，真实执行前需要先安装依赖。
