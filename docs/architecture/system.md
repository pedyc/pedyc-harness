# 系统架构

> pedyc-harness 的整体结构:系统由哪些部分组成、各自什么时候执行、如何参与系统决策。
>
> 模块级细节见 [CLI](./cli.md)、[Policy](./policy.md)、[Preset](./preset.md)、
> [Provider](./provider.md)、[Verification](./verification.md);类型契约见
> [核心接口设计](../interfaces/README.md)。
>
> 标注约定见[文档规范](../CONVENTIONS.md):现在时陈述表示**已实现**;目标形态一律显式标注。

## 1. 系统由什么组成

```text
Project                          Harness                        Agent
├── .harness/  (治理定义)         ┌─────────┐
├── AGENTS.md                    │   CLI   │  入口:init / verify / doctor / diff / update / run
├── package.json                 └────┬────┘
└── src/  (产品代码)                  │
                                 ┌────▼─────┐
                                 │ Runtime  │  契约 · Policy · 编排 · 独立验证 · Diff · Review
                                 └────┬─────┘
                                 ┌────▼─────┐
                                 │ Provider │  Adapter:stdin 一个 JSON,stdout 一个 JSON
                                 └────┬─────┘
                                      ▼
                              Claude Code / Codex / 其他
```

四层各自的执行时机不同:

| 层 | 何时执行 | 职责 |
| -------- | ---------------------------- | -------------------------------------------------------------- |
| CLI | 用户每次调用命令时 | 参数解析、`init` 落盘 `.harness/`、`run` 编排一次任务、`doctor` 报告环境 |
| Governance Runtime | 一次 `run` 期间 | 校验契约、执行 Policy、编排 Agent、独立验证、检查改动范围、产出记录 |
| Preset | `init` / `diff` / `update` 时;代码入口在 Preset 激活前加载 | 提供技术栈相关治理规范(Policy、规则与默认级别、闸门、AGENTS.md 文本),并可通过 Extension Contract 注册实现(目标 M21) |
| Provider | Runtime 调用某个阶段时 | 把 Harness 的阶段请求翻译成具体 Agent 的调用 |

CLI 不承担治理判定,Runtime 不感知具体技术栈,Preset 不实现 Runtime,Provider 不负责验证。

**Agent Runtime**(Claude Code、Codex 等)不出现在这张表里:它属于外部世界,由 Provider 调用,不由本
项目实现。这里的「Runtime」一律指 Governance Runtime——两者的分工见
[项目目标](../项目目标.md) §一,边界判据见其原则 18、19。

Preset 提供能力,但何时使用由 Runtime 决定;判定的完整链路见[治理流水线](./governance.md)。

## 2. 分层与依赖方向

真实的依赖边由各包 `package.json` 决定:

```text
pedyc-harness (CLI) ──→ @pedyc/harness-core (Runtime)
        │
        └────────────→ @pedyc/harness-preset-*  ──→ @pedyc/harness-core
```

`@pedyc/harness-core` 是最低层,不依赖 CLI、Preset、Vue 或任何具体 Provider。注意 Preset 依赖的是
Core,**不是 CLI**——依赖结构是扇形而非链式。发布顺序与该方向一致,见 [Release](../release.md)。

因此新增一个技术栈的正确做法是新增一个 Preset:

```text
正确:  Core ← Generic Preset / Vue Preset / React Preset / …
错误:  Core ├── if vue · if react · if vite
```

Core 中不得出现任何技术栈分支。技术栈差异通过 Preset 表达,见 [Preset 设计](./preset.md)。

## 3. 一次 Run 的执行顺序

`run` 由 `packages/cli/src/run.ts` 驱动,核心循环在 `packages/core/src/runtime/executor.ts`。

编排阶段的完整词汇、观察边界与产物分离见 [Governance Runtime 架构](./runtime.md);本节只描述当前实现。

| # | 阶段 | 关键行为 | 产物 |
| - | ---------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| 1 | Intake | `normalizeTask` 归一化输入;支持 `--input` / `--prompt` / `--task` | `.harness/runs/<id>/input.json` |
| 2 | 契约校验 | 用 `input.schema.json` 校验;不合法即终止 | 失败结果 |
| 3 | 加载 Policy | 读取 `.harness/policy.json` 与 `agents.json`,校验字段 | `policy.json` 快照 |
| 4 | Planner | 规划阶段结束即产出计划,失败则整体停止 | `implementationPlan` |
| 5 | Coder | 按计划改文件;这是唯一允许修改产品的阶段 | 文件改动 |
| 6 | 验证闸门 | 逐个执行 `policy.requiredChecks` 中的 npm 脚本 | `iteration-<n>-verification.json` |
| 7 | Tester | 依据闸门结果与外部 tester 的裁定决定是否重试 | 通过 / 重试 |
| 8 | Reviewer | 检查越界改动与验收标准 | 通过 / 停止 |
| 9 | 记录 | 写出最终结果 | `output.json` |

循环性质:

- Coder 只在 Tester 未通过时重试,次数上限为 `min(input.maxIterations, policy.maxIterations)`,
  默认 3。
- Planner、Coder、Reviewer 任一失败都会直接终止,不重试。
- Reviewer 的通过条件包含范围检查:改动必须落在 `policy.allowedProductPaths` 内。
- `--dry-run` 不调用任何 Provider、不执行任何闸门、不修改产品文件,但同样输出四个阶段的记录,
  因此调用方可以用同一套输出契约消费它。

阶段状态取值为 `running` / `passed` / `failed`;一次运行的整体状态取值为 `passed` / `failed`。
不存在 `rejected`、`cancelled` 等未实现的状态。

> **目标(ADR-006)** 状态词汇扩展为三个正交概念:`termination`(循环为什么停下)、`status`(运行
> 是否走完)、`verdict`(治理结论)。规则是**文档里出现的每个状态要么有实现,要么带里程碑标记**,
> 因此解除上面这条约束必须与实现同批进行。见 [Governance Runtime 架构](./runtime.md)。

## 4. 模块职责

| 模块 | 回答的问题 | 实现 |
| ------------- | ---------------------- | --------------------------------------------- |
| Intake | 输入是什么 | `packages/core/src/runtime/intake.ts` |
| Contract | 任务要求是什么 | `config/schema.ts` + `schemas/input.schema.json` |
| Policy | 允许做什么 | `runtime/policy-engine.ts` |
| Executor | 如何推进一次 Run | `runtime/executor.ts` |
| Adapter | 如何调用 Agent | `runtime/provider-runner.ts` |
| Diff | 实际改了什么 | `runtime/diff-inspector.ts` |
| Validator | 是否通过独立检查 | `config/schema.ts` + `runtime/approval-gate.ts` |
| Review | 是否满足要求 | `runtime/approval-gate.ts` + Reviewer 阶段 |
| Run Record | 如何留下证据 | `.harness/runs/<run-id>/` |

Policy 当前的执行能力需要准确理解(`runtime/policy-engine.ts` 共三个函数):

- `validatePolicy` 校验字段形状,`allowedProductPaths` 是唯一必填项。
- `findOutOfScopeChanges` 用**前缀匹配**比对改动路径与 `allowedProductPaths`。
- `isCommandAllowed` 对 `allowedAgentCommands` 做成员判断。

`protectedPaths`、`forbiddenCommands`、`agentTimeoutMs` 已被 schema 接受但**尚未强制执行**。
细节与字段含义见 [Policy 设计](./policy.md)。

## 5. 新增能力应该进入哪里

在没有明确归属时,按下面这张表路由,而不是往 Runtime 里加分支:

| 这个功能是在… | 归属 |
| -------------------------------------- | ------------------------------------------ |
| 增强 Agent 自身能力 | 不属于 Harness(交给 Agent) |
| 约束 Agent 能做什么 | Policy |
| 验证 Agent 的结果 | Verification |
| 检查实际改动 | Diff / Scope |
| 记录执行过程 | Trace / Audit |
| 表达某个技术栈的规则 | Preset |
| 适配某个 Agent 的调用方式 | Provider |
| 描述配置如何声明、继承与合成 | Manifest / Preset Resolver / Config Resolver |

## 6. 可信执行模型

整个系统的信任边界只有一条规则:

> **Agent 的自我描述不是独立验证证据。**

```text
Agent ──self-report──→ Agent 的自述
                            │ 不直接信任
                            ▼
                   Harness 独立观察
                    ├── 实际 Diff
                    └── 独立执行的闸门
                            ▼
                    Review(含范围检查)
                            ▼
                        RunResult
```

因此 Harness 必须自己执行验证并记录结果,而不是采信 Agent 的"已完成"。当前记录的每条闸门结果是
`VerificationCheck { command, result: 'pass' | 'fail', details }`,其中 `details` 取 stderr 或
固定成功文案。更完整的证据模型(退出码、stdout、耗时、时间戳)属于**目标形态**,见
[Verification 设计](./verification.md)。

## 7. 配置从哪里来

配置由一个独立的**配置层**解析(`packages/core/src/config/`),它拥有所有对项目配置文档的读取:

```text
.harness/harness.json (Manifest)
        ↓
resolvePresets            预设解析:递归 extends、去重、环检测
        ↓
policy / agents           来自预设,或项目自己的 .harness/ 文档
        ↓
LoadedHarnessConfig       含 sources:每个值是从哪读到的
```

`.harness/harness.json` 是**入口配置**,不是全部配置:它只回答「这个项目加载哪些配置」。`run` 与
`verify` 都不再直接读 `.harness/policy.json`——配置在**任何阶段执行之前**解析完毕,一个无法解析的
项目绝不会被部分执行,也不会在与 Agent 交互到一半时才发现配置有问题(退出码 5)。

解析结果带 `sources`(`kind` / `location` / `active`),`doctor` 会把它们打印出来。这是刻意的:
一次运行实际用到哪些值原本不可见,而**回退到内置默认值与刻意配置在外观上完全一样**。

> **目标(M17)** 把多个来源**合成**为 `EffectiveHarnessConfig`——字段级合并语义、安全约束的
> deny-wins、provenance 随 Run Record 保存——**尚未实现**。当前解析出的是一个有序的预设列表
> (依赖在前),「更具体者胜出」目前只体现在 `instruction` 的选取上。

`.harness/` 的两类内容必须分开:治理定义(`harness.json`、`policy.json`、`agents.json`、schema,
应提交)与运行时状态(`runs/`,应 gitignore)。

## 8. 边界

**Runtime 不负责**:训练模型、Prompt 自动优化、Memory、RAG、Multi-Agent 框架、MCP 工具生态、
模型路由、以及 Vue / React 这类具体技术栈规则。这些要么属于 Agent,要么属于 Preset,要么不属于
本项目。

**Preset 与 Runtime 的边界**:Preset 只提供默认能力与治理规范,不实现 Runtime,也不负责编排。

**Provider 与 Runtime 的边界**:Provider 只做调用翻译。Policy、Diff、Verification、Review、Audit
全部留在 Runtime,不因某个 Agent 的特殊能力而改变核心领域模型。调用契约见
[Provider 设计](./provider.md)。

## 9. 相关文档

- [Governance Runtime 架构](./runtime.md) · [治理流水线](./governance.md)
- [CLI 设计](./cli.md) · [Policy 设计](./policy.md) · [Preset 设计](./preset.md)
- [Provider 设计](./provider.md) · [Verification 设计](./verification.md)
- [核心接口设计](../interfaces/README.md) · [Core 契约](../interfaces/core.md)
- [项目目标](../项目目标.md) · [里程碑路线](../milestones/milestones.md) · [Release](../release.md)
- [文档规范](../CONVENTIONS.md)
