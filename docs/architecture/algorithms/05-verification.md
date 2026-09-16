# Verification Algorithms

## 1. Purpose

Verification Engine 负责判断：

> Task 的执行结果是否满足预期。

Verification 不应该只是：

```text
command === exit code 0
```

而应该成为一个可组合的验证系统。

---

## 2. Verification Model

一个 Verification：

```ts
interface Verification {
  id: string
  command?: string
  dependsOn?: string[]
}
```

例如：

```text
typecheck
lint
unit-test
integration-test
```

---

## 3. Verification DAG

验证之间可能存在依赖：

```text
typecheck
    ↓
unit-test
    ↓
integration-test
```

或者：

```text
        typecheck
       /         \
     lint       unit-test
       \         /
       integration
```

因此 Verification 使用 DAG。

---

## 4. Scheduling

流程：

```text
Build DAG
   ↓
Cycle Detection
   ↓
Calculate In-degree
   ↓
Queue Ready Nodes
   ↓
Execute
   ↓
Release Dependencies
```

复杂度：

```text
O(V + E)
```

---

## 5. Parallel Scheduling

如果：

```text
A
B
C
```

互相没有依赖：

```text
A ─┐
B ─┼→ D
C ─┘
```

则：

```text
A
B
C
```

可以并行执行。

最终：

```text
D
```

等待全部完成。

---

## 6. Verification Result

每个 Verification 产生：

```text
PASS
FAIL
SKIPPED
ERROR
```

整个 Verification Graph 再计算最终结果。

---

## 7. Failure Propagation

如果：

```text
A → B → C
```

A 失败：

```text
A = FAIL
```

默认：

```text
B = SKIPPED
C = SKIPPED
```

除非 Verification 明确声明：

```text
runOnFailure
```

---

## 8. Incremental Verification

未来可以根据 Change Set 判断受影响的 Verification。

例如：

```text
src/foo.ts
```

变化后：

```text
typecheck → affected
lint      → affected
unit-test → affected
docs      → unaffected
```

依赖：

```text
Change Set
    ↓
Dependency Index
    ↓
Affected Verification
```

这是 P1 优化，而不是第一版必须实现。

---

## 9. Verification Cache

可以缓存：

```text
Verification
+
Input Hash
+
Config Hash
```

得到：

```text
Verification Result
```

如果：

```text
Input Hash unchanged
Config Hash unchanged
```

可以复用结果。

---

## 10. Correctness

Cache 不能改变 Verification 的语义。

缓存必须失效于：

```text
Source Change
Config Change
Dependency Change
Tool Version Change
Environment Change
```

---

## 11. Tests

```text
Single Verification
Linear DAG
Branch DAG
Diamond DAG
Cycle
Parallel Verification
Failure Propagation
Skip
Cache Hit
Cache Invalidation
Incremental Verification
```
