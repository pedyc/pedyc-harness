# Preset 架构

> Preset 是可复用、可继承、可组合的 Harness 治理规范(Governance Specification)。它定义特定技术栈、
> 领域或组织环境下,Agent 任务应遵守的 Contract、Policy、Rules、Verification 与 Agent Guidance。
>
> Preset 不属于 Core,也不让 Core 感知具体技术栈或业务领域。
>
> **本文同时包含现状与目标。** §7(npm 分发与 `preset.json`)、§8(依赖图与解析)以及 §14 的 Init
> 部分**已经实现**;配置层级、字段级合并语义、安全模型与 provenance(§9–§11、§13)仍属**目标**。
> §15 给出逐项对照,契约形状见 [Preset 契约](../interfaces/preset.md)。

## 1. 定位

pedyc-harness 负责定义、执行并验证治理模型;Preset 提供**具体场景下的治理规范**:

```text
Core     →  通用治理能力
Preset   →  具体治理规范
```

`@pedyc/harness-preset-vue` 描述 Vue 项目该如何治理,`@pedyc/harness-preset-motion` 描述动效代码应
满足什么规范,`@acme/harness-preset` 描述公司项目应遵守的组织规则。Core 不需要理解 Vue、Motion、
Security 这些词,它只理解统一的 Harness Domain Model。

## 2. Preset 不只是 Default Config

把 Preset 理解为「一组默认配置」过于狭窄。它描述的是**「什么样的任务执行与最终结果符合该规范」**:

| 治理层 | 内容 |
| ---------------- | -------------------------- |
| Contracts | 任务应满足的契约模板 |
| Policies | 允许与禁止做什么 |
| Rules | 领域规则 |
| Verification | 该领域如何验证 |
| Agent Guidance | 面向 Agent 的规范说明 |
| Dependencies | 继承与组合关系 |

以 `motion-preset` 为例,它可以规定动画时长范围、easing 约束、可用的动画 API、禁止的动画模式、
reduced-motion 要求与动效验证规则。Agent 依据这些规范生成代码,Harness 则进一步判断生成结果是否
符合规范。因此 Preset 的实际治理能力由三部分共同构成:

```text
LLM Guidance  +  Machine-enforced Policy  +  Independent Verification
```

## 3. 三种主要类型

Preset 不应该只按技术栈分类:

| 类型 | 描述什么 | 例子 | 典型内容 |
| ---------------- | -------------------- | ------------------------------ | ------------------------------------------------------------ |
| Technology Preset | 具体技术栈的治理规范 | `@pedyc/harness-preset-vue` | Project Rules、Typecheck 与 Build 验证、框架 Guidance、项目模板 |
| Domain Preset | 某个工程领域的规范 | `@pedyc/harness-preset-motion` | 领域规则,以及该领域应该如何验证 |
| Organization Preset | 组织、团队或公司级规范 | `@acme/harness-preset` | 禁止 push、禁止修改 CI、必须通过安全检查 |

关键在于 **Domain Preset 与技术栈正交**:motion-preset 不关心项目是不是 Vue,它可以同时用于 Vue、
React、Svelte 与原生 Web。Organization Preset 则通常按 Company → Team → Project 逐层继承。

## 4. Composition

一个项目可以同时使用多个 Preset:

```text
projectA
├── Vue Preset
├── TypeScript Preset
├── Motion Preset
├── Accessibility Preset
└── Company Preset
```

它们经 Resolution 合成 Effective Governance,再分发给 Runtime 的三个消费面:

```text
Presets → Preset Resolution → Effective Governance
                                      │
                        ┌─────────────┼─────────────┐
                        ↓             ↓             ↓
                     Contract       Policy     Verification
                        └─────────────┼─────────────┘
                                      ↓
                                    Agent
```

Preset 是治理体系的**规范来源层**。

## 5. Preset 与其余组件的边界

Preset 提供规范,Runtime 提供机制。这条分工贯穿所有组件:

| 组件 | Preset 提供 | Runtime 负责 |
| -------------- | ------------------------------------------ | ---------------------------------------------- |
| Agent | Agent Guidance(规范说明) | 调用 Agent |
| Contract | Contract 模板 | 最终 Task Contract 仍属于任务本身 |
| Policy | 领域策略(允许/禁止的 API 与文件范围) | 强制执行与判定 |
| Verification | 该领域**应该如何验证** | 何时执行、如何执行、如何记录证据、如何参与 Gate |

两条必须守住的边界:

- **Agent Guidance 不能替代机器可执行约束。** 规范写在 Guidance 里,Agent 可能遵守也可能不遵守;
  因此每条规范都应尽可能有对应的、可机器验证的约束。
- **Preset 不替代 Task Contract。** 具体任务的目标与验收标准属于任务,不属于 Preset。

## 6. Runtime 的边界

Runtime 不应该直接理解 Preset:

```ts
if (preset === "vue") { ... }            // 错误
if (project.type === "motion") { ... }   // 错误
```

正确的关系是 `Preset → Resolver → Effective Governance → Runtime`。Runtime 只消费合成结果,不需要
知道某条规则来自哪个 npm 包、是 Vue 还是 Motion Preset、是 Company Preset 还是 Project Config——
这些信息由 Provenance 单独保留(见 §13)。

Runtime **不负责** Preset Discovery、Package Management、Dependency Resolution 与 Version
Management,这些属于配置与 Resolution 层。

## 7. Preset Package 与 Manifest

Preset 使用 npm package 分发,它是治理规范的分发单元,**不是 Runtime Plugin**:

```text
@acme/harness-preset/
├── package.json
├── preset.json          # Manifest:继承关系与本包提供的资源
├── contracts/
├── policies/
├── verification/
├── rules/
└── guidance/
```

`preset.json` 声明继承与各类资源的相对路径:

```json
{
  "name": "@pedyc/harness-preset-motion",
  "extends": ["@pedyc/harness-preset-web"],
  "contracts": ["./contracts/animation.json"],
  "policies": ["./policies/motion.json"],
  "verification": ["./verification/motion.json"],
  "rules": ["./rules/motion.md"],
  "guidance": ["./guidance/generation.md"]
}
```

相对路径只能引用当前 Preset Package 内的资源。版本不由 Preset Reference 管理,而由 `package.json`
与 lockfile 承担,避免同一版本号出现在三处(见 [Release](../release.md))。

## 8. Dependency Graph 与 Resolution

Preset 支持多层继承与组合,因此依赖模型是 **DAG**:

```text
base
 ├── web ───────── vue
 ├── accessibility
 └── security ──── acme
```

允许菱形依赖(`A → B`、`A → C`、`B → D`、`C → D`),禁止环(`A → B → C → A`)。

解析流程:

```text
Root Presets → Preset Resolver → Dependency Graph → Cycle Detection
  → Topological Sort → Preset Validation → Governance Composition
  → Config Resolution → Effective Governance
```

Resolver 必须做到:递归加载依赖、去重、检测循环、生成拓扑顺序、验证 Preset、生成 Effective
Governance。**每个 Preset 在一次 Resolution 中只加载一次**,依赖始终先于使用它的 Preset:

```text
project ├── vue    → web
        ├── motion → web
        └── company → security

解析顺序:web → vue → motion → security → company → project
```

算法选择记录在 [ADR-001](../decisions/ADR-001-preset-resolution.md)与
[ADR-002](../decisions/ADR-002-preset-validation-resolution.md)。

## 9. 配置层级

Preset Resolution 与 Project Configuration 是两个概念。配置按层组织,每一层都可以引用 Preset:

| 层级 | 可以引用 |
| --------------------- | ---------------------------------- |
| Global / Organization | company-preset |
| Team | frontend-preset |
| Project | vue-preset、motion-preset |
| Task | Task Contract |

最终 `Presets + Config Layers + Task Contract → Effective Governance`。

## 10. 配置合成

**不能使用无差别的 `deepMerge`。** 每个治理字段必须声明自己的合并语义:

| Strategy | 语义 | 示例 |
| ------------ | -------------- | --------------------- |
| `replace` | 高优先级替换 | 普通默认值 |
| `append` | 追加并去重 | rules、protectedPaths |
| `merge` | 按 key 合并 | named definitions |
| `deny-wins` | Deny 优先 | command policy |
| `immutable` | 不允许覆盖 | 安全不变量 |

## 11. 安全模型

Preset 组合必须区分三类内容:普通默认值、安全约束(Constraint)与不可变不变量(Invariant)。

普通默认值的优先级是 `Task > Project > Team > Organization > Global`,可以被更高层覆盖。安全约束
相反:**只能收紧,不能放宽。** 例如 Generic Preset 允许 `git push`,Company Preset 禁止它,合并结果
恒为 `DENY`——即使更高层的普通配置写了 `allow git push`,也不能解除 Company 的安全约束。

## 12. Agent Guidance 与可验证约束

Preset 可以提供面向 Agent 的规范说明,但 Guidance 只是第一层。motion-preset 可以写出「优先使用
transform 与 opacity」「时长保持在规定范围」「必须考虑 reduced-motion」,而 Agent 可能遵守,也可能
没有遵守。

因此每条规范都应尽可能配套一条机器可验证的约束。**规范从「提示 Agent」演进为「可机器验证的约束」,
是这套设计最重要的方向。**

## 13. Provenance

Effective Governance 必须保留来源信息,否则无法回答「为什么这条 Policy 生效」:

```text
Policy:  command = git push, result = DENY
Source:  @acme/harness-preset → policies/security.json
```

来源随 Run Record 一起保存,使一次运行的判定依据可以被复核。

## 14. Preset 与 Init / Update

`init` 的职责是选择 Preset 并生成项目配置(`harness init --preset vue`),未来可以叠加多个
(`--preset vue --preset motion --preset company`)。幂等规则必须满足:

| 情况 | 行为 |
| ---------------- | -------------- |
| 不存在 | 创建 |
| 存在且相同 | 跳过 |
| 存在且不同 | 保留并提示 |
| `--force` | 显式覆盖 |

**Preset 本身不负责 Init**,它只提供内容。

Update 必须与项目配置更新分离:项目可能已经改过 `.harness/harness.json`,而 Preset 版本在升级
(如 1.2.0 → 1.3.0),因此不能简单覆盖文件,需要 Preset Version → Migration → Conflict Detection →
Project Update 这条链路。

## 15. 当前实现与目标

当前实现是:

```text
packages/core/src/contracts/{preset,harness}.ts
packages/core/src/config/           ← 清单、加载、校验、预设解析
packages/cli/src/presets.ts         ← 约定式包名展开与安装,没有预设表
packages/preset-generic             ← 数据包:preset.json / policy.json / agents.json / AGENTS.md
packages/preset-vue
harness init --preset <name>
harness list-presets
```

也就是说 Preset 已经从 **Default Capability Bundle** 变成**声明式的数据包**,但还没有成为完整的
Governance Specification:它可以被发现、安装、继承与解析,而多个来源尚未被**合成**。目标结构
`harness.json → Preset Resolver → DAG → Preset Composition → Config Resolution → Effective
Governance → Runtime` 的前三段已经实现,后两段(M17)没有。

能力演进逐项对照:

| 能力 | 当前 | 目标 |
| ---------------- | ------------------------------------------------------ | ---------------------------------- |
| Preset 发现 | **约定式包名 + npm 安装**(CLI 无静态表) | Package Registry |
| Preset 类型 | 技术栈为主 | Technology / Domain / Organization |
| Preset 继承 | **DAG:`extends` + 去重 + 环检测** | DAG + 拓扑序 |
| Contract | 基础 | Preset Contract |
| Policy | 预设提供一份 policy 文档 | Governance Policy |
| Verification | 默认 Check | Domain Verification |
| Agent Guidance | **预设的 instruction 文件**(`init` 据此播种 `AGENTS.md`) | Structured Guidance |
| 配置入口 | **`.harness/harness.json`** | `harness.json` |
| 合并语义 | 未定义——解析结果是有序列表,不是合并后的配置 | 字段级 Merge Strategy |
| 安全约束 | 未实现 | Immutable / Deny-wins |
| Effective Config | 未实现 | Effective Governance |
| Provenance | 部分:`LoadedHarnessConfig.sources` 报告来源 | 完整来源追踪随 Run Record 保存 |

`preset.json` 的字段与 `ResolvedPreset` 的形状见 [Preset 契约](../interfaces/preset.md)。

## 16. 设计原则

1. Preset 是 Governance Specification,而不仅是默认配置。
2. Preset 不属于 Core。
3. Core 不感知具体技术栈、领域或组织。
4. Preset 可以提供 Contract、Policy、Rules、Verification 和 Agent Guidance。
5. Preset 可以是 Technology、Domain 或 Organization Preset。
6. Preset 可以组合和继承。
7. Preset Dependency 必须形成 DAG。
8. Resolver 必须去重并检测循环。
9. 不同配置字段必须使用明确的 Merge Strategy。
10. 安全约束只能收紧,不能被普通 Override 解除。
11. Runtime 只消费 Effective Governance。
12. Runtime 不负责 Preset Resolution。
13. Preset 定义 Verification Specification,Runtime 负责执行 Verification。
14. Agent Guidance 不能替代机器可执行约束。
15. Effective Governance 必须保留 Provenance。
16. Preset Package 是治理规范的分发单元,而不是 Runtime Plugin。
17. Preset 不负责 Runtime orchestration。
18. Preset 不替代 Task Contract。
19. Project Configuration 与 Preset 必须保持概念分离。
20. **规范必须尽可能从「提示 Agent」演进为「可机器验证的约束」。**

## 17. 相关文档

- [Preset 契约](../interfaces/preset.md) — 当前实现的字段与函数形状
- [Policy 架构](./policy.md) · [Verification 架构](./verification.md) · [系统架构](./system.md)
- [ADR-001](../decisions/ADR-001-preset-resolution.md) ·
  [ADR-002](../decisions/ADR-002-preset-validation-resolution.md)
- [里程碑路线](../milestones/milestones.md) · [Release](../release.md)
