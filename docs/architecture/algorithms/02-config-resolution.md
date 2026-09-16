# Config Resolution

## 1. Purpose

Config Resolution 负责将多个配置来源解析为最终的：

```text
Effective Configuration
```

典型来源：

```text
Global
  ↓
Organization
  ↓
Team
  ↓
Project
  ↓
Task
```

同时 Preset 也会参与配置组合。

---

## 2. Preset Resolution

Preset 使用 npm 进行包分发和版本解析。

Harness 不重新实现 npm SemVer Resolver。

Harness 负责：

```text
Load Preset
    ↓
Read preset.json
    ↓
Resolve extends
    ↓
Build Dependency Graph
    ↓
Detect Cycle
    ↓
Topological Sort
    ↓
Compose Configuration
```

---

## 3. Preset Dependency

例如：

```text
@acme/vue
    ↓
@acme/web
    ↓
@pedyc/web
```

Harness 内部构建：

```text
Preset Graph
```

并通过 Graph Algorithms 完成：

* DFS
* Cycle Detection
* Topological Sort

---

## 4. Config Merge

配置不能简单使用：

```ts
deepMerge(a, b)
```

因为不同字段拥有不同语义。

例如：

```text
rules        → append
agents       → merge
runtime      → replace
permissions  → deny-wins
security     → immutable
```

因此 Merge 必须由 Schema / Strategy 定义。

---

## 5. Merge Strategy

建议支持：

```text
replace
merge
append
prepend
deny-wins
immutable
```

例如：

```json
{
  "security": {
    "allowShell": false
  }
}
```

低优先级配置不能通过：

```json
{
  "security": {
    "allowShell": true
  }
}
```

将安全限制解除。

---

## 6. Config Resolution

最终过程：

```text
Load
 ↓
Validate
 ↓
Resolve Presets
 ↓
Build Config Layers
 ↓
Apply Merge Strategy
 ↓
Canonicalize
 ↓
Hash
 ↓
Effective Config
```

---

## 7. Schema Validation

配置在进入 Runtime 前必须验证。

验证包括：

```text
Type
Required Fields
Enum
Structure
Reference
Version
```

例如：

```ts
validateConfig(config, schema)
```

复杂度通常：

```text
O(N)
```

其中 N 为配置节点数量。

---

## 8. Canonicalization

同一个逻辑配置应产生相同表示。

例如对象：

```json
{
  "b": 2,
  "a": 1
}
```

和：

```json
{
  "a": 1,
  "b": 2
}
```

应该在 Canonicalization 后拥有相同表示。

用途：

* Hash
* Cache Key
* Change Detection
* Deterministic Execution

---

## 9. Config Hash

Canonical Config：

```text
Canonicalize(Config)
       ↓
Serialize
       ↓
SHA-256
       ↓
Config Identity
```

用于：

```text
Cache
Audit
Change Detection
Reproducibility
```

---

## 10. Correctness

必须保证：

1. 无效配置不能进入 Runtime。
2. Security Constraint 不能被低层配置绕过。
3. 相同配置产生相同 Effective Config。
4. Preset Cycle 必须失败。
5. Resolution Order 必须稳定。

---

## 11. Tests

```text
Empty Config
Single Config
Nested Config
Multiple Layers
Preset Extends
Preset Cycle
Duplicate Preset
Merge Strategy
Immutable Field
Deny-Wins
Schema Error
Canonicalization
Config Hash
```
