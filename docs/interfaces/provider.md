# Provider 契约

> Harness 如何调用一个外部 Agent。这是 Harness 与 Coding Agent 之间唯一的协议面。
>
> 来源:`packages/core/src/contracts/agent.ts`、`packages/core/src/adapters/provider-runner.ts`。

## 1. 配置类型

`.harness/agents.json` 的形状:

```ts
interface ProviderConfig {
  command: string
  args: string[]
}

interface AgentRoleConfig {
  mode: AgentMode          // 'internal' | 'external'
  provider?: string        // 仅 external 有意义
}

interface AgentsConfig {
  providers?: Record<string, ProviderConfig>
  planner?: AgentRoleConfig
  coder?: AgentRoleConfig
  tester?: AgentRoleConfig
  reviewer?: AgentRoleConfig
}
```

`ProviderConfig` 只有两个字段:命令与参数数组。没有 `id`、没有 `env`。

## 2. 阶段路由

`createProviderRunner` 按下面的顺序决定一次阶段调用做什么:

| 情况 | 结果 |
| ---------------------------------------------------- | ------------------------------------------ |
| `agents[role]` 缺失或 `mode === 'internal'` | 直接通过,不启动任何进程 |
| `mode === 'external'` 但缺 `provider` | 失败:要求配置 provider |
| provider 名在 `agents.providers` 中不存在 | 失败:provider 未配置 |
| 命令不在 `policy.allowedAgentCommands` 中 | 失败:命令未被允许 |
| 以上都通过 | 启动进程并解码响应 |

不存在 Provider Registry、Adapter Factory 或 Resolver。**路由就是一次两级查表**:
`agents[role].provider` → `agents.providers[name]`。

## 3. 调用协议

一次阶段调用等于一次进程调用:

| 项 | 约定 |
| -------- | ---------------------------------------------------------------- |
| 启动 | `command` + `args`,不追加任何隐式参数 |
| 工作目录 | 项目根(`cwd` 由 Runtime 决定,Provider 不自行切换) |
| stdin | 一个 JSON 对象,见下一节 |
| stdout | 一个 JSON 对象(或空) |
| stderr | 失败时作为 `details` 上报 |
| 退出码 | `0` 表示成功;非零即失败 |

## 4. stdin 载荷

实际写入 stdin 的是 `StageRequest` 加上 `provider` 字段。各阶段共有 `input` 与
`implementationPlan`:

| 阶段 | 判别字段 | 额外字段 |
| -------- | ------------------------ | ---------------------------------------- |
| planner | `phase: 'planner'` | 无 |
| coder | `phase: 'coder'` | `iteration`,`previousVerification` |
| tester | `phase: 'tester'` | `iteration`,`verification` |
| reviewer | `phase: 'reviewer'` | `iteration`,`verification`,`fileChanges` |

判别字段名是 **`phase`**,不是 `stage`。载荷里没有 `task`、`policy` 或 `context` 字段——任务信息
在 `input`(`NormalizedTask`)里。

Coder 会收到**上一轮**的 `previousVerification`,这是重试时 Agent 能看到失败原因的唯一通道。

## 5. stdout 载荷

解码结果是 `AgentPayload`,每个字段都是可选的——它来自不受信任的 stdout:

```ts
interface AgentPayload {
  details?: string
  approved?: boolean
  implementationPlan?: string[]
  evidence?: VerificationCheck[]
  issues?: string[]
  changedFiles?: string[]
}
```

**空 stdout 视为成功**,因为内置阶段本就不产生载荷。非空时必须是单个符合
`agent-response.schema.json` 的 JSON 对象;不符合则阶段失败。

## 6. 调用结果

```ts
interface AgentCallResult {
  ok: boolean
  details: string
  payload: AgentPayload
}

type RunAgent = (name: AgentRole, request: StageRequest) => Promise<AgentCallResult>
```

`RunAgent` 是整个适配层协议的全部:一个函数,不是接口层次。

## 7. 失败如何表达

所有失败都折叠成 `{ ok: false, details: <字符串> }`,没有错误码分类、没有超时、没有重试策略:

| 失败 | `details` 内容 |
| ------------------ | -------------------------------------------- |
| 非零退出 | stderr,或 `"<role> exited with code <n>."` |
| stdout 不是合法 JSON | `"<role> must return one JSON object on stdout."` |
| 不符合响应 schema | `"<role> returned an invalid response: …"` |
| 不满足阶段要求 | 由 `validateStageResponse` 给出的描述 |

阶段要求(见 [Core 契约 §6](./core.md)):planner 需要非空 `implementationPlan`;tester 需要布尔
`approved` 与非空 `evidence`;reviewer 需要布尔 `approved`。

`agentTimeoutMs` 存在于 Policy 中但**未被使用**:`runCommand` 不设置超时,因此一个挂起的
Provider 会一直挂起。

## 8. 相关文档

- [Core 契约](./core.md) · [Policy 契约](./policy.md) · [验证契约](./verification.md)
- [Provider 设计](../architecture/provider.md) · [系统架构](../architecture/system.md)
