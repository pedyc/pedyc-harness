# Governance Runtime 架构

> Runtime 是**控制平面**,不是智能平面:它不决定任务怎么完成,只决定 Agent 在什么条件下执行、实际
> 发生了什么、以及结果是否满足契约。
>
> 本文件回答:Runtime 由哪些编排阶段组成、每个阶段什么时候执行、如何参与判定。领域契约见
> [Core 契约](../interfaces/core.md),判定的三层链路见[治理流水线](./governance.md),
> 生命周期与状态机的决策见 [ADR-006](../decisions/ADR-006-run-lifecycle.md)。
>
> 标注约定见[文档规范](../CONVENTIONS.md):现在时陈述表示**已实现**,目标形态一律显式标注。

## 1. 是什么

本文件描述的运行时,正式名称是 **Governance Runtime**。**Agent Runtime**——执行循环、工具、模型与
会话状态——属于外部世界:Harness 通过 [Provider](./provider.md) 与它交互,不实现它,也不接管它。
两者的分工见[系统架构](./system.md) §1,判据见[项目目标](../项目目标.md) 原则 18、19。

它的输入与输出都很窄:

```text
输入                                 输出
Task Contract                        RunResult   治理结论(快速读取面)
Effective Config(目标 M17)      →     RunRecord   审计记录(完整事实)
+ 一个工作区 + 一个 Provider
```

它**不思考**任务怎么做——那是 Agent;它**不判断**代码好不好——那是规则实现与审查层。它负责的是:

| 职责 | 具体是什么 |
| ------------------ | ------------------------------------------------------------ |
| 约束执行 | 在每次 Provider 调用前施加命令策略;在写产品文件之前判断范围 |
| 独立执行 | 自己跑验证闸门,自己比对改动,不采信 Agent 的"已完成" |
| 判定 | 把证据、范围与 Findings 按 Policy 合成结论(见[治理流水线](./governance.md)) |
| 记录 | 把 Harness **自己观察到的事实**写成可复核的 RunRecord |

## 2. 两套词汇必须分开

```text
RunPhase    load → resolve → preflight → execute → verify → scope → review → record
StageName                        planner → coder → tester → reviewer
```

`StageName` 是契约的一部分(`AgentRole`、`.harness/agents.json` 的键、`StageRequest.phase`、
`--dry-run` 的四条记录),因此**不允许**用 `RunPhase` 的名字替换它。两者在记录里用
`PhaseRecord.kind`(`'run' | 'stage'`)区分。

## 3. 编排阶段

| RunPhase | 什么时候执行 | 做什么 | 现在由谁承担 |
| ------------- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| `load` | 命令启动后立即 | 归一化 Task;读取 `.harness/harness.json` 与契约 schema | `runtime/intake.ts`、`config/` |
| `resolve` | Agent 启动之前 | 解析 Preset、选出 policy/agents;目标:合成 Effective Config | `config/`(**合成属 M17**) |
| `preflight` | `resolve` 之后、`execute` 之前 | 一切能在执行前发现的问题,不通过就**不启动 Agent** | 分散在 `config/` 与 `run.ts`(**无统一阶段**) |
| `execute` | Preflight 通过后 | 调用 Provider:planner → coder;失败按循环语义处理 | `runtime/provider-runner.ts` + `executor.ts` |
| `verify` | 每次 Coder 返回后 | 逐个执行 `requiredChecks`,收集 Evidence | `run.ts` 的 `runVerification` |
| `scope` | 验证之后、判定之前 | 比对实际改动与允许范围 | `runtime/scope.ts` 的 `judgeScope` |
| `review` | 范围判定之后 | 外部 tester/reviewer 的裁定、Findings 的处置 | `runtime/approval-gate.ts` + Reviewer 阶段 |
| `record` | 运行结束时 | 写出 `RunResult` 与 RunRecord | `.harness/runs/<runId>/` |

循环语义(已实现):

* Coder 只在 Tester 未通过时重试,上限 `min(input.maxIterations, policy.maxIterations)`,默认 3;
* 可修复的 Finding 也会回流 Coder(M8),但越界改动**从不**重试;
* Planner、Coder、Reviewer 任一失败直接终止,不重试;
* 运行的通过条件**包含**范围判定:越界改动一票否决。

`scope` 现在是**独立执行、独立报告**的一步:它有自己的阶段记录(`name: 'scope'`)与结果字段
(`RunResult.scope`),在 Reviewer 之前执行,即使 Reviewer 已经批准也照常判定。记录因此能回答
「是 Reviewer 拒绝了,还是范围判定拒绝了」,而不用从一段 `details` 文本里猜。

## 4. Preflight 与三个既有命令的分工

"执行前发现问题"目前分散在四个地方,必须明确各自负责什么,否则会出现四套前置检查:

| 入口 | 什么时候用 | 检查什么 | 是否执行产品脚本 |
| ------------------ | ------------------ | ------------------------------------------------------------ | ---------------- |
| `preflight`(目标) | 每次 `run` | Task/Policy/Verification 形状、Preset 已解析、Provider 与工作区可用、Git 状态(可选) | 否 |
| `pedyc-harness verify` | 用户显式调用或 CI | 配置齐全、schema 可解析、`requiredChecks` 的脚本存在;可执行 `.harness/verify.mjs` | 断言存在,并透传钩子退出码 |
| `pedyc-harness doctor` | 用户显式调用 | 环境与**实际生效的配置来源**(含回退到内置默认值) | 否 |
| `run --dry-run` | 用户显式调用 | 不调用任何 Provider、不执行闸门、不修改文件,但输出同一套阶段记录 | 否 |

原则:**能在执行前发现的问题,不应该等 Agent 执行后再发现**;但 Preflight 不能变成第二个 `verify`,
它只负责"这次运行能不能开始"。

## 5. 执行与观察

Runtime 通过 Provider 协议调用 Agent:**一次阶段 = 一次进程调用**(stdin 一个 `StageRequest`,
stdout 一个 `AgentPayload`)。因此观察能力有硬边界:

| 粒度 | 能拿到什么 | 可执行性 |
| ----------------------------- | ------------------------------------ | ------------------------------------------ |
| 阶段级(每次 Provider 调用) | 调用前后快照、命令、退出码、耗时 | ✅ 已实现 |
| 适配器上报(可选能力) | 进度事件 | ⚠️ 需能力协商;Harness **不得依赖** |
| 写入级拦截 | — | ❌ 需要流式会话协议或 OS 级沙箱 |

由此得到一条必须写清楚的结论:**Runtime 能实时拒绝的,只有它自己启动的进程**——Provider 命令与验证
命令的策略检查,以及受保护路径的前置拒绝。Agent 进程内部的写入只能**事后**从快照差异中发现,并交给
判定层处理。

## 6. 终止

循环停止的原因必须被记录,而不是折叠成一个布尔:

| 取值 | 谁决定 |
| ---------------------- | ------------------------------------------ |
| `completed` | 循环正常走完 |
| `max_iterations` | Harness(重试上限) |
| `timeout` | Harness(`agentTimeoutMs` 到期,M7 已接入) |
| `policy_violation` | Harness(命令策略、范围判定或不可修复的 Finding) |
| `agent_error` | Harness(Provider 进程失败、响应不合法或未声明的 rule id) |
| `cancelled` | 用户(取消管线,M7 已接入) |

`max_turns` 与 `budget_exceeded` **不在**此列:前者在批协议下不可见,后者属于
[成本权衡](../tradeoffs/成本权衡.md)。终止原因与治理结论的关系见
[ADR-006](../decisions/ADR-006-run-lifecycle.md) §2.2。

## 7. 产物

| 产物 | 回答 | 今天 |
| ---------- | ---------------- | ------------------------------------------------------------ |
| `RunResult` | 这次任务最终怎么样 | `output.json`:含 `termination`、`scope`、`evidence`、`findings`、`violations`;**仍没有 `runId`** |
| `RunRecord` | 这次任务发生了什么 | `.harness/runs/<runId>/` 的 input / policy / iteration-n-verification(`Evidence[]`)/ output(**M9 才统一**) |

两条边界:

* **RunRecord 只记 Harness 自己观察到的事实**:policy 判定、Evidence(带信任等级)、范围、Findings、
  终止原因、以及(M17 之后)每条生效值的 provenance。Agent 的完整对话**不进入** RunRecord——那属于
  Provider 与 Agent 的日志。
* **密钥、Token、环境变量值与不应外泄的绝对路径不得写入记录**(M9 的既有要求)。

## 8. 模块划分

Runtime 的模块按**已有行为**拆,不按设想的职责拆。今天是三层单向依赖:

```text
contracts/   纯类型与 schema 编译
config/      拥有所有对项目配置文档的读取
runtime/     针对 config 已解析好的值执行一次运行
```

> **目标(M7、M8、M9)** 只有四块行为值得独立成文件:`termination.ts`(终止原因)、`scope.ts`(范围
> 判定)、`evidence.ts`(证据与信任等级)、`run-record.ts`(审计记录)。`evidence.ts` 与 `scope.ts`
> 已落地;`executor.ts` 继续做阶段编排者。事件总线与独立 Monitor **暂不引入**:它们会变成没有行为
> 的空壳,而本仓库已经因为同样的理由移除过一个算法目录(见[文档规范](../CONVENTIONS.md) §3)。

## 9. 边界

Runtime **不负责**:

* 训练模型、Prompt 自动优化、Memory、RAG、Multi-Agent 框架、MCP 工具生态、模型路由;
* 决定代码怎么写,也不解释所有代码语义——那属于 Agent、规则实现与 Evidence Provider;
* 判断视觉美观或主观风格;
* 默认调用模型:语义治理按需触发,且由 Harness 统一调度(见 [ADR-005](../decisions/ADR-005-semantic-governance.md));
* 拦截 Agent 进程内部的写入(见 §5)。

## 10. 现状与目标对照

| 能力 | 当前 | 目标 |
| ------------------ | -------------------------------------------- | ---------------------------------------------- |
| 编排阶段 | 四阶段 + 独立的 `scope` 记录 + 散落的加载/校验 | 两套词汇 + `PhaseRecord.kind`(ADR-006) |
| Preflight | 分散,没有名字 | 独立阶段,失败不启动 Agent |
| 生效配置 | 有序预设列表 | `EffectiveHarnessConfig` + provenance(M17) |
| 范围判定 | 独立阶段与独立结果字段(`ScopeRecord`) | 保持不变,纳入 RunRecord(M9) |
| 证据 | 结构化 Evidence + 四级信任等级 | 分析器产出的证据(M8 后续、M21) |
| 终止原因 | `termination` + `status` | `verdict`(ADR-006) |
| 审计记录 | 四个散落文件 | 统一 RunRecord,与 RunResult 分离(M9) |
| 超时与取消 | `agentTimeoutMs` 与取消管线已接入命令执行 | 保持不变 |
| 观察粒度 | 阶段级 | 阶段级(不变);适配器上报为可选能力 |

## 11. 相关文档

* [系统架构](./system.md) — Runtime 在四层结构中的位置
* [治理流水线](./governance.md) — 证据、审查与处置
* [Policy 设计](./policy.md) · [Verification 设计](./verification.md) · [Provider 设计](./provider.md)
* [Preset 设计](./preset.md) — 生效配置的来源
* [CLI 设计](./cli.md) — `run` / `verify` / `doctor` 的命令面
* [Core 契约](../interfaces/core.md) · [验证契约](../interfaces/verification.md)
* [ADR-006](../decisions/ADR-006-run-lifecycle.md) · [里程碑路线](../milestones/milestones.md)
