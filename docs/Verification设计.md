# Verification 设计

> Verification 负责回答：**任务真的完成了吗？**

这是 pedyc-harness 与普通 Coding Agent 工作流最重要的区别之一。

---

# 一、Verification 的定位

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

# 二、为什么需要独立验证

Agent 可能返回：

```text
已完成
测试全部通过
```

但这不能直接作为最终结果。

原因包括：

* Agent 可能误判
* Agent 可能遗漏测试
* Agent 可能没有执行测试
* Agent 可能只执行了部分测试
* Agent 可能错误解释测试结果

因此 Harness 必须重新执行验证。

---

# 三、Verification 输入

Verification 至少依赖：

```text
TaskContract
HarnessPolicy
Actual Changes
Verification Requirements
```

流程：

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

---

# 四、VerificationRequirement

任务或 Policy 可以声明必须执行哪些检查：

```ts
export interface VerificationRequirement {
  id: string
  command: string
  description?: string
  required: boolean
}
```

例如：

```json
{
  "id": "type-check",
  "command": "npm run type-check",
  "required": true
}
```

或者：

```json
{
  "id": "unit-test",
  "command": "npm test",
  "required": true
}
```

---

# 五、独立执行

Validator 不应该读取 Agent 的：

```text
"tests": "passed"
```

而应该：

```text
VerificationRequirement
        ↓
Harness executes command
        ↓
Capture result
        ↓
ValidationEvidence
```

---

# 六、ValidationEvidence

核心证据结构：

```ts
export interface ValidationEvidence {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  startedAt: string
  finishedAt: string
}
```

这意味着一次验证至少记录：

| 字段         | 意义           |
| ------------ | -------------- |
| `command`    | 实际执行了什么 |
| `exitCode`   | 进程最终状态   |
| `stdout`     | 标准输出       |
| `stderr`     | 错误输出       |
| `durationMs` | 执行耗时       |
| `startedAt`  | 开始时间       |
| `finishedAt` | 结束时间       |

---

# 七、为什么不能只保存 passed

错误：

```json
{
  "name": "type-check",
  "passed": true
}
```

这种结果无法回答：

```text
执行的到底是什么？
什么时候执行的？
执行花了多久？
有没有警告？
具体输出是什么？
```

因此：

```text
passed
```

只是从 Evidence 派生出来的结论。

更合理的关系：

```text
ValidationEvidence
       ↓
Evaluation
       ↓
passed / failed
```

---

# 八、Exit Code

最基本的判断：

```text
exitCode === 0
```

通常表示命令成功。

但 Harness 不应该只保存这个结论。

完整记录：

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

才能形成可复核证据。

---

# 九、多个 Verification

一次任务可能需要：

```text
type-check
test
build
lint
```

因此：

```ts
validation: ValidationEvidence[]
```

而不是：

```ts
validation: ValidationEvidence
```

执行：

```text
Task
 ↓
┌─────────────┐
│ type-check  │
├─────────────┤
│ test        │
├─────────────┤
│ build       │
└─────────────┘
 ↓
Evidence[]
```

---

# 十、Required Verification

不是所有检查都一定需要通过。

因此：

```ts
required: boolean
```

可以区分：

```text
Required Check
    ↓
失败 → Run Failed

Optional Check
    ↓
失败 → 记录 Warning
```

最终具体 Gate 规则由 Review / Policy 决定。

---

# 十一、Verification 与 Agent Stage

当前架构可以存在：

```text
planner
coder
tester
reviewer
```

但：

> `tester` Agent ≠ Harness Verification。

这是非常重要的区别。

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

只有最后一层属于真正的独立验证。

因此：

```text
Tester Agent
```

最多是执行流程中的一个角色。

而：

```text
Validator
```

是 Harness 的治理组件。

---

# 十二、Verification 与 Scope

验证不能只检查：

```text
tests passed
```

还需要考虑：

```text
Actual Changes
```

例如：

```text
Task:
只修改 src/components/

Agent:
修改 src/components/
+
修改 .github/workflows/
```

即使：

```text
npm test
```

通过，也不能直接 PASS。

正确流程：

```text
                    ┌── Verification ──→ PASS
                    │
Task → Agent → Changes
                    │
                    └── Scope Check ──→ REJECT
```

因此最终结果必须同时满足：

```text
Scope Valid
AND
Verification Passed
```

---

# 十三、Verification 与 Acceptance Criteria

测试通过也不代表一定满足任务要求。

例如任务：

```text
实现一个登录按钮
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

因此 Verification 应同时服务于：

```text
Verification Requirements
+
Acceptance Criteria
```

最终由 Review 进行综合判定。

---

# 十四、Review

Verification 产生的是：

```text
Evidence
```

不是最终：

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

Review 输入：

```text
TaskContract
HarnessPolicy
Actual Changes
ValidationEvidence
```

输出：

```ts
export interface ReviewResult {
  approved: boolean
  issues: ReviewIssue[]
  acceptanceEvidence: AcceptanceEvidence[]
}
```

---

# 十五、Verification Failure

失败可能来自：

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

不应该简单等价于：

```text
Test Failure
```

---

# 十六、Evidence 的持久化

一次 Run 的验证结果应该进入：

```text
.harness/runs/<run-id>/
```

目标：

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

---

# 十七、Verification 的可信模型

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

因此：

```text
Agent Claim
    ≠
Evidence
```

这是整个 Verification 设计最重要的原则。

---

# 十八、当前实现与目标

当前已经存在：

```text
Tester 独立执行门禁
```

因此基本思想已经存在。

但当前仍缺少：

```text
1. 统一 ValidationEvidence 结构
2. command 输出留存
3. exitCode 结构化记录
4. duration 记录
5. timestamps
6. 更完整的 Review / Gate
```

所以第二阶段的重点不是“增加更多测试”。

而是：

> **把已有的独立执行行为提升为真正可审计的 Verification 系统。**

原项目目标文档对当前状态的判断也是“Independent Verification：部分实现”，核心缺口正是证据结构与命令输出留存。

---

# 十九、最小闭环

Verification 第一阶段不需要复杂系统。

只需要：

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

之后再增加：

```text
Timeout
Retry
Parallel Checks
Evidence Storage
Acceptance Evaluation
Human Approval
```

---

# 二十、核心原则

Verification 的目标不是：

> “跑更多测试。”

而是：

> **让 Harness 能够独立证明任务是否满足要求。**

因此核心公式：

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
