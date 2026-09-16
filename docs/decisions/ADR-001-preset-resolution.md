# ADR-001 — Preset Resolution 使用 DFS

* **Status:** Accepted
* **Date:** 2026-09-16
* **Refined by:** [ADR-002](./ADR-002-preset-validation-resolution.md)

## 1. Context

Preset 规划支持多层继承,因此需要一个解析算法,同时完成三件事:遍历继承关系、对重复的 Preset 去重、
检测循环依赖。这三件事必须在同一次解析中完成,而不是分三轮。

## 2. Decision

使用**深度优先搜索(DFS)**解析继承关系:递归加载每个 Preset 的依赖,用 `visiting` / `resolved`
两个集合分别记录"正在访问"与"已完成",并在遇到 `visiting` 中的节点时报循环错误。

## 3. Reasons

1. 实现简单,不需要额外的数据结构;
2. 遍历过程中可以自然检测循环——不需要先构建完整的图再检查;
3. 适合当前的 Preset DAG 规模。

## 4. Alternatives

| 备选 | 未采用的原因 |
| ---------------- | ------------------------------------------------------------ |
| Topological Sort | 以入度队列实现排序,需要先构建完整的图与入度表,比 DFS 多一轮 |
| BFS | 不天然携带"正在访问"的路径信息,循环报错时难以给出完整路径 |

## 5. Consequences

- 需要维护 `visited` 状态,并在递归返回时清理 `visiting`;
- 可以加入 memoization 避免重复解析;
- 报错信息需要携带完整路径(如 `A → B → C → A`),而不是抛出栈溢出。

## 6. 与 ADR-002 的关系

ADR-002 采纳「DAG + Topological Sort」作为解析策略,并补充 Preset 的校验与信任模型。两者**不冲突**:

> **DFS 是遍历机制,拓扑序是它的输出。** DFS 的后序访问顺序本身就是一个合法的拓扑序。

ADR-001 把 Topological Sort 列为备选,指的是"以入度队列实现排序"这一替代**实现方式**,而不是把
拓扑序本身当作备选结果——ADR-002 描述的正是最终需要的**结果**(存在拓扑序、且拒绝环),两者是可以
叠加的层次。

## 7. 当前状态

> **未实现。** 当前 `packages/cli/src/presets.ts` 是一张两个表项的静态 `Map`,不存在继承、依赖图、
> 循环检测或拓扑排序。

本 ADR 记录的是**规划决定**,不是现状。阶段与依赖顺序见[里程碑路线](../milestones/milestones.md)。

## 8. 相关文档

- [ADR-002 — Preset Validation & Resolution](./ADR-002-preset-validation-resolution.md)
- [Preset 架构](../architecture/preset.md) — 目标形态下的解析与合成
- [Preset 契约](../interfaces/preset.md) — 当前实现
