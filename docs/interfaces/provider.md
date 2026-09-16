# Provider Interface

## 1. AgentAdapter

Core 依赖统一的 `AgentAdapter` 协议。

```ts
interface AgentAdapter {
  readonly id: string

  execute(
    request: AgentRequest
  ): Promise<AgentResult>
}
```

`AgentAdapter` 是 Core 与具体 Provider 之间的稳定边界。

Core 不应该依赖：

```ts
ClaudeAdapter
CodexAdapter
```

而只依赖：

```ts
AgentAdapter
```

---

## 2. AgentRequest

`AgentRequest` 表示一次 Agent 执行请求。

```ts
interface AgentRequest {
  task: TaskContext
  policy: PolicyContext
  stage: string
  context: AgentContext
}
```

其中：

```text
task
    Task 执行上下文

policy
    当前 Policy 上下文

stage
    当前执行阶段

context
    Agent 执行环境
```

具体字段应根据 Core 的 Task / Policy 模型继续收敛。

---

## 3. AgentContext

Agent Context 描述 Agent 的运行环境。

```ts
interface AgentContext {
  cwd: string
  env?: Record<string, string>
}
```

### cwd

Agent 的工作目录。

该目录由 Harness Runtime 决定。

Adapter 不应该自行修改工作目录。

### env

传递给 Agent Process 的环境变量。

Provider-specific 配置不应该全部直接塞入 `AgentContext`。

---

## 4. AgentResult

`AgentResult` 表示 Agent 执行产生的统一结果。

```ts
interface AgentResult {
  status: AgentExecutionStatus
  output: unknown
  changes?: unknown
}
```

其中：

```ts
type AgentExecutionStatus =
  | "success"
  | "failed"
```

`AgentResult` 是 Provider Adapter 对外部 Agent 输出进行归一化后的结果。

Core 不应该直接消费 Provider-specific output。

---

## 5. Provider Process Result

Provider Adapter 在处理外部进程时，需要同时考虑：

```ts
interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number | null
}
```

实际实现还必须处理：

```text
timeout
process error
signal
```

因此 `ProcessResult` 更适合作为 Adapter / Runtime 内部执行模型，而不是 Core 的最终 Agent Result。

---

## 6. Provider Error

Provider 错误表示执行基础设施问题。

```ts
type ProviderErrorCode =
  | "provider-not-found"
  | "provider-start-failed"
  | "provider-timeout"
  | "provider-invalid-output"
  | "provider-exit-failed"
```

建议统一为错误对象：

```ts
interface ProviderError {
  code: ProviderErrorCode
  message: string
  cause?: unknown
}
```

这些错误与：

```ts
AgentExecutionStatus = "failed"
```

保持区别。

---

## 7. ProviderConfig

Provider 配置应与 Harness Configuration、Agent Environment 分离。

建议抽象为：

```ts
interface ProviderConfig {
  id: string
  command: string
  args?: string[]
  env?: Record<string, string>
}
```

这里的具体字段仍属于待收敛的 Provider 配置模型。

核心原则是：

```text
Harness Config
    ≠
Provider Config
    ≠
Agent Environment
```

---

## 8. ProviderRegistry

Provider Registry 负责 Provider 与 Adapter 的注册关系。

```ts
interface ProviderRegistry {
  register(
    id: string,
    factory: AgentAdapterFactory
  ): void

  resolve(
    id: string
  ): AgentAdapterFactory | undefined
}
```

Registry 不负责：

* Agent 执行
* Policy Evaluation
* Verification
* Review

它只负责 Provider → Adapter 的解析。

---

## 9. Adapter Factory

Adapter Factory 根据 Provider 配置创建 Adapter。

```ts
interface AgentAdapterFactory {
  readonly id: string

  create(
    config: ProviderConfig
  ): AgentAdapter
}
```

整体关系：

```text
ProviderRegistry
      ↓
AgentAdapterFactory
      ↓
AgentAdapter
      ↓
Agent Runtime
```

---

## 10. Provider Resolver

Runtime 可以通过 Resolver 获取最终 Adapter。

```ts
interface ProviderResolver {
  resolve(
    id: string,
    config?: ProviderConfig
  ): AgentAdapter
}
```

解析过程：

```text
Provider ID
    ↓
Provider Registry
    ↓
Adapter Factory
    ↓
Provider Config
    ↓
AgentAdapter
```

具体 Resolver 是否独立于 Registry，可以在实现阶段继续确定。

---

## 11. Provider Doctor

Doctor 不属于 AgentAdapter 执行协议。

如果需要抽象 Provider 环境诊断，可以定义：

```ts
interface ProviderDoctor {
  check(
    context: DoctorContext
  ): Promise<DoctorResult>
}
```

例如：

```ts
interface DoctorContext {
  cwd: string
}

interface DoctorResult {
  status: "ok" | "failed"
  checks: DoctorCheck[]
}

interface DoctorCheck {
  name: string
  status: "ok" | "failed"
  message?: string
}
```

典型检查：

```text
Provider command
Provider configuration
Working directory
Writable directories
Required scripts
```

Doctor 与 Task Verification 保持独立。

---

## 12. Adapter 责任边界

Adapter 负责 Provider-specific 的转换：

```text
AgentRequest
      ↓
Provider Input
      ↓
External Agent
      ↓
Provider Output
      ↓
AgentResult
```

因此 Adapter 可以包含：

```text
Command construction
Argument construction
Input serialization
Output parsing
Provider-specific error mapping
```

但不应该包含：

```text
Policy decision
Security decision
Task verification
Review decision
```

---

## 13. stdin / stdout / stderr

Provider Adapter 与外部 Agent 的进程协议：

```text
stdin
  AgentRequest

stdout
  AgentResult

stderr
  Diagnostics

exit code
  Process execution status
```

约束：

```text
stdout
    必须保持机器可解析

stderr
    可以输出诊断信息

exit code
    必须参与最终执行状态判断
```

不能简单使用：

```ts
stdout !== ""
```

判断 Provider 是否执行成功。

---

## 14. Process Lifecycle

Provider 执行过程中至少存在以下状态：

```text
created
  ↓
starting
  ↓
running
  ↓
completed
```

异常情况下可能进入：

```text
start-failed
timeout
process-error
invalid-output
exit-failed
```

这些属于 Provider / Runtime 执行状态，不应直接等同于 Agent Task 的业务结果。

---

## 15. Interface Boundary

最终接口关系：

```text
┌─────────────────────────────┐
│        Harness Core         │
│                             │
│  AgentRequest / AgentResult │
└──────────────┬──────────────┘
               │
         AgentAdapter
               │
┌──────────────▼──────────────┐
│          Adapter            │
│                             │
│ Provider-specific mapping   │
└──────────────┬──────────────┘
               │
       Process Protocol
               │
┌──────────────▼──────────────┐
│       Agent Runtime         │
└─────────────────────────────┘
```

Core 的稳定依赖点只有：

```ts
AgentAdapter
AgentRequest
AgentResult
```

Provider-specific 类型应尽量限制在 Adapter 边界内部。

---

## 16. 相关文档

* [Provider 架构](../architecture/provider.md)
* [Policy Interface](./policy.md)
* [Preset Interface](./preset.md)
* [核心接口设计](../核心接口设计.md)
* [CLI 设计](../CLI设计.md)
