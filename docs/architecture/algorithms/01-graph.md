# Graph Algorithms

## 1. Purpose

Graph 是 Harness 中的通用基础设施。

多个系统都可以表示为 Graph：

```text
Preset Dependency
Verification Dependency
Task Dependency
Agent Workflow
Policy Dependency
```

其中最重要的是 DAG（Directed Acyclic Graph）。

---

## 2. Graph Model

基础 Graph：

```ts
type NodeId = string

interface Graph<T> {
  nodes: Map<NodeId, T>
  edges: Map<NodeId, Set<NodeId>>
}
```

使用：

```text
Map<NodeId, Node>
Map<NodeId, Set<NodeId>>
```

作为基础结构。

这样可以实现：

* O(1) 平均节点查询
* O(1) 平均边去重
* O(V + E) 图遍历

---

## 3. DFS

DFS（Depth-First Search）用于：

* 遍历依赖关系
* 查找依赖节点
* Cycle Detection
* Dependency Resolution

基本过程：

```text
visit(node)
    ↓
mark visited
    ↓
for each dependency
    ↓
visit(dependency)
```

复杂度：

```text
Time:  O(V + E)
Space: O(V)
```

---

## 4. Cycle Detection

Preset Dependency 必须避免循环：

```text
A
↓
B
↓
C
↓
A
```

采用三状态模型：

```ts
enum VisitState {
  UNVISITED,
  VISITING,
  VISITED,
}
```

状态含义：

```text
UNVISITED
    ↓
VISITING
    ↓
VISITED
```

如果 DFS 过程中：

```text
VISITING → VISITING
```

说明发现 Cycle。

例如：

```text
A → B → C → A
        ↑
      cycle
```

复杂度：

```text
O(V + E)
```

---

## 5. Topological Sort

对于 DAG：

```text
A → B → C
A → D → C
```

需要生成：

```text
A
↓
B / D
↓
C
```

常用 Kahn Algorithm：

1. 计算每个节点的 in-degree。
2. 将 in-degree 为 0 的节点加入 Queue。
3. 移除节点。
4. 更新依赖节点的 in-degree。
5. 新的 0-degree 节点加入 Queue。
6. 最终检查输出节点数量。

复杂度：

```text
Time: O(V + E)
Space: O(V)
```

---

## 6. Dependency Deduplication

Graph 中边使用：

```ts
Set<NodeId>
```

而不是：

```ts
NodeId[]
```

避免：

```text
A → B
A → B
A → B
```

重复产生三条边。

---

## 7. Graph Resolution

通用解析过程：

```text
Input
 ↓
Build Graph
 ↓
Detect Cycle
 ↓
Topological Sort
 ↓
Resolution Order
```

该流程可被：

* PresetResolver
* VerificationEngine
* TaskEngine

复用。

---

## 8. Cache

Graph 构建本身可以缓存：

```text
Graph Input
    ↓
Hash
    ↓
Graph Cache
```

但是缓存不能绕过：

* 配置变化检测
* 版本变化检测
* Policy 变化检测

---

## 9. Correctness

必须保证：

### No Missing Dependency

所有声明的依赖必须存在。

### No Cycle

需要 DAG 的系统不能包含 Cycle。

### Deterministic Order

相同输入必须产生稳定的 Resolution Order。

因此如果多个节点同时满足：

```text
in-degree === 0
```

需要定义稳定排序规则，例如 Node ID 排序。

---

## 10. Tests

至少覆盖：

```text
Empty Graph
Single Node
Linear Graph
Branch Graph
Diamond Graph
Duplicate Edge
Missing Node
Cycle
Multiple Independent Nodes
Large Graph
```
