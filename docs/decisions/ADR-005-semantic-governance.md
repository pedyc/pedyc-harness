# ADR-005 — 语义治理由 Harness 调度

* **Status:** Accepted
* **Date:** 2026-09-17
* **Refines:** [ADR-003](./ADR-003-preset-as-code.md)
* **Related:** [ADR-002](./ADR-002-preset-validation-resolution.md)、[ADR-004](./ADR-004-policy-severity-rules.md)

## 1. Context

ADR-003 允许 Preset 携带代码，并把「审查定义」列为可注册的扩展点；ADR-004 定义了 Finding 的
`severity → action`。两者都没有回答三个问题：

| 问题 | 现状 |
| ------------------------------------------ | ------------------------------------------------------------ |
| 语义审查（需要模型理解）由谁执行？           | 未定义；只说 Preset 可以注册「审查定义」                     |
| 什么时候执行？每次运行都调用一次模型吗？     | 未定义；当前固定四阶段里 Reviewer 每轮都会被调用一次         |
| Preset 需要模型时，模型、凭证与网络从哪来？  | 未定义；ADR-003 只说了 Preset 不能访问网络，没说怎么满足需求 |

如果让 Preset 自己调用模型，生态会立刻分裂成 `Preset A → OpenAI`、`Preset B → Claude`、
`Preset C → Gemini`，而且 Key 归属、费用控制、网络权限、模型兼容、CI 可运行性与第三方 Preset 的
合法性验证全部失控——这正是 [ADR-002](./ADR-002-preset-validation-resolution.md) 想避免的
「不可验证的扩展」。

## 2. Decision

**Preset 只声明语义治理需求，Harness 统一调度模型。**

### 2.1 三级检查

| Level | 内容 | 执行者 | 产物 | 信任等级 |
| ----- | -------------------------------------------------------- | ---------------- | ---------------------- | ------------------------------------ |
| 0 | Policy、Scope、Diff、Typecheck、Lint、Test、Build、AST、依赖分析 | Harness | Evidence | `harness-executed` / `analyzer-derived` |
| 1 | 复杂度、文件数、依赖数、抽象深度、改动 LOC → 可解释的分数 | Harness | Evidence（分数 + 贡献项） | `analyzer-derived` |
| 2 | 结合 Task 与改动的语义判断 | Harness 调度，Provider 执行 | Findings | `review-derived` |

Level 0/1/2 **首先是证据可信度分层，其次才是成本分层**：不要让模型回答脚本能回答的问题。

### 2.2 Preset 只能声明

Preset 提供的是 `SemanticVerification` **声明**：id、触发条件、提示词路径、默认 severity、需要哪些
Evidence。声明里**没有**模型、端点与凭证——那三项由 Harness 决定。

提示词是**数据**（包内文件），不是可执行代码：可 diff、可审计、可被项目覆写。

### 2.3 触发

```text
触发 = Level 0 规则命中 OR Level 1 分数超过阈值
```

单一分数阈值不作为唯一触发条件，原因有两条：

* 会漏检——复杂度信号低但语义违规的改动正是"不能只看分数"的那一类；
* 权重与阈值若放进 Preset，Preset 就变成了**不可审计的调参器**。

分数必须可解释（哪几条事实、各贡献多少）。被触发的多条语义检查**按轮批量合成一次调用**，
调用次数由触发决定，而不是由检查条数决定。

`confidence` 与分数**都不参与判定**：模型自报的置信度属于 `agent-claimed`，只能用于排序与路由
到人工，不能用来放行。

### 2.4 模型来源：复用 Provider，不新增 LLMProvider

语义检查声明一个 role（默认 `reviewer`），由 `.harness/agents.json` 的 provider 承接；Provider 的
stdin/stdout 协议、`isCommandAllowed` 命令策略、凭证与审计路径**全部复用**。

不新增独立的 `LLMProvider` 注册表：那会让 key、网络权限、版本兼容与审计各多一条路径。也不叫
"LLMProvider"，因为承接它的适配器不一定是模型。

集中调度的直接收益：**Reviewer 独立性第一次可执行**——provider 由 Harness 选择，因此"语义审查
不得与 Coder 同源"可以成为一条可校验的约束，而不是一句建议。

### 2.5 能力清单是请求，不是自证

Preset 可以声明 `capabilities`（`filesystem` / `shell` / `network` / `semanticReview` 等），语义是
**请求**：

* deny-by-default：未声明即不允许；
* 由 Harness 在注册期授予并校验，越权在 `ACTIVE` 之前拒绝；
* 声明本身**不产生任何实际权限**——实际权限始终由 Harness 决定。

### 2.6 扩展点按「是否独占资源」分类

比"Preset 是不是代码"更可操作的分界线：

| 扩展点 | 形态 | 理由 |
| ---------------------------------------- | -------- | ------------------------------------------ |
| Evidence Provider（确定性分析器）         | 可以是代码 | 纯计算、无网络、结果可复核                 |
| 语义审查（SemanticVerification）          | 只能声明 | 需要 Harness 独占的网络、模型与凭证        |
| 项目模板与生成逻辑                        | 可以是代码 | 与治理判定无关                             |

**需要 Harness 独占资源的能力只能声明；纯计算能力可以注册代码。**

验证脚本同样受这条规则约束：Preset **不携带**可执行脚本，`requiredChecks` 仍然只指向目标项目
自己的 npm 脚本，由 Harness 在命令策略下执行。

### 2.7 预算耗尽与禁用

| 情况 | 行为 |
| ------------------------------------------ | ------------------------------------------------------ |
| 预算耗尽，语义检查为 `warning`             | 允许跳过，记为 `skipped`，并写入 Run Record            |
| 预算耗尽，语义检查为 `error`               | fail-closed：不通过                                    |
| `--semantic=disabled`                      | 显式禁用；**必须写入 Run Record 与审计**，不能静默通过 |

预算的**算术**（`maxCalls` / `maxTokens` / 阈值调参）属于[成本权衡](../tradeoffs/成本权衡.md)，
不在本 ADR 的约束范围内；本 ADR 只固定"耗尽时的语义"。

## 3. Consequences

### Positive

* 模型、凭证、费用与网络只有一条路径，Harness 可以统一控制与审计。
* 第三方 Preset 的合法性可以静态验证：声明、提示词与能力清单都是数据。
* Reviewer 独立性可校验（provider 由 Harness 选择）。
* 成本按需触发：普通任务可以 0 次模型调用。

### Negative

* Harness 多出一个 Semantic Engine：批量调用、跳过记录、预算与触发判定都要实现。
* 提示词质量成为治理质量的一部分，而它比代码更难测试。
* 跳过语义会削弱覆盖度，因此"跳过了什么"必须在审计里可见。

## 4. Alternatives

| 方案 | 为什么没选 |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Preset 自己调用模型 | 生态分裂，凭证与费用失控，第三方 Preset 无法验证 |
| 新增独立的 `LLMProvider` 注册表 | 与既有 Provider 重叠，多出两套 key、兼容与审计路径 |
| 暂不做触发，每次运行都跑语义审查 | 与「按风险增加约束」冲突，并让模型回答脚本能回答的问题 |
| 用模型的 `confidence` 直接放行 | 违反「Agent 的自我描述不是独立验证证据」 |

## 5. Core Principle

> **Preset 声明治理需求，Harness 调度治理能力，模型只是可插拔的执行资源。**
