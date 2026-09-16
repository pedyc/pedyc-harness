# pedyc-harness

> A policy-driven runtime for reliable AI agents.

**pedyc-harness** 是一个面向 Coding Agent 的控制与治理层（Harness）。

它不负责替代 Claude Code、Codex 等 Coding Agent，而是负责在 Agent 执行任务之前、执行过程中以及执行之后，对 **任务契约、执行策略、代码变更、独立验证和最终结果** 进行约束与审计。

```text
Task
  ↓
Contract
  ↓
Policy
  ↓
Agent Runtime
  ↓
Changes
  ↓
Independent Verification
  ↓
Review / Gate
  ↓
Result / Audit
```

> **Agent 负责执行，Harness 负责治理。**

---

## Why Harness?

Coding Agent 的能力越来越强，但“能够完成任务”并不意味着“能够可靠地完成任务”。

一个 Agent 可能：

* 修改任务范围之外的文件
* 执行不应该执行的命令
* 声称测试通过，但实际上没有留下可验证证据
* 修改受保护文件
* 只根据自己的输出判断任务是否完成
* 在失败后不断扩大执行范围
* 最终无法回答“这次修改到底发生了什么”

因此，可靠的 Agent 系统不能只依赖 Agent 自己的判断。

pedyc-harness 的核心思想是：

> **Agent 的输出是执行结果，不是最终可信证据。**

Harness 通过独立的 Policy、Verification、Diff 和 Review 对 Agent 的执行进行约束和判断。

---

## Core Model

pedyc-harness 将一次 Agent 任务建模为：

```text
Task Contract
      │
      ▼
   Policy
      │
      ▼
Agent Execution
      │
      ▼
 Actual Changes
      │
      ├──────────────┐
      ▼              ▼
Scope Check    Independent Verification
      │              │
      └───────┬──────┘
              ▼
           Review
              │
              ▼
        Run Result / Audit
```

核心原则：

### 1. Task Contract

任务必须明确：

* 做什么
* 可以修改什么
* 验收标准是什么
* 需要执行哪些验证

### 2. Policy

Harness 定义执行边界：

* `allowedPaths`
* `protectedPaths`
* `allowedCommands`
* `forbiddenCommands`
* 最大执行轮次
* 必须执行的验证

默认原则是：

> **拒绝未明确允许的扩展。**

### 3. Independent Verification

验证不能只依赖 Agent 的自我报告。

Harness 可以独立执行：

```text
typecheck
test
build
lint
verify
```

并记录结构化验证证据。

### 4. Diff / Scope Enforcement

Harness 检查实际产生的文件变更，而不是只相信 Agent 声称修改了什么。

```text
Declared Changes
      ≠
Actual Changes
```

实际文件系统 / Git Diff 是更重要的判断依据。

### 5. Review / Approval Gate

最终结果不是简单的：

```text
Agent says: success
```

而是：

```text
Task
+ Policy
+ Actual Changes
+ Verification Evidence
+ Acceptance Criteria
        ↓
     Review
        ↓
   Approved / Rejected
```

---

## Core Capabilities

| Capability               | Purpose                        |
| ------------------------ | ------------------------------ |
| Task Contract            | 定义任务输入和验收标准         |
| Policy Engine            | 限制文件和命令执行范围         |
| Agent Adapter            | 对接不同 Coding Agent          |
| Diff / Scope             | 检查实际代码变更               |
| Independent Verification | 独立执行测试、构建、类型检查等 |
| Review / Gate            | 根据证据判断任务是否通过       |
| Execution Trace          | 保存执行过程和验证结果         |
| Preset                   | 针对不同技术栈提供默认规则     |

---

## Quick Start

### Install

```bash
npm install -g pedyc-harness
```

或者：

```bash
pnpm add -g pedyc-harness
```

### Initialize

在目标项目中：

```bash
harness init
```

根据需要选择 preset，例如：

```bash
harness init --preset generic
```

或者：

```bash
harness init --preset vue
```

初始化后，项目会生成 `.harness/` 配置和相关规则。

---

## Run a Task

一个任务可以描述为：

```json
{
  "id": "add-user-profile",
  "description": "Add a user profile component",
  "scope": {
    "allowedPaths": [
      "src/components/**",
      "src/types/**"
    ]
  },
  "acceptanceCriteria": [
    {
      "id": "component-exists",
      "description": "UserProfile component exists"
    },
    {
      "id": "typecheck",
      "description": "TypeScript type checking passes"
    }
  ]
}
```

然后交给 Harness 执行：

```bash
harness run task.json
```

Harness 不只是等待 Agent 返回：

```text
"Task completed successfully."
```

而是进一步检查：

```text
Task Contract
      ↓
Policy
      ↓
Agent
      ↓
Actual Changes
      ↓
Verification
      ↓
Review
```

最终产生结构化的 Run Result。

---

## Example

假设任务要求：

```text
修改：
src/components/**
src/types/**

禁止：
src/config/**
.harness/**
.github/**
```

Agent 如果尝试修改：

```text
src/components/UserProfile.vue
src/config/api.ts
```

即使 Agent 自己认为任务已经完成：

```text
Agent → success
```

Harness 仍然会发现：

```text
src/config/api.ts
      ↓
outside allowed scope
      ↓
Policy Violation
      ↓
Run Rejected
```

这正是 Harness 与普通 Coding Agent 的核心区别。

---

## Architecture

pedyc-harness 采用分层架构：

```text
┌──────────────────────────────┐
│             CLI              │
├──────────────────────────────┤
│           Runtime            │
│                              │
│ Contract / Policy / Executor │
│ Verification / Diff / Review │
├──────────────────────────────┤
│      Preset / Provider       │
└──────────────────────────────┘
```

核心依赖方向：

```text
Preset
   ↓
 CLI
   ↓
 Core
```

其中：

* **Core**：Harness Runtime 和领域模型
* **CLI**：用户入口和命令行编排
* **Preset**：技术栈相关规则和模板
* **Provider / Adapter**：连接具体 Agent Runtime

Core 不依赖 Vue，也不依赖具体 Agent Provider。

---

## Packages

当前项目拆分为 4 个 npm package：

| Package                         | Responsibility                   |
| ------------------------------- | -------------------------------- |
| `@pedyc/harness-core`           | Harness 核心 Runtime / Domain    |
| `pedyc-harness`                 | CLI                              |
| `@pedyc/harness-preset-generic` | 通用 Preset                      |
| `@pedyc/harness-preset-vue`     | Vue 3 + TypeScript + Vite Preset |

设计目标：

```text
Core
  ↑
CLI
  ↑
Preset
```

Preset 不应该把具体 Agent Provider 实现耦合进 Core。

---

## Harness ≠ Coding Agent

pedyc-harness **不是**：

* Claude Code 的替代品
* Codex 的替代品
* 一个新的 Coding Agent
* 一个 LLM
* 一个模型路由器
* 一个 Prompt 自动优化系统

它们之间的关系更接近：

```text
              ┌─────────────────┐
              │      Agent      │
              │ Claude / Codex  │
              │   / Other       │
              └────────┬────────┘
                       │
                 executes task
                       │
                       ▼
              ┌─────────────────┐
              │     Harness     │
              │                 │
              │ Contract        │
              │ Policy          │
              │ Scope           │
              │ Verification    │
              │ Review          │
              │ Audit           │
              └─────────────────┘
                       │
                       ▼
                 Trusted Result
```

因此：

> **Agent 越强，Harness 越重要。**

Agent 负责把事情做好。

Harness 负责判断：

> **它到底有没有按照要求把事情做好。**

---

## Configuration

项目级 Harness 配置位于：

```text
.harness/
```

项目规则可以通过：

```text
AGENTS.md
```

以及项目自身的：

```text
package.json
```

脚本和配置进行补充。

配置的职责分层是：

```text
npm                      安装能力（CLI / Core / Preset）
.harness/                声明项目治理模型
Preset                   复用默认治理能力
团队仓库 / npm 包         共享组织级配置
```

其中 `.harness/` 是 Harness 的项目控制面，治理定义（Policy、Verification、Rules、Tasks）进入
版本库，运行记录（`.harness/runs/`）不进入。

`.harness/harness.json` 是入口配置（Harness Manifest），只声明使用哪些 Preset 和配置来源：

```json
{
  "$schema": "https://pedyc.dev/schema/harness.json",
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"]
}
```

配置来源按 Manifest → 约定位置（`.harness/policy.json`、`.harness/agents.json`）→ 内置默认值
的顺序选择。没有 `harness.json` 的项目行为不变；`pedyc-harness doctor` 会报告实际生效的来源。

> 规划中：Preset 将以 npm package 分发并支持继承，`presets` 目前只被记录、尚未被消费。
> 详见 [`docs/核心架构.md`](docs/核心架构.md) 与 [`docs/Preset设计.md`](docs/Preset设计.md)。

Harness 的目标不是接管项目本身的工程配置，而是在项目现有工程规则之上增加一层可验证的执行治理。

---

## Verification

Verification 是 Harness 的关键组成部分。

一个完整的验证结果应该包含类似：

```json
{
  "name": "typecheck",
  "command": "pnpm typecheck",
  "exitCode": 0,
  "durationMs": 4210,
  "skipped": false
}
```

Harness 最终关注的是：

```text
Independent Execution
        +
Structured Evidence
        +
Deterministic Evaluation
```

而不是 Agent 的一句：

```text
"Tests passed."
```

---

## Documentation

详细设计位于 [`docs/`](docs/)：

| Document                                          | Description                         |
| ------------------------------------------------- | ----------------------------------- |
| [`项目目标.md`](docs/项目目标.md)                 | 项目定位、设计原则和非目标          |
| [`核心架构.md`](docs/核心架构.md)                 | Runtime、CLI、Preset、Provider 架构 |
| [`核心接口设计.md`](docs/核心接口设计.md)         | 核心 Domain Interface 和数据模型    |
| [`Policy设计.md`](docs/Policy设计.md)             | Policy Engine 和执行边界            |
| [`Verification设计.md`](docs/Verification设计.md) | 独立验证和验证证据                  |
| [`Provider设计.md`](docs/Provider设计.md)         | Agent Provider / Adapter            |
| [`Preset设计.md`](docs/Preset设计.md)             | Preset 体系与配置合成               |
| [`CLI设计.md`](docs/CLI设计.md)                   | CLI 使用与项目初始化                |
| [`release.md`](docs/release.md)                   | Package 构建和发布流程              |
| [`成本权衡.md`](docs/成本权衡.md)                 | 流程深度与 Token 取舍               |
| [`milestones.md`](docs/milestones.md)             | 项目迁移、重构和发布里程碑          |
| [`faq/`](docs/faq/)                               | 配置分层与 Preset 生态的设计讨论    |

README 负责介绍项目。

具体设计以 `docs/` 中对应文档为准。

---

## Project Status

当前项目已经完成：

* TypeScript migration
* 四 package workspace
* Core / CLI / Preset 分层
* Task Contract
* JSON Schema validation
* 基础 Policy 能力
* Agent Adapter 基础协议
* package build / typecheck / test
* package tarball consumer verification
* Generic / Vue Preset
* CLI dry-run / verify / doctor 等基础能力

当前重点已经从：

```text
"让 Agent 能执行"
```

转向：

```text
"让 Agent 的执行可以被约束、验证和审计"
```

下一步先做配置层（M15–M16）：

```text
"让治理策略可以被声明、继承和分层共享"
```

配置层决定 Policy、Verification 与 Run Record 从哪里读配置，因此排在治理执行之前；团队级
Preset 与安全模型（M18–M19）仍在其后。见 [`docs/milestones.md`](docs/milestones.md)。

随后重点包括：

* Policy enforcement
* Independent Verification Evidence
* Execution Trace / Audit
* Approval Gate
* Adapter portability
* Release / compatibility hardening

---

## Design Principles

pedyc-harness 遵循几个核心原则：

1. **Agent 是执行者，不是最终裁判。**
2. **约束必须能够被机器执行。**
3. **实际变更优先于 Agent 自我描述。**
4. **验证必须产生结构化证据。**
5. **任务边界必须显式定义。**
6. **默认拒绝未授权的范围扩展。**
7. **Provider 与 Harness Core 解耦。**
8. **技术栈规则通过 Preset 注入，而不是写死在 Core。**
9. **执行过程应该可以追踪和审计。**
10. **治理能力优先于 Agent 能力扩张。**

---

## Roadmap

项目当前的演进方向：

```text
M0–M6
Foundation（已完成）
    ↓
M11
TypeScript Migration（已完成）
    ↓
M15 → M16
Config Foundation / Preset Resolution
    ↓
M7 → M8
Policy Enforcement / Independent Verification
    ↓
M17
Effective Policy
    ↓
M9 → M10
Trace / Audit / Approval Gate
    ↓
M12 → M13 → M14
Governance Release / Provider / v1.3.0

M18 → M19 → M20
Team Preset / Security Model / Preset 生态命令
```

配置层（M15–M16）排在治理能力之前，是因为它决定 Policy、Verification 与 Run Record 从哪里
读配置；M17 依赖 M7 已实现的策略字段，因此不随之提前。阶段划分、依赖关系与验收标准见
[`docs/milestones.md`](docs/milestones.md)。
