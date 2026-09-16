# pedyc-harness Documentation

> pedyc-harness 设计与工程文档地图。

## 项目

* [项目目标](./项目目标.md) — 项目愿景、问题与边界
* [Milestones](./milestones.md) — 项目阶段与进度
* [Release](./release.md) — 发布流程与版本规范

## 架构

* [核心架构](./architecture/system.md.md) — 系统整体架构与模块关系
* [Preset 设计](./architecture/preset.md.md) — Preset 模型、继承与配置解析
* [Policy 设计](./architecture/policy.md.md) — Policy 模型与策略执行
* [CLI 设计](./architecture/cli.md) 
* [Provider 设计](./architecture/provider.md.md) — Provider 抽象与扩展机制
* [Verification 设计](./architecture/Verification设计.md) — 执行结果验证机制

## 算法

算法文档描述系统内部的核心计算与执行过程。

* [算法总览](./architecture/algorithms/README.md)
* [01 Graph](./architecture/algorithms/01-graph.md) — 图结构、依赖与遍历
* [02 Config Resolution](./architecture/algorithms/02-config-resolution.md) — 配置解析与合并
* [03 Policy Evaluation](./architecture/algorithms/03-policy-evaluation.md) — Policy 求值
* [04 Execution](./architecture/algorithms/04-excution.md) — 执行流程与调度
* [05 Verification](./architecture/algorithms/05-verification.md) — 结果验证
* [06 Evidence & Audit](./architecture/algorithms/06-evidence-audit.md) — 证据与审计

## 接口

* [核心接口设计](./interfaces/README.md) — 核心类型与模块契约
* [CLI接口](./interfaces/cli.md) — CLI 命令与交互
* [Policy接口](./interfaces/policy.md)
* [Providr接口](./interfaces/provider.md)
* [Preset接口](./interfaces/preset.md)
* `interfaces/` — 后续拆分后的模块接口定义

## 决策

`decisions/` — Architecture Decision Records（ADR）
* [决策总览](./decisions/README.md)
* [preset策略](./decisions/ADR-001-preset-resolution.md)

记录重要架构选择及其原因，例如：

* Preset Resolution 策略
* Config 优先级
* Policy 执行时机
* Provider 抽象
* Verification 边界

## 权衡

* [成本权衡](./成本权衡.md) — 性能、复杂度、成本与可维护性的设计权衡
* `tradeoffs/` — 后续拆分后的专题权衡分析

## 归档

`archived/` 保存已经废弃或被替代的历史设计，仅用于追踪架构演进。

* [Preset 进阶设计](./archived/preset进阶设计.md)
* [算法设计原始文档](./archived/算法设计原始文档.md)
* [项目架构进阶设计](./archived/项目架构进阶设计.md)

---

## 文档关系

```text
项目目标
   ↓
架构
   ↓
算法 ──→ 接口
   ↓
决策 ←── 权衡
   ↓
Milestones / Release
   ↓
Archived
```

> **原则：README 只负责导航，具体设计进入对应文档。**
