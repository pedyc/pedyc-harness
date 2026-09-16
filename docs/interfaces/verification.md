# Verification Interface

## 1. VerificationRequirement

`VerificationRequirement` 描述一次需要执行的验证要求。

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
  "description": "Run TypeScript type checking",
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

Requirement 描述的是：

```text
需要验证什么
```

而不是：

```text
验证结果是什么
```

---

## 2. ValidationEvidence

`ValidationEvidence` 是一次实际 Verification 执行产生的原始证据。

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

字段含义：

| 字段         | 意义           |
| ------------ | -------------- |
| `command`    | 实际执行的命令 |
| `exitCode`   | 进程退出码     |
| `stdout`     | 标准输出       |
| `stderr`     | 标准错误输出   |
| `durationMs` | 执行耗时       |
| `startedAt`  | 开始时间       |
| `finishedAt` | 结束时间       |

---

## 3. Evidence 与 Result

Verification 不应该直接保存：

```ts
{
  passed: true
}
```

而应该：

```text
VerificationEvidence
       ↓
Evaluation
       ↓
passed / failed
```

因此：

```text
Evidence
= 原始事实

Evaluation
= 对事实的判断
```

---

## 4. ValidationResult

可以使用独立结果模型表达 Evidence 的评价结果：

```ts
export interface ValidationResult {
  id: string
  status: ValidationStatus
  evidence: ValidationEvidence
  message?: string
}
```

状态：

```ts
export type ValidationStatus =
  | "passed"
  | "failed"
  | "skipped"
```

其中：

```text
passed
    Requirement 满足

failed
    Requirement 未满足

skipped
    Requirement 没有执行
```

`ValidationResult` 是 Evaluation 层结果，不是原始 Evidence。

---

## 5. ValidationSummary

一次 Task 可以包含多个 Verification。

```ts
export interface ValidationSummary {
  status: ValidationStatus
  results: ValidationResult[]
}
```

关系：

```text
Task
 ↓
VerificationRequirement[]
 ↓
Validator
 ↓
ValidationResult[]
 ↓
ValidationSummary
```

---

## 6. Validator

Validator 是 Harness 执行 Verification 的核心组件。

```ts
export interface Validator {
  validate(
    requirements: VerificationRequirement[],
    context: VerificationContext
  ): Promise<ValidationSummary>
}
```

Validator 负责：

```text
读取 Requirement
    ↓
执行验证命令
    ↓
捕获执行结果
    ↓
生成 Evidence
    ↓
Evaluation
    ↓
返回 ValidationSummary
```

Validator 不应该读取 Agent 的自然语言声明作为验证结果。

---

## 7. VerificationContext

Validator 需要明确的执行上下文。

当前可以抽象为：

```ts
export interface VerificationContext {
  cwd: string
  env?: Record<string, string>
}
```

其中：

```text
cwd
    Verification 命令执行目录

env
    Verification 执行环境
```

工作目录必须由 Harness Runtime 明确控制。

---

## 8. Validation Execution

一次 Requirement 的执行可以抽象为：

```text
VerificationRequirement
        ↓
Prepare Environment
        ↓
Execute Command
        ↓
Capture stdout / stderr
        ↓
Capture exitCode
        ↓
Capture timing
        ↓
ValidationEvidence
```

因此 Validator 的核心不是：

```text
command → boolean
```

而是：

```text
command
    ↓
execution
    ↓
evidence
    ↓
evaluation
```

---

## 9. Verification Failure

Validation 结果可以来自不同类型的失败：

```ts
export type ValidationFailureReason =
  | "command-failed"
  | "timeout"
  | "missing"
  | "scope-violation"
  | "acceptance-failed"
```

其中：

```text
command-failed
    命令执行但返回失败

timeout
    命令超过允许时间

missing
    Required Verification 没有执行

scope-violation
    实际变化超出允许范围

acceptance-failed
    Acceptance Criterion 未满足
```

具体是否影响最终 Run Result，由 Policy / Review 决定。

---

## 10. Review Interface

Verification 本身不负责最终 Approval。

Review 输入：

```text
TaskContract
HarnessPolicy
Actual Changes
ValidationEvidence
```

可以抽象为：

```ts
export interface ReviewResult {
  approved: boolean
  issues: ReviewIssue[]
  acceptanceEvidence: AcceptanceEvidence[]
}
```

其中：

```ts
export interface ReviewIssue {
  id: string
  message: string
}

export interface AcceptanceEvidence {
  criterion: string
  satisfied: boolean
  evidence?: unknown
}
```

这里的 `ReviewResult` 属于 Review 接口；Verification Interface 只需要定义它与 Verification Evidence 的边界。

---

## 11. Verification Collection

一次 Task 可以执行多个 Requirement：

```ts
export interface VerificationRun {
  requirements: VerificationRequirement[]
  results: ValidationResult[]
}
```

典型流程：

```text
VerificationRequirement[]
        ↓
       Validator
        ↓
ValidationResult[]
        ↓
ValidationSummary
```

这样可以同时记录：

```text
type-check
test
build
lint
```

的独立结果。

---

## 12. Evidence Persistence

Verification Evidence 最终进入 Run Record。

逻辑模型：

```ts
export interface ValidationRecord {
  runId: string
  results: ValidationResult[]
}
```

对应文件：

```text
.harness/runs/<run-id>/validation.json
```

保存：

```text
Requirement
Evidence
Evaluation
```

从而支持：

```text
审计
复核
Debug
Review
```

---

## 13. Required / Optional

Requirement：

```ts
required: boolean
```

用于区分：

```text
Required
    ↓
必须执行

Optional
    ↓
可以执行
```

需要注意：

```text
required
```

表示 Requirement 的要求级别，而不是最终 Run Result 的直接实现。

例如：

```text
Required Verification
       ↓
failed
       ↓
产生 Validation Failure
       ↓
Policy / Review 决定最终 Gate
```

---

## 14. Interface Boundary

Verification 与其他组件的边界：

```text
                 TaskContract
                      │
                 HarnessPolicy
                      │
          VerificationRequirement
                      │
                      ▼
              ┌──────────────┐
              │   Validator  │
              └──────┬───────┘
                     │
              ValidationEvidence
                     │
                     ▼
              ValidationResult
                     │
                     ▼
                   Review
                     │
                     ▼
                 RunResult
```

其中：

```text
Requirement
    = 要验证什么

Evidence
    = 实际发生了什么

ValidationResult
    = Evidence 的评价

ReviewResult
    = 综合判断
```

---

## 15. 与 AgentResult 的边界

`AgentResult`：

```text
Agent 执行产生的结果
```

`ValidationEvidence`：

```text
Harness 独立执行产生的证据
```

二者不能互相替代：

```text
AgentResult
    ≠
ValidationEvidence
```

尤其不能：

```ts
agentResult.status === "success"
```

直接推导：

```ts
validation.status === "passed"
```

正确流程：

```text
AgentResult
    ↓
Actual Changes
    ↓
Validator
    ↓
ValidationEvidence
    ↓
ValidationResult
```

---

## 16. 最小实现接口

第一阶段只需要稳定以下接口：

```ts
export interface VerificationRequirement {
  id: string
  command: string
  description?: string
  required: boolean
}

export interface ValidationEvidence {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  startedAt: string
  finishedAt: string
}

export interface Validator {
  validate(
    requirements: VerificationRequirement[],
    context: VerificationContext
  ): Promise<ValidationSummary>
}
```

其他：

```text
ValidationResult
ValidationSummary
ReviewResult
Evidence Persistence
```

可以随着实现逐步收敛。

---

## 17. 设计原则

1. `VerificationRequirement` 描述要求。
2. `ValidationEvidence` 描述事实。
3. `ValidationResult` 描述评价。
4. AgentResult 不属于独立 Verification Evidence。
5. Validator 必须实际执行 Verification。
6. Evidence 必须保留 command、output、exitCode 与 timing。
7. 多个 Verification 使用集合表达。
8. Required 与 Optional 必须区分。
9. Verification 不直接决定最终 Review。
10. Evidence 应进入 Run Record。
11. Verification Interface 保持稳定，具体执行实现可以替换。

---

## 18. 相关文档

* [Verification 架构](../architecture/verification.md)
* [Policy Interface](./policy.md)
* [Provider Interface](./provider.md)
* [Preset Interface](./preset.md)
* [核心接口设计](./核心接口设计.md)
