> **本文是历史设计材料,描述的是尚未实现的系统,不是规范。**
> 这些算法当时被规划但从未构建;现行契约见 [Core 契约](../../interfaces/core.md)、
> [Policy 契约](../../interfaces/policy.md) 与 [验证契约](../../interfaces/verification.md)。

# Harness Algorithm Architecture

> `pedyc-harness` 的算法设计总览。
>
> 本目录描述 Harness Runtime 中涉及的核心算法、数据结构、复杂度以及它们与 Core 模块之间的关系。

---

## 1. 设计目标

Harness 的算法设计主要服务于三个目标：

1. **Correctness** — 保证 Policy、Preset、Verification 等核心机制行为正确。
2. **Determinism** — 相同输入和相同配置应产生可预测、可复现的结果。
3. **Scalability** — 在 Preset、Policy、Verification 数量增长后保持可接受的性能。

算法设计不追求算法数量，而追求：

> 用尽可能少的通用基础设施支撑 Harness 的核心治理能力。

---

## 2. 算法分层

Harness 算法分为四层。

```text
L3  Governance Semantics
    ├── Deny-Wins
    ├── Approval
    ├── Evidence
    └── Audit

L2  Harness Algorithms
    ├── Preset Resolution
    ├── Policy Evaluation
    ├── Verification Scheduling
    └── Task Execution

L1  General Algorithms
    ├── DFS
    ├── BFS
    ├── Topological Sort
    ├── Hash
    ├── Diff
    └── Memoization

L0  Data Structures
    ├── Map
    ├── Set
    ├── Queue
    ├── Stack
    ├── Tree
    ├── Trie
    └── Graph
```

---

## 3. 算法模块

| 文档                                                 | 模块             | 核心职责                    |
| ---------------------------------------------------- | ---------------- | --------------------------- |
| [01-graph.md](./01-graph.md)                         | Graph            | 通用图结构与 DAG 算法       |
| [02-config-resolution.md](./02-config-resolution.md) | Config           | Preset 与配置解析、合并     |
| [03-policy-evaluation.md](./03-policy-evaluation.md) | Policy           | Policy 匹配与约束决策       |
| [04-execution.md](./04-execution.md)                 | Execution        | Task 状态机与执行调度       |
| [05-verification.md](./05-verification.md)           | Verification     | Verification DAG 与验证调度 |
| [06-evidence-audit.md](./06-evidence-audit.md)       | Evidence / Audit | 证据、哈希与审计            |

---

## 4. Core 映射

```text
src/core/
├── graph/          → 01-graph.md
├── config/         → 02-config-resolution.md
├── policy/         → 03-policy-evaluation.md
├── execution/      → 04-execution.md
├── verification/   → 05-verification.md
└── evidence/
    └── audit/      → 06-evidence-audit.md
```

---

## 5. 算法 ↔ Core 模块

| 算法               | Core 模块              | 数据结构              | 复杂度      |
| ------------------ | ---------------------- | --------------------- | ----------- |
| DFS                | Graph / PresetResolver | Graph / Set           | O(V + E)    |
| Cycle Detection    | Graph                  | State Map             | O(V + E)    |
| Topological Sort   | Graph                  | Queue / In-degree Map | O(V + E)    |
| Config Merge       | Config                 | Tree                  | O(N)        |
| Schema Validation  | Config                 | Schema Tree           | O(N)        |
| Glob Matching      | Policy                 | Compiled Pattern      | O(P)        |
| Rule Matching      | Policy                 | Array / Index         | O(R)        |
| Deny-Wins          | Policy                 | Rule Set              | O(K)        |
| FSM                | Execution              | State Table           | O(1)        |
| Verification DAG   | Verification           | Graph                 | O(V + E)    |
| Scheduling         | Verification           | Queue                 | O(V + E)    |
| Hash               | Evidence               | Buffer                | O(N)        |
| Content Addressing | Evidence               | Map<Hash, Evidence>   | O(1) avg    |
| Audit Log          | Audit                  | Append-only Log       | O(1) append |

---

## 6. 优先级

### P0 — Core Correctness

这些算法直接影响 Harness 正确性：

* Graph
* DFS
* Cycle Detection
* Topological Sort
* Config Merge
* Merge Strategy
* Schema Validation
* Rule Matching
* Constraint Resolution
* Deny-Wins
* FSM
* Verification DAG

### P1 — Performance

当真实项目出现性能问题后再重点优化：

* Trie
* Rule Index
* Memoization
* LRU Cache
* Parallel Scheduling
* Incremental Verification

### P2 — Large-scale Runtime

暂不作为基础架构依赖：

* Incremental Hash
* Structural Sharing
* Merkle Tree
* Advanced Scheduling

---

## 7. 设计原则

### 7.1 优先复用通用算法

如果多个模块需要 DAG 能力，应复用 `Graph` 基础设施，而不是分别实现。

### 7.2 正确性优先于优化

首先实现：

```text
Correct → Deterministic → Observable → Optimized
```

而不是提前引入复杂的数据结构。

### 7.3 安全语义不可被性能优化改变

例如：

```text
Deny-Wins
```

属于治理语义。

任何缓存、索引或并行优化都不能改变其结果。

### 7.4 算法与治理语义分离

例如：

```text
Topological Sort
```

是通用算法。

而：

```text
Deny-Wins
```

是 Harness Governance Semantics。

二者不应混为一谈。

---

## 8. 后续实现顺序

推荐：

```text
Graph
  ↓
Preset / Config Resolution
  ↓
Policy Evaluation
  ↓
Execution
  ↓
Verification
  ↓
Evidence / Audit
```

这对应 Harness Runtime 的核心执行链：

```text
Resolve
   ↓
Policy
   ↓
Execute
   ↓
Verify
   ↓
Record
```
