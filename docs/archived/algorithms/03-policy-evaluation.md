> **本文是历史设计材料,描述的是尚未实现的系统,不是规范。**
> 这些算法当时被规划但从未构建;现行契约见 [Core 契约](../../interfaces/core.md)、
> [Policy 契约](../../interfaces/policy.md) 与 [验证契约](../../interfaces/verification.md)。

# Policy Evaluation

## 1. Purpose

Policy Engine 负责回答：

> Agent 当前请求是否允许执行？

基本流程：

```text
Request
   ↓
Normalize
   ↓
Match Rules
   ↓
Resolve Constraints
   ↓
Deny-Wins
   ↓
Decision
```

最终结果：

```text
ALLOW
DENY
REQUIRE_APPROVAL
```

---

## 2. Policy Model

一个 Policy Rule 至少包含：

```ts
interface PolicyRule {
  effect: "allow" | "deny" | "approval"
  resource?: string
  action?: string
  condition?: Condition
}
```

---

## 3. Rule Matching

输入：

```text
Request
```

例如：

```text
action = "write"
path = "src/foo.ts"
```

找到候选 Rules：

```text
Rule A
Rule B
Rule C
```

---

## 4. Path Matching

路径规则可能使用 Glob：

```text
src/**
tests/**
*.config.*
```

基础实现可以直接使用 compiled pattern。

未来如果 Rule 数量很大，可以引入：

```text
Path Trie
```

优化候选 Rule 查找。

---

## 5. Command Matching

命令不能简单依赖字符串匹配。

例如：

```text
rm -rf ./dist
```

与：

```text
echo "rm -rf ./dist"
```

语义不同。

因此长期设计应考虑：

```text
Command
 ↓
Parser
 ↓
AST
 ↓
Rule Matching
```

---

## 6. Rule Index

如果有：

```text
10 Rules
```

线性扫描：

```text
O(R)
```

可以接受。

如果达到：

```text
10,000+ Rules
```

应考虑 Index：

```text
Resource
Action
Path
Command
Condition
```

形成多级候选索引。

---

## 7. Constraint Resolution

匹配到多个 Rule 后不能简单使用：

```text
last rule wins
```

而需要统一 Resolve。

例如：

```text
Rule A → ALLOW
Rule B → DENY
Rule C → APPROVAL
```

最终根据治理语义计算：

```text
Decision
```

---

## 8. Deny-Wins

安全相关约束采用：

```text
DENY > APPROVAL > ALLOW
```

例如：

```text
ALLOW
ALLOW
DENY
```

结果：

```text
DENY
```

Deny-Wins 是 Governance Semantics，而不是普通排序算法。

---

## 9. Policy Monotonicity

安全配置应尽可能满足：

> 添加限制只能保持或收紧安全边界，而不能无意中扩大权限。

例如：

```text
Project:
  deny shell

Task:
  allow shell
```

不能因为 Task 层级更靠后就自动覆盖 Project 的安全限制。

---

## 10. Caching

适合缓存：

```text
Compiled Glob
Parsed Command
Rule Index
Policy Hash
Match Result
```

Cache Key 应包含：

```text
Policy Identity
Request Identity
Relevant Context
```

不能只使用 Request 作为 Key。

---

## 11. Correctness

必须保证：

```text
Same Policy
+
Same Request
+
Same Context
=
Same Decision
```

同时：

```text
Deny cannot be bypassed by cache
Deny cannot be bypassed by ordering
Deny cannot be bypassed by config layer
```

---

## 12. Tests

```text
No Rule
Single Allow
Single Deny
Allow + Deny
Multiple Deny
Approval
Glob
Nested Path
Command Parsing
Rule Conflict
Policy Inheritance
Deny-Wins
Cache Hit
Cache Invalidation
```
