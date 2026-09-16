# Verification 架构

## 1. 定位

Verification 负责回答：

> **任务真的完成了吗？**

Agent 的职责：

```text
尝试完成任务
```

Harness 的职责：

```text
独立确认任务是否完成
```

因此：

```text
Agent
  ↓
执行

Harness
  ↓
验证
```

核心原则：

> **Agent 自述不是 Verification Evidence。**

---

## 2. 为什么需要独立验证

Agent 可能返回：

```text
已完成
测试全部通过
```

但该信息不能直接作为最终验证结果。

Agent 可能：

* 误判任务状态；
* 遗漏测试；
* 没有实际执行测试；
* 只执行了部分测试；
* 错误解释测试结果。

因此 Harness 必须独立执行 Verification。

```text
Agent Result
    ↓
不能直接作为 Evidence
    ↓
Harness Validator
    ↓
Independent Verification
```

---

## 3. Verification 输入

Verification 至少依赖：

```text
TaskContract
HarnessPolicy
Actual Changes
Verification Requirements
```

基本流程：

```text
Task
+
Policy
+
Changes
+
Verification Requirements
       ↓
    Validator
       ↓
ValidationEvidence
```

Verification 不应该只关注测试命令，还必须结合任务要求和实际变化。

---

## 4. Verification Requirement

任务或 Policy 可以声明必须执行的检查。

例如：

```text
type-check
unit-test
build
lint
```

抽象模型：

```text
VerificationRequirement
        ↓
Validator
        ↓
Execution
```

Requirement 描述**需要验证什么**，而不是验证结果本身。

---

## 5. 独立执行

Validator 不读取 Agent 声称的：

```text
"tests": "passed"
```

而是重新执行：

```text
VerificationRequirement
        ↓
Harness executes command
        ↓
Capture result
        ↓
ValidationEvidence
```

因此：

```text
Agent Claim
    ≠
Verification Evidence
```

这是 Verification 与普通 Coding Agent 工作流之间的重要区别。

---

## 6. Evidence

Verification 的核心产物不是：

```text
passed
```

而是：

```text
ValidationEvidence
```

Evidence 至少记录：

```text
Command
Exit Code
stdout
stderr
Duration
Start Time
Finish Time
```

关系：

```text
ValidationEvidence
       ↓
Evaluation
       ↓
passed / failed
```

因此：

> `passed` 是从 Evidence 派生出来的结论，而不是原始证据。

---

## 7. 为什么需要完整 Evidence

仅保存：

```json
{
  "name": "type-check",
  "passed": true
}
```

无法回答：

```text
执行的到底是什么？
什么时候执行的？
执行花了多久？
有没有警告？
具体输出是什么？
```

完整 Evidence 才能够支持：

```text
审计
复核
Debug
Run Record
Review
```

因此 Verification 的最小信息单位不是 `passed`，而是可复核的执行证据。

---

## 8. Exit Code

最基本的命令成功判断：

```text
exitCode === 0
```

通常表示命令执行成功。

但 Harness 仍然必须保存：

```text
command
+
exitCode
+
stdout
+
stderr
+
timing
```

不能只保存：

```text
passed = true
```

---

## 9. Multiple Verification

一次 Task 可以包含多个 Verification Requirement：

```text
Task
 ↓
┌─────────────┐
│ type-check  │
├─────────────┤
│ test        │
├─────────────┤
│ build       │
├─────────────┤
│ lint        │
└─────────────┘
 ↓
Evidence[]
```

因此：

```text
ValidationEvidence[]
```

是更合理的基本模型。

---

## 10. Required Verification

Verification Requirement 可以区分 Required 与 Optional。

```text
Required Check
    ↓
失败 → 影响最终结果

Optional Check
    ↓
失败 → 记录 Warning
```

具体失败如何影响最终 Gate，由 Policy / Review 决定。

因此：

```text
Verification
    ↓
产生 Evidence

Policy / Review
    ↓
决定 Evidence 的治理意义
```

Verification 本身不应该承担全部最终决策。

---

## 11. Verification 与 Agent Stage

Harness 可以存在：

```text
planner
coder
tester
reviewer
```

但：

> `tester` Agent ≠ Harness Verification。

例如：

```text
Coder Agent
   ↓
“测试通过”

Tester Agent
   ↓
“我检查过了”

Harness Validator
   ↓
实际执行 npm test
   ↓
ValidationEvidence
```

只有最后一层属于独立 Verification。

因此：

```text
Tester Agent
= 执行流程中的 Agent Role

Validator
= Harness Governance Component
```

---

## 12. Verification 与 Scope

Verification 不能只检查：

```text
tests passed
```

还必须考虑：

```text
Actual Changes
```

例如：

```text
Task
只修改 src/components/

Agent
修改 src/components/
+
修改 .github/workflows/
```

即使：

```text
npm test
```

通过，也不能直接认为 Task 完成。

整体关系：

```text
                    ┌── Verification ──→ PASS
                    │
Task → Agent → Changes
                    │
                    └── Scope Check ──→ REJECT
```

最终至少要求：

```text
Scope Valid
AND
Verification Passed
```

---

## 13. Verification 与 Acceptance Criteria

测试通过不代表任务一定满足 Acceptance Criteria。

例如：

```text
实现登录按钮

要求：
1. 支持 loading
2. 禁止重复点击
3. 通过 TypeScript 检查
```

可能出现：

```text
TypeScript
   ✓

Unit Test
   ✓

loading
   ✗
```

因此 Verification 需要为：

```text
Verification Requirements
+
Acceptance Criteria
```

提供证据。

最终综合判定由 Review 完成。

---

## 14. Verification 与 Review

Verification 产生：

```text
Evidence
```

而不是：

```text
Approved
```

流程：

```text
ValidationEvidence
       ↓
Review
       ↓
ReviewResult
```

Review 可以综合：

```text
TaskContract
HarnessPolicy
Actual Changes
ValidationEvidence
```

因此：

```text
Validator
= 产生验证证据

Review
= 综合证据进行最终判定
```

---

## 15. Verification Failure

Verification Failure 不等同于 Test Failure。

可能原因包括：

### Command Failure

```text
exitCode != 0
```

### Timeout

```text
command exceeded timeout
```

### Missing Verification

```text
required check was not executed
```

### Scope Violation

```text
actual changes outside allowed scope
```

### Acceptance Failure

```text
required criterion not satisfied
```

因此：

```text
Verification Failure
```

是更大的概念。

---

## 16. Evidence 持久化

一次 Run 的 Verification 结果应进入：

```text
.harness/runs/<run-id>/
```

例如：

```text
.harness/
└── runs/
    └── <run-id>/
        ├── input.json
        ├── policy.json
        ├── stages/
        ├── changes.json
        ├── validation.json
        └── result.json
```

其中：

```text
validation.json
```

保存独立验证证据。

这样一次 Run 可以被重新检查，而不依赖 Agent 当时的文字描述。

---

## 17. Verification Trust Model

完整关系：

```text
Agent
 │
 │ “我认为完成了”
 ▼
AgentResult
 │
 │ 不作为独立证据
 ▼
Harness Validator
 │
 │ 实际执行
 ▼
ValidationEvidence
 │
 │ 进入 Review
 ▼
ReviewResult
 │
 ▼
RunResult
```

核心原则：

```text
Agent Claim
    ≠
Evidence
```

---

## 18. 最小闭环

Verification 第一阶段不需要复杂系统。

最小闭环：

```text
VerificationRequirement
        ↓
Execute
        ↓
Capture
        ↓
ValidationEvidence
        ↓
Evaluate
        ↓
PASS / FAIL
```

后续再逐步增加：

```text
Timeout
Retry
Parallel Checks
Evidence Storage
Acceptance Evaluation
Human Approval
```

因此第一阶段重点不是增加更多测试，而是：

> **把已有的独立执行行为提升为可审计的 Verification 系统。**

---

## 19. 当前实现与目标

当前已经存在：

```text
Tester 独立执行门禁
```

因此独立验证的基本思想已经存在。

当前主要缺口：

```text
统一 ValidationEvidence
command 输出留存
exitCode 结构化记录
duration 记录
timestamps
完整 Review / Gate
```

因此后续重点是：

```text
Existing Independent Execution
        ↓
Structured Evidence
        ↓
Auditable Verification
```

而不是单纯增加更多测试命令。

---

## 20. 核心公式

Verification 的目标不是：

> **跑更多测试。**

而是：

> **让 Harness 能够独立证明任务是否满足要求。**

因此：

```text
Verification
=
Independent Execution
+
Structured Evidence
+
Deterministic Evaluation
```

最终：

```text
Agent says it works
        ↓
不可信

Harness proves it works
        ↓
可信
```

---

## 21. 设计原则

1. Agent 自述不属于独立 Verification Evidence。
2. Verification 必须独立执行检查。
3. Evidence 是 Verification 的核心产物。
4. `passed / failed` 应从 Evidence 派生。
5. Evidence 必须保留足够的信息用于复核。
6. 多个 Verification 使用 `Evidence[]` 表达。
7. Required 与 Optional Verification 必须区分。
8. Tester Agent 不等于 Harness Validator。
9. Verification 必须结合 Actual Changes / Scope。
10. Verification 不直接等同于 Review。
11. Verification Failure 不仅包括 Test Failure。
12. Evidence 应进入 Run Record。
13. 第一阶段优先建立可审计证据链，而不是增加测试数量。

---

## 22. 相关文档

* [Verification Interface](../interfaces/verification.md)
* [Policy 架构](./policy.md)
* [Provider 架构](./provider.md)
* [Preset 架构](./preset.md)
* [核心架构](../核心架构.md)
* [核心接口设计](../核心接口设计.md)
