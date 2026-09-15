---
title: Untitled
date-created: 2026-09-15
date-modified: 2026-09-15
---

## Provider 设计

> Provider 是 Agent 执行能力的适配层。
>
> Core 不关心具体使用 Claude Code、Codex、其他 Coding Agent，甚至未来的自定义 Agent。
> Core 只依赖统一的 AgentAdapter 协议。

---

### 1. 设计目标

Provider 的核心目标不是支持尽可能多的 Provider，而是：

> **让 Agent 执行能力可以被替换，而不改变 Harness Core。**

因此：

```text
Harness Core
    ↓
AgentAdapter
    ↓
Provider
    ↓
Agent Runtime
````

Core 不应该出现：

```ts
if (provider === "claude") {
  …
}

if (provider === "codex") {
  …
}
```

Provider-specific 逻辑必须停留在 Adapter 层。

---

### 2. Provider 与 Adapter

Provider 是外部 Agent 执行环境。

Adapter 是 Harness 对 Provider 的适配实现。

例如：

```text
Claude Code
    ↓
ClaudeAdapter
    ↓
AgentAdapter
    ↓
Harness Runtime
```

或者：

```text
Codex
    ↓
CodexAdapter
    ↓
AgentAdapter
    ↓
Harness Runtime
```

Core 只依赖：

```ts
interface AgentAdapter {
  readonly id: string

  execute(
    request: AgentRequest
  ): Promise<AgentResult>
}
```

---

### 3. Provider 输入输出协议

Provider Adapter 与外部 Agent 之间采用进程协议。

#### 输入

通过 stdin 传递 JSON：

```json
{
  "task": {},
  "policy": {},
  "stage": "coder",
  "context": {}
}
```

#### 输出

stdout 只输出 Agent Result：

```json
{
  "status": "success",
  "output": {},
  "changes": {}
}
```

#### stderr

stderr 用于诊断信息：

```text
starting provider…
loading configuration…
executing agent…
```

stderr 不作为 Agent Result。

#### Exit Code

进程退出码用于表示执行层面的最终状态。

```text
0   success
!=0 failure
```

Harness 必须同时处理：

```text
stdout
stderr
exit code
timeout
process error
```

不能只根据 stdout 判断成功。

---

### 4. 工作目录

Provider 执行必须具有明确的工作目录。

原则：

> Agent 的工作目录由 Harness Runtime 明确控制，而不是由 Provider 自己决定。

工作目录应该来自当前 Task 的执行上下文。

例如：

```text
project/
├── src/
├── package.json
└── .harness/
```

Agent 应在：

```text
project/
```

中运行。

Provider 不应该自行切换到其他 Repository。

---

### 5. 环境变量

Provider 可以接收 Runtime 提供的执行环境。

例如：

```ts
interface AgentContext {
  cwd: string
  env?: Record<string, string>
}
```

需要区分：

```text
Harness 配置
Provider 配置
Agent 环境
Project 环境
```

不要把所有配置混成一个对象。

---

### 6. Provider 生命周期

一次 Provider 执行可以抽象为：

```text
Create Request
      ↓
Resolve Provider
      ↓
Prepare Environment
      ↓
Start Process
      ↓
Write stdin
      ↓
Read stdout/stderr
      ↓
Wait Process
      ↓
Parse Result
      ↓
Map Errors
      ↓
Return AgentResult
```

Runtime 负责生命周期控制。

Provider Adapter 负责：

- Provider 命令构造
- 输入转换
- 输出解析
- Provider-specific 错误映射

---

### 7. Provider 错误

Provider 错误必须与 Agent 任务失败区分。

例如：

```ts
type ProviderError =
  | "provider-not-found"
  | "provider-start-failed"
  | "provider-timeout"
  | "provider-invalid-output"
  | "provider-exit-failed"
```

这些错误属于 Harness 执行基础设施。

而：

```ts
AgentExecutionStatus = "failed"
```

表示 Agent 已经执行，但任务本身失败。

---

### 8. Doctor

CLI 应提供 Provider 环境检查：

```bash
pedyc-harness doctor
```

Doctor 至少检查：

```text
Provider command
Provider configuration
Required scripts
Working directory
Writable directories
```

例如：

```text
Provider: codex
✓ command found
✓ configuration valid
✓ working directory exists
✓ project is writable
```

Doctor 的作用是：

> 在执行任务之前发现环境问题。

它不是 Task Verification。

---

### 9. Provider 与 Policy 的边界

Provider 不能代替 Policy。

错误设计：

```text
Provider 决定 Agent 可以修改哪些文件
```

正确设计：

```text
Policy
  ↓
决定允许什么

Provider
  ↓
执行 Agent

Diff / Scope
  ↓
检查实际发生了什么
```

因此：

```text
Provider ≠ Security Policy
Provider ≠ Verification
Provider ≠ Review
```

Provider 只是执行适配层。

---

### 10. 当前实现与后续演进

当前 Provider/Adapter 仍存在部分实现耦合，例如：

- Adapter 对 Repository 路径存在硬编码；
- 部分 Gate 名称存在固定约定；
- Provider 配置尚未完全抽象。

后续应该逐步收敛为：

```text
Provider Registry
      ↓
Provider Config
      ↓
Adapter Factory
      ↓
AgentAdapter
```

但不应为了 Provider 数量而提前设计复杂插件系统。

---

### 11. 设计原则

Provider 设计遵循：

1. Core 不依赖具体 Provider。
2. Provider-specific 逻辑放在 Adapter。
3. stdin/stdout/stderr/exit code 语义明确。
4. 工作目录由 Harness 控制。
5. Provider 不负责 Policy。
6. Provider 不负责独立 Verification。
7. Provider 不负责最终 Review。
8. Provider 可替换，但 Provider 数量不是产品目标。
