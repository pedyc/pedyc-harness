# Provider 设计

## 角色与 Provider 的区别

角色描述阶段责任：

- Planner：把任务转为可执行计划。
- Coder：根据计划修改产品文件。
- Tester：独立执行验证命令并返回证据。
- Reviewer：检查范围、契约和验收标准。

Provider 描述如何调用 Agent。一个 Provider 可以服务多个角色，角色配置只保存
`mode` 和 `provider` 路由。这是 [项目目标](./项目目标.md) 第二节设计原则 8「Provider 可插拔，
但 Provider 不是核心」的落地：Adapter 的成功标准是换成别的 Agent 不用改 Harness，
而不是支持尽可能多的 Agent。

```json
{
  "providers": {
    "claude": {
      "command": "node",
      "args": ["scripts/harness/claude-adapter.mjs"]
    }
  },
  "planner": { "mode": "external", "provider": "claude" },
  "coder": { "mode": "external", "provider": "claude" }
}
```

上面的 `claude` Provider 是仓库自带的本地示例。所有 Preset 生成的 `agents.json` 默认
`providers` 为空，Planner 使用内置实现，Coder、Tester、Reviewer 指向尚未配置的
`custom`：`verify` 和 `run --dry-run` 无需 Provider 即可运行，非 dry-run 运行会以
「provider 'custom' is not configured」结构化失败，直到项目显式配置自己的 Adapter。
发布包因此不携带任何供应商假设。

## Adapter 协议

Adapter 从 stdin 接收一个 JSON 请求，只向 stdout 输出一个 JSON 响应；诊断信息写入
stderr。响应必须满足 `.harness/agent-response.schema.json`，Planner、Tester 和
Reviewer 还要满足阶段专用字段校验。这样 Runtime 不需要理解某个 Agent 的 SDK。

## Provider 安全要求

1. 不在 npm 包中假设用户已经安装或登录某个 CLI。
2. Provider 命令和参数必须来自项目配置，不接受任务文本拼接成 shell 命令。
3. Adapter 只应在项目 root 内工作，并遵守产品路径白名单。
4. 失败必须通过非零退出码或结构化失败响应显式返回。
5. 需要人工审批的 Provider 应在后续版本中通过策略节点建模，而不是绕过 Reviewer。

## 环境检查

`pedyc-harness doctor` 用于在运行前检查接入环境，当前报告项目 root、`.harness/` 是否存在、
检测到的包管理器（npm/pnpm/yarn）和 Node.js 版本。[项目目标](./项目目标.md) 第八节列出的
更完整检查项（Provider 命令是否存在、必须的 npm scripts 是否存在、目标目录是否可写、
Git 工作区是否干净）仍在规划中。

## 内置 Provider 类型

当前只有 `command` 类型，即调用本地可执行命令；仓库内的
`scripts/harness/claude-adapter.mjs` 是这种类型的可选示例，不随 npm 包发布。
[项目目标](./项目目标.md) 第八节列出的 `claude-cli`、`copilot-cli`、`openai-api`、
`anthropic-api`、`custom-command` 属于规划方向。接入时应保持同一 stdin/stdout 契约，
避免 Runtime 与某家供应商 SDK 耦合。
