# Provider 架构

## 1. 职责

Provider 是 Harness 对外部 Agent Runtime 的**执行适配层**。

Provider 的核心目标不是支持尽可能多的 Agent，而是：

> **让 Agent 执行能力可以被替换，而不改变 Harness Core。**

整体关系：

```text
Harness Core
    ↓
AgentAdapter
    ↓
Provider
    ↓
Agent Runtime
```

Core 不应该直接依赖具体 Provider。

例如 Core 中不应该出现：

```ts
if (provider === "claude") {
  ...
}

if (provider === "codex") {
  ...
}
```

Provider-specific 逻辑必须停留在 Adapter 层。

---

## 2. Provider 与 Adapter

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

因此：

```text
Provider
= 外部执行环境

Adapter
= Harness 对 Provider 的适配实现
```

Core 只依赖统一的 `AgentAdapter` 协议。

---

## 3. Core 边界

Core 应该只关心：

```text
Agent Request
Agent Result
Execution Context
Execution Lifecycle
Provider Error
```

Core 不应该关心：

```text
Claude Code
Codex
其他 Coding Agent
具体 CLI 参数
Provider 私有配置
Provider 内部输出格式
```

Provider-specific 行为由 Adapter 封装。

因此：

```text
Core
  │
  │ AgentAdapter
  ▼
Adapter
  │
  │ Provider-specific protocol
  ▼
Agent Runtime
```

---

## 4. Provider 执行协议

Provider Adapter 与外部 Agent 之间采用进程协议。

### stdin

stdin 传递 Agent Request：

```json
{
  "task": {},
  "policy": {},
  "stage": "coder",
  "context": {}
}
```

### stdout

stdout 只输出 Agent Result：

```json
{
  "status": "success",
  "output": {},
  "changes": {}
}
```

### stderr

stderr 用于诊断信息：

```text
starting provider...
loading configuration...
executing agent...
```

stderr 不属于 Agent Result。

### Exit Code

进程退出码表示执行层面的最终状态：

```text
0    success
!=0  failure
```

Harness 必须综合处理：

```text
stdout
stderr
exit code
timeout
process error
```

不能仅根据 stdout 判断执行是否成功。

---

## 5. 工作目录

Provider 执行必须具有明确的工作目录。

原则：

> **Agent 的工作目录由 Harness Runtime 控制，而不是由 Provider 自行决定。**

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

中执行。

Provider 不应该自行切换到其他 Repository。

工作目录属于当前 Task 的执行上下文。

---

## 6. 环境模型

Provider 可以接收 Runtime 提供的执行环境。

概念上至少需要区分：

```text
Harness Configuration
        │
Provider Configuration
        │
Agent Environment
        │
Project Environment
```

这些配置不应该全部合并成一个无边界的对象。

例如：

```ts
interface AgentContext {
  cwd: string
  env?: Record<string, string>
}
```

其中：

* `cwd`：由 Harness Runtime 控制
* `env`：Runtime 提供给 Agent 的执行环境

Provider 可以消费这些信息，但不应该反向决定 Harness 的全局配置。

---

## 7. Provider 生命周期

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

### Runtime 负责

* Provider Resolution
* 执行生命周期
* 工作目录控制
* 环境准备
* Process 启动与等待
* Timeout
* Process Error
* 生命周期状态管理

### Adapter 负责

* Provider 命令构造
* Request → Provider Input 转换
* Provider Output → AgentResult 转换
* Provider-specific 错误映射

因此：

```text
Runtime
= 控制执行过程

Adapter
= 适配 Provider 协议
```

---

## 8. Provider 错误与 Agent 失败

必须区分：

### Provider Error

表示 Harness 无法正常完成 Provider 执行。

例如：

```text
provider-not-found
provider-start-failed
provider-timeout
provider-invalid-output
provider-exit-failed
```

这些属于执行基础设施错误。

### Agent Execution Failure

表示 Agent 已经成功启动并执行，但任务本身失败：

```text
AgentExecutionStatus = "failed"
```

关系：

```text
Provider Error
    ↓
执行基础设施失败

Agent Failure
    ↓
Agent 已执行
任务本身失败
```

两者不能混为一个状态。

---

## 9. Provider 与 Policy

Provider 不负责决定 Agent 可以做什么。

错误设计：

```text
Provider
    ↓
决定 Agent 可以修改哪些文件
```

正确关系：

```text
Policy
    ↓
决定允许什么
    ↓
Provider
    ↓
执行 Agent
    ↓
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

## 10. Provider 与 Verification / Review

Provider 负责：

```text
启动 Agent
传递 Request
获取 Result
映射执行错误
```

Provider 不负责：

```text
验证 Task 是否完成
验证代码是否通过
验证 Diff 是否符合 Scope
最终 Review
```

这些职责分别属于：

```text
Verification
Diff / Scope
Review
```

Provider 的输出应该成为后续流程的输入，而不是直接决定任务最终是否通过。

---

## 11. Doctor

CLI 应提供 Provider 环境检查：

```bash
pedyc-harness doctor
```

Doctor 至少可以检查：

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

> **在执行 Task 之前发现 Provider 环境问题。**

因此：

```text
Doctor
= 环境诊断

Verification
= Task / Result 验证
```

二者不能混为一谈。

---

## 12. Provider Resolution

Provider 的解析最终应逐步收敛为：

```text
Provider Registry
      ↓
Provider Config
      ↓
Adapter Factory
      ↓
AgentAdapter
```

其中：

### Provider Registry

负责 Provider 标识与 Adapter 的注册关系。

### Provider Config

负责 Provider-specific 配置。

### Adapter Factory

根据 Provider 配置创建对应 Adapter。

### AgentAdapter

向 Runtime 提供统一执行能力。

---

## 13. 当前实现与演进

当前 Provider / Adapter 仍可能存在实现耦合，例如：

* Adapter 对 Repository 路径存在硬编码；
* 部分 Gate 名称存在固定约定；
* Provider 配置尚未完全抽象。

这些问题应逐步收敛，但不应该为了支持更多 Provider 而提前设计复杂插件系统。

目标不是：

```text
支持无限 Provider
```

而是：

```text
替换 Provider
不修改 Core
```

---

## 14. 架构边界

Provider 层最终保持以下边界：

```text
                 ┌──────────────┐
                 │  Harness Core │
                 └──────┬───────┘
                        │
                 AgentAdapter
                        │
                 ┌──────▼───────┐
                 │    Adapter    │
                 └──────┬───────┘
                        │
              Provider-specific
                  protocol
                        │
                 ┌──────▼───────┐
                 │ Agent Runtime │
                 └───────────────┘
```

Provider 层不向上泄漏 Provider-specific 实现细节。

---

## 15. 设计原则

1. Core 不依赖具体 Provider。
2. Provider-specific 逻辑放在 Adapter。
3. stdin / stdout / stderr / exit code 语义明确。
4. 工作目录由 Harness Runtime 控制。
5. Provider 不负责 Policy。
6. Provider 不负责独立 Verification。
7. Provider 不负责最终 Review。
8. Provider 可以被替换。
9. Provider 数量不是产品目标。
10. 不为了 Provider 数量提前设计复杂插件系统。

---

## 16. 相关文档

* [Provider Interface](../interfaces/provider.md)
* [Policy 架构](./policy.md)
* [Preset 架构](./preset.md)
* [Verification 设计](../Verification设计.md)
* [核心架构](../核心架构.md)
* [CLI 设计](../CLI设计.md)
