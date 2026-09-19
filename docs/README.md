# pedyc-harness Documentation

> pedyc-harness 设计与工程文档地图。
>
> 本文件只负责导航,具体设计进入对应文档。文档的书写与检查规则见文档规范。

## 开始

* [从零接入 Harness](./getting-started.md) — 端到端走查:接入、选预设、声明配置、跑一次
* [迁移到 1.2.0](./migrating-to-1.2.0.md) — 从「只有 policy.json」迁移到 `harness.json`,以及不迁移时的行为

## 规范

* [文档规范](./CONVENTIONS.md) — 目录语义、标题层级、链接与「当前/目标」标记约定
* [核心概念](./核心概念.md) — 术语表：每个概念的成熟状态与真实实现名

## 项目

* [项目目标](./项目目标.md) — 项目愿景、问题与边界
* [里程碑总览](./milestones/README.md) — `milestones/` 的语义
* [Milestones](./milestones/milestones.md) — 项目阶段、状态与依赖顺序
* [Release](./release.md) — 构建、版本、发布闸门与流程

## 架构

描述系统结构:是什么?什么时候执行?如何参与系统决策?

* [架构总览](./architecture/README.md) — `architecture/` 的语义
* [系统架构](./architecture/system.md) — 系统结构、分层与可信执行模型
* [Governance Runtime 架构](./architecture/runtime.md) — 编排阶段、观察边界、终止与产物
* [Preset 设计](./architecture/preset.md) — Preset 治理规范、继承与配置解析
* [Policy 设计](./architecture/policy.md) — Policy 模型与执行边界
* [CLI 设计](./architecture/cli.md) — 命令、参数与项目初始化
* [Provider 设计](./architecture/provider.md) — Agent Adapter 与扩展机制
* [Verification 设计](./architecture/verification.md) — 独立验证与证据
* [治理流水线](./architecture/governance.md) — Evidence → Review → Gate 三层治理链路

## 接口

接口契约:类型、签名与模块边界。

* [接口总览](./interfaces/README.md) — 模块对应关系与阅读约定
* [Core 契约](./interfaces/core.md) — 导出面与 task / run / schema / 进程 / 快照契约
* [CLI 接口](./interfaces/cli.md) — CLI 命令与交互
* [Policy 接口](./interfaces/policy.md)
* [Provider 接口](./interfaces/provider.md)
* [Preset 接口](./interfaces/preset.md)
* [Verification 接口](./interfaces/verification.md)

## 决策

记录重要架构选择**及其原因**(ADR)。目录语义见 [决策总览](./decisions/README.md)。

* [ADR-001 Preset Resolution](./decisions/ADR-001-preset-resolution.md)
* [ADR-002 Preset Validation & Resolution](./decisions/ADR-002-preset-validation-resolution.md)
* [ADR-003 Preset 是代码](./decisions/ADR-003-preset-as-code.md)
* [ADR-004 Policy 严重级别规则层](./decisions/ADR-004-policy-severity-rules.md)（已被 ADR-008 取代）
* [ADR-005 语义治理由 Harness 调度](./decisions/ADR-005-semantic-governance.md)
* [ADR-006 Run 生命周期与观察层边界](./decisions/ADR-006-run-lifecycle.md)
* [ADR-007 规则种类与可执行约束](./decisions/ADR-007-rule-kinds-and-constraints.md)
* [ADR-008 Policy 的范围与推迟的规则处置层](./decisions/ADR-008-policy-scope-and-deferred-rule-disposition.md)

## 权衡

* [权衡总览](./tradeoffs/README.md) — `tradeoffs/` 的语义
* [成本权衡](./tradeoffs/成本权衡.md) — 性能、复杂度、成本与可维护性的设计权衡

## 归档

保存已经废弃或被替代的历史设计,**非规范**,仅用于追踪架构演进。目录语义见
[归档总览](./archived/README.md)。

* [Preset 进阶设计](./archived/preset进阶设计.md)
* [算法设计原始文档](./archived/算法设计原始文档.md)
* [项目架构进阶设计](./archived/项目架构进阶设计.md)
* [算法设计(已归档)](./archived/algorithms/README.md) — 当时规划但从未构建的核心算法

---

## 文档关系

```text
项目目标
   ↓
架构
   ↓
接口
   ↓
决策 ←── 权衡
   ↓
Milestones / Release
   ↓
Archived
```
