# ADR-006 — Run 生命周期、终止原因与观察层边界

* **Status:** Accepted
* **Date:** 2026-09-17
* **Related:** [ADR-003](./ADR-003-preset-as-code.md)、[ADR-004](./ADR-004-policy-severity-rules.md)、[ADR-005](./ADR-005-semantic-governance.md)

## 1. Context

一次 Run 的结论目前只有一个字段：

```ts
type RunStatus = 'passed' | 'failed'        // 由 orchestration.completed 派生
```

这在文档里已经被记为歧义：

* [验证架构](../architecture/verification.md) 写明「运行级 `status` 由「编排是否完成」派生，不是由证据
  评估派生。也就是说 `passed` 表示流程走通了，不表示某一套证据被独立复核过」；
* [系统架构](../architecture/system.md) 写明「不存在 `rejected`、`cancelled` 等未实现的状态」——即状态
  词汇被刻意压到实现之下。

同时有三件事没有定义：Runtime 有哪些编排阶段、循环为什么停下、以及**观察层能观察到什么粒度**。
最后一项尤其重要：Provider 协议是「一次阶段 = 一次进程调用」（stdin 一个 JSON，stdout 一个 JSON），
没有 session、没有事件流，因此"实时拦截 Agent 的每一次文件写入"在当前协议下**不可实现**。如果不把
这条边界写下来，Runtime 设计会持续被一个做不到的目标牵引。

## 2. Decision

### 2.1 两套词汇必须分开

| 词汇 | 取值 | 属于谁 |
| ---------- | -------------------------------------------------------------- | ------------------------ |
| `RunPhase` | load / resolve / preflight / execute / verify / scope / review / record | Runtime 的编排 |
| `StageName` | planner / coder / tester / reviewer | Agent 阶段（Provider 协议） |

`StageName` 是**契约**：它是 `AgentRole`、`.harness/agents.json` 的键、`StageRequest.phase` 的判别
字段，也是 `--dry-run` 输出的四条记录（被测试与 `release:check` 直接断言）。因此给 `PhaseRecord`
增加 `kind: 'run' | 'stage'`，而不是用一套新名字替换旧名字。

### 2.2 三个正交的结果概念

| 概念 | 回答的问题 | 取值 |
| ---------------------- | -------------------------- | ---------------------------------------------------------------- |
| `termination` | 循环为什么停下 | `completed` / `timeout` / `max_iterations` / `policy_violation` / `agent_error` / `cancelled` |
| `status` | 运行是否走完并产出结论 | `passed` / `failed` |
| `verdict`（目标） | 治理结论 | `approved` / `rejected` |

分开的直接收益：修掉 §1 记录的歧义——「循环正常结束」与「结论是通过」不再挤在同一个布尔里。

两个**不**进入 `termination` 的取值，以及原因：

* `max_turns`：Agent 内部的轮次预算，Harness 在批协议下看不到；
* `budget_exceeded`：成本预算属于[成本权衡](../tradeoffs/成本权衡.md)，且该里程碑尚未落地。

### 2.3 观察层是观察，不是拦截

| 粒度 | 能拿到什么 | 可执行性 |
| ----------------------------- | ------------------------------------ | ---------------------------------------------- |
| 阶段级（每次 Provider 调用） | 调用前后快照、命令、退出码、耗时 | ✅ 今天就有 |
| 适配器上报（可选能力） | 进度事件 | ⚠️ 必须能力协商；Harness **不得依赖**，缺失时行为完全一致 |
| 写入级拦截 | — | ❌ 需要流式会话协议或 OS 级沙箱，是独立的路线决策 |

当前协议下**真正能实时拒绝**的只有 Harness 自己启动的进程：Provider 命令与验证命令的策略检查
（`forbiddenCommands`）、以及受保护路径的**前置**拒绝。这三项是 M7 的落点，也是"实时策略"的全部。

### 2.4 状态机

```text
CREATED → PREFLIGHT → RUNNING → VERIFYING → REVIEW → DONE(approved | rejected)
                         │           │
                         └── 终止原因 ─┘   timeout / cancelled / policy_violation /
                                          agent_error / max_iterations
```

规则：**文档里出现的每一个状态，要么有实现，要么带明确的里程碑标记。** 解除
[系统架构](../architecture/system.md) 中"不写未实现状态"的既有约束，必须与实现同批进行，不允许先写
状态词再实现。

### 2.5 产物分离

| 产物 | 回答 | 内容边界 |
| ---------- | ---------------- | ------------------------------------------------------------ |
| `RunResult` | 这次任务最终怎么样 | 治理结论的**快速读取面**：status、termination、各判定结果 |
| `RunRecord` | 这次任务发生了什么 | Harness **自己观察到的事实**：policy 判定、evidence（带信任等级）、scope、verdict、termination、provenance |

**Agent 的完整对话不进入 RunRecord。** 那属于 Provider 与 Agent 自己的日志：写进来会重复、会带来
脱敏负担，也会把项目推向它明确不做的"会话式 Agent / Memory"。

### 2.6 契约变更分阶段

`RunResult` 先加 `runId` 与 `termination`（兼容性扩展），嵌套子结果与 `verdict` 留到下一个破坏性
窗口，按[发布与版本规则](../release.md)判定版本。

## 3. Consequences

### Positive

* 「循环结束了」与「结论是通过」不再混淆，审计与 CI 都能分别判断。
* 观察层的边界被写下来，Runtime 不再被做不到的目标牵引；能实时拒绝的部分被收敛到 M7 的具体字段。
* `RunPhase` / `StageName` 分开后，dry-run 契约、`agents.json` 与重试语义都不会因新词汇而漂移。

### Negative

* 记录面变大（termination、trust level、provenance），M9 的 schema 需要一次到位。
* 状态机引入后，"文档必须有实现或里程碑标记"成为一条需要持续维护的纪律。

## 4. Alternatives

| 方案 | 为什么没选 |
| -------------------------------------------------- | ------------------------------------------------------------ |
| 保持单一 `status` 布尔 | 歧义已经写在文档里；`rejected`/`cancelled` 无处表达 |
| 用 8 个 `RunPhase` 替换现有 4 个阶段名 | 会破坏 dry-run 契约、`agents.json` 与 `release:check` 的断言 |
| 让 Monitor 直接拦截 Agent 的写入 | 批协议下不可实现；要做就必须换协议或上沙箱，那是独立决策 |
| 把 Agent 全部消息写进 RunRecord | 重复 Provider 日志、脱敏成本高，并越过"不做会话式 Agent"的边界 |

## 5. Core Principle

> **Runtime 负责控制与记录，不负责思考。它能拒绝的只有它自己启动的进程；其余的一切，先观察，再判定。**
