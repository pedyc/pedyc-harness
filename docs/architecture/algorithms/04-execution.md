# Execution Algorithms

## 1. Purpose

Execution Engine 负责管理 Harness Task 的生命周期。

核心模型：

```text
Task
 ↓
Validate
 ↓
Policy Check
 ↓
Execute
 ↓
Verify
 ↓
Complete
```

---

## 2. State Machine

Task 使用 FSM（Finite State Machine）。

例如：

```text
PENDING
   ↓
VALIDATING
   ↓
AUTHORIZED
   ↓
RUNNING
   ↓
VERIFYING
   ↓
COMPLETED
```

失败：

```text
RUNNING
   ↓
FAILED
```

取消：

```text
RUNNING
   ↓
CANCELLED
```

---

## 3. State Transition

定义：

```ts
transition(
  state: State,
  event: Event
): State
```

状态转换表：

```text
State + Event → Next State
```

查询复杂度：

```text
O(1)
```

---

## 4. Event Dispatch

事件：

```text
TaskStarted
TaskCompleted
TaskFailed
VerificationPassed
VerificationFailed
ApprovalGranted
ApprovalDenied
```

通过 Event Map：

```ts
Map<EventType, Handler[]>
```

进行分发。

---

## 5. Scheduler

Scheduler 负责：

```text
Queue
 ↓
Select Task
 ↓
Policy Check
 ↓
Execute
 ↓
Collect Result
```

如果存在 Dependency：

```text
Task A
 ↓
Task B
 ↓
Task C
```

可以复用 Graph + Topological Scheduling。

---

## 6. Retry

失败任务可以根据策略 Retry。

例如：

```text
Attempt 1
   ↓
failure
   ↓
backoff
   ↓
Attempt 2
```

推荐：

```text
Exponential Backoff
```

并加入：

```text
Max Attempts
Max Delay
Retryable Error
```

---

## 7. Timeout

每个 Task 可以拥有：

```text
Timeout
```

超过 Deadline 后：

```text
RUNNING
   ↓
TIMEOUT
```

Timeout 必须进入 Audit / Evidence。

---

## 8. Concurrency Control

使用：

```text
Semaphore
```

限制同时运行的任务：

```text
maxConcurrency = N
```

基本：

```text
acquire()
execute()
release()
```

---

## 9. Determinism

Scheduler 应尽可能保证：

```text
Same Input
+
Same Dependency
+
Same Policy
=
Same Execution Plan
```

对于可以并行执行的 Task：

```text
A ─┐
   ├→ C
B ─┘
```

A 和 B 可以并行，但 C 必须等待两者完成。

---

## 10. Tests

```text
Initial State
Valid Transition
Invalid Transition
Failure
Cancellation
Timeout
Retry
Max Retry
Concurrency Limit
Dependency
Parallel Tasks
Scheduler Failure
```
