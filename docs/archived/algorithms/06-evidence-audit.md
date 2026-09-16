> **本文是历史设计材料,描述的是尚未实现的系统,不是规范。**
> 这些算法当时被规划但从未构建;现行契约见 [Core 契约](../../interfaces/core.md)、
> [Policy 契约](../../interfaces/policy.md) 与 [验证契约](../../interfaces/verification.md)。

# Evidence and Audit Algorithms

## 1. Purpose

Evidence 和 Audit 负责回答两个问题：

### Evidence

> Harness 如何证明某个结果确实发生？

### Audit

> Harness 如何记录系统为什么做出这个决定？

---

## 2. Evidence

Evidence 可以来自：

```text
Command Output
Verification Result
File Snapshot
Diff
Policy Decision
Agent Action
```

---

## 3. Evidence Identity

Evidence 可以通过 Hash 获得稳定 Identity：

```text
Evidence
   ↓
Canonical Representation
   ↓
SHA-256
   ↓
Evidence ID
```

复杂度：

```text
O(N)
```

N 为 Evidence 大小。

---

## 4. Content Addressing

可以使用：

```text
Map<Hash, Evidence>
```

实现 Content Addressing。

例如：

```text
sha256:abc123
    ↓
Evidence
```

相同内容得到相同 Identity。

---

## 5. Evidence Store

基础接口：

```ts
interface EvidenceStore {
  put(evidence: Evidence): EvidenceId
  get(id: EvidenceId): Evidence | undefined
  has(id: EvidenceId): boolean
}
```

---

## 6. Audit Log

Audit Log 使用 Append-only 模型：

```text
Event 1
Event 2
Event 3
Event 4
```

事件不能被 Runtime 随意修改。

典型事件：

```text
PolicyEvaluated
TaskStarted
TaskCompleted
VerificationStarted
VerificationCompleted
EvidenceCreated
ApprovalGranted
```

---

## 7. Hash Chain

为了检测 Audit Log 被修改，可以建立：

```text
Event 1
  ↓ hash
Event 2
  ↓ hash
Event 3
  ↓ hash
Event 4
```

每一个 Event 包含：

```text
previousHash
currentHash
```

因此：

```text
Event N
```

的 Identity 同时依赖：

```text
Event N content
+
Event N-1 hash
```

---

## 8. Merkle Tree

Merkle Tree 可以作为未来的大规模 Audit / Evidence 完整性方案。

```text
        Root
       /    \
     H1      H2
    / \     / \
   E1 E2   E3 E4
```

用途：

* Batch Integrity
* Partial Verification
* Large Audit Log

第一版不需要实现。

---

## 9. Diff

Evidence 可能需要描述：

```text
Before
 ↓
Change
 ↓
After
```

因此 Diff Engine 可以生成：

```ts
ChangeSet
```

例如：

```text
CREATE src/foo.ts
MODIFY src/bar.ts
DELETE src/baz.ts
```

ChangeSet 可以同时服务于：

```text
Verification
Evidence
Audit
Incremental Verification
```

---

## 10. Audit 与 Evidence 的关系

```text
                 Action
                   │
          ┌────────┼────────┐
          ↓        ↓        ↓
       Policy   Execution Verification
          │        │        │
          └────────┼────────┘
                   ↓
                Evidence
                   ↓
                Audit
```

Evidence 保存：

> 发生了什么。

Audit 保存：

> 什么时候发生、为什么发生、由什么规则决定。

---

## 11. Correctness

Audit 必须：

* Append-only
* Deterministic
* 可验证
* 与 Runtime Decision 关联

Evidence 必须：

* 有稳定 Identity
* 可追溯
* 与 Verification / Action 关联

---

## 12. Tests

```text
Create Evidence
Hash Stability
Same Content Same Hash
Different Content Different Hash
Evidence Lookup
Audit Append
Audit Ordering
Hash Chain
Tampered Event
Diff
ChangeSet
```

---

## 13. Future

以下能力暂不作为第一阶段实现：

```text
Incremental Hash
Merkle Tree
Distributed Evidence Store
Remote Audit Store
Cryptographic Signing
```

这些属于 Runtime 大规模化之后的增强能力。
