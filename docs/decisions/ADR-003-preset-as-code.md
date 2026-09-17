# ADR-003 — Preset 是代码

* **Status:** Accepted
* **Date:** 2026-09-17
* **Refines:** [ADR-002](./ADR-002-preset-validation-resolution.md)

## 1. Context

M16 已实现 Preset 的 npm 分发、`preset.json` 清单与 `extends` 的 DAG 解析。当前 Preset 是**纯数据**：
清单只能指向包内的 `policy.json`、`agents.json`、`AGENTS.md`，`preset.schema.json` 甚至把这一点写进
描述——"A preset is data, not code"。

这在三类需求上直接触顶：

| 想要的 Preset 能力               | 纯数据下的可行做法              | 代价                                       |
| -------------------------------- | ------------------------------- | ------------------------------------------ |
| 自定义确定性分析器（依赖、AST、CSS） | 只能写进 Provider 或 Core       | Provider 变成治理实现，Core 被技术栈污染   |
| 结构化审查规则与提示词           | 无处声明，项目只能自己写 AGENTS.md | 审查不可复用、不可审计                     |
| 生成逻辑（按技术栈补文件、改脚本） | 只能靠 `init` 的静态模板        | 复杂 Preset 无法表达                       |

结论：纯数据 Preset 的扩展性上限就是「换几份 JSON」。用户一旦需要复杂 Preset，只能绕开 Preset 机制，
把逻辑塞进 Provider 或自己的脚本里——两者都在治理链之外。

ADR-002 §4 已经写过「Preset 可以提供 Domain-specific Validator，但必须遵守 Harness 定义的 Validator
Contract」。本 ADR 把这句话从「Validator」收敛为完整的 **Extension Contract**。

## 2. Decision

**Preset 可以是代码。** Preset 包通过清单声明入口模块，Harness 在 Preset 进入 `ACTIVE` 之前加载并
调用它；Preset 只能通过 Harness 定义的 Extension Contract 注册能力。

### 2.1 清单与入口

`preset.json` 增加入口声明，入口模块导出一个 `setup` 函数，接收 Harness 提供的受限上下文并注册能力。
字段名与最终形状以 [Preset 契约](../interfaces/preset.md) 为准；纯数据 Preset 仍然合法，没有入口时
行为与今天一致。

### 2.2 Extension Contract（封闭枚举）

Preset 只能注册下列能力，注册面之外没有入口：

| 扩展点       | 注册物                                             | 消费方                     |
| ------------ | -------------------------------------------------- | -------------------------- |
| 治理默认值   | Policy 默认值、规则声明（rule id 与默认严重级别）   | Policy Evaluator           |
| 验证定义     | `requiredChecks` 与检查定义                         | 验证闸门                   |
| 证据提供者   | Evidence Provider（确定性分析器）                   | Evidence 层                |
| 审查定义     | Reviewer 提示词与期望的 findings 结构               | Review 层                  |
| 项目模板     | 模板、`AGENTS.md` 指令、skills、agents 默认值        | `init` / `diff` / `update` |

三层治理的含义见 [治理流水线](../architecture/governance.md)，规则严重级别的语义见
[ADR-004](./ADR-004-policy-severity-rules.md)。

### 2.3 Preset 代码不能做什么

* 不能调用 Agent Provider；
* 不能决定 Gate 结果（处置由 Policy 声明，不由 Preset 决定）；
* 不能写 Run Record；
* 不能直接获得文件系统与网络能力，只能使用 Harness 通过上下文显式提供的受限能力；
* 不能依赖注册顺序：注册结果不得因加载顺序不同而不同。

### 2.4 可撤销与可归属

每次注册必须带稳定 id，并记录 provenance（`package@version` + 扩展点 + id），供 M9 的 Run Record 使用。
注册冲突在 `VALIDATE` 阶段报错，**不允许后注册者静默覆盖前者**：项目与更高层 Preset 的覆盖发生在
配置合并阶段（deny-wins），而不是靠加载顺序。

### 2.5 生命周期

ADR-002 的生命周期新增两个阶段：

```text
LOADED
  ↓
SCHEMA_VALID
  ↓
RESOLVED
  ↓
VALIDATED
  ↓
CODE_LOADED        ← 新增：解析并加载入口模块
  ↓
REGISTERED         ← 新增：校验注册面、id 冲突与能力边界
  ↓
COMPATIBLE
  ↓
ACTIVE
```

任一阶段失败都不得进入 `ACTIVE`。代码只在 `CODE_LOADED` 之后执行，因此 Schema 不兼容、依赖缺失、
路径越界与清单冲突仍**在任何 Preset 代码运行之前**暴露。

## 3. Trust Model

代码在 Harness 进程内执行，因此：**安装一个 Preset 等于授权它在 Harness 进程内运行代码。**

据此逐层建立信任：

* Preset 的**声明**（默认值、规则严重级别）默认不被信任：安全约束仍然只能收紧，不能被 Preset 放宽，
  见[项目目标](../项目目标.md) 原则 13。
* Preset 的**代码**不在能力上被信任：它只能调用 Extension Contract 暴露的注册面。
* `peerDependencies` 承担与 `pedyc-harness` 的版本兼容声明（两个官方 Preset 目前尚未声明，见
  [Release](../release.md)）。

不引入隔离宿主（子进程 / Worker）是本次决定的一部分，理由见第 5 节。

## 4. Consequences

### Positive

* 复杂 Preset 可表达：分析器、审查规则、生成逻辑随 npm 包复用。
* Core 仍然不感知技术栈：Preset 贡献的是实现，Harness 只按扩展点 id 消费。
* Provider 不再被迫承担治理实现。
* 治理链扩展了但未失控：注册面是封闭枚举，且每一项都可归属、可审计。

### Negative

* Extension Contract 成为新的兼容性契约，需要自己的版本策略。
* 注册面与 provenance 让审计面变大（M9 的记录格式需要容纳它）。
* Preset 代码执行属于运行期行为，加载失败必须在 `ACTIVE` 之前暴露，否则项目会得到"半生效"的治理配置。

## 5. Alternatives

| 方案                                                                 | 为什么没选                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 保持纯数据 Preset + 内置分析器注册表（Harness 实现 analyzer，Preset 只声明参数） | 扩展性上限变成"内置多少就有多少"，第三方无法贡献分析器，与目标冲突        |
| Preset 代码运行在隔离宿主（子进程 / Worker / 远程）                   | 隔离成本与复杂度高；当前威胁模型是"已安装的 npm 包"，与 Provider 适配器同级；先把契约定稳 |
| Preset 做成全功能插件（可替换 Runtime 任意部件）                      | 取消 Core 与 Preset 的边界，治理链无法审计                                 |

## 6. Core Principle

> **Preset 提供能力，Harness 决定谁在什么时候使用它。Preset 是代码，但代码只能进入封闭的
> Extension Contract。**
