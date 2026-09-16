# Policy Architecture

> Policy 的架构设计与运行机制。

## 1. 职责

Policy 用于描述和约束 Harness 的执行行为。

Policy 不负责具体执行任务，而负责：

* 判断当前执行上下文是否满足约束
* 决定某项行为是否允许
* 对执行过程施加约束
* 为后续 Execution 提供决策结果

核心关系：

```text
Preset
   ↓
Config Resolution
   ↓
Policy Evaluation
   ↓
Execution
   ↓
Verification
```

---

## 2. Policy 模型

一个 Policy 可以抽象为：

```text
Policy
├── Identity
├── Condition
├── Effect
├── Priority
└── Metadata
```

其中：

* **Identity**：Policy 的唯一标识
* **Condition**：Policy 生效条件
* **Effect**：条件满足后的策略效果
* **Priority**：多个 Policy 冲突时的优先级
* **Metadata**：描述、来源、版本等附加信息

---

## 3. Policy 生命周期

```text
Load
  ↓
Resolve
  ↓
Evaluate
  ↓
Decision
  ↓
Execution
```

Policy 本身不执行具体任务。

它产生一个 Decision，由 Execution 根据 Decision 决定后续行为。

---

## 4. Policy Evaluation

Policy Evaluation 的职责是：

```text
Policy + Context
       ↓
   Evaluation
       ↓
     Result
```

Evaluation 需要考虑：

* Policy 是否适用
* Condition 是否满足
* Policy 是否被覆盖
* Policy 优先级
* 多个 Policy 之间的冲突
* 默认行为

具体求值算法见：

[03 Policy Evaluation](./algorithms/03-policy-evaluation.md)

---

## 5. Policy 与 Preset

Preset 负责提供配置与 Policy 组合关系。

```text
Preset
├── Config
├── Policies
└── Provider
```

当 Preset 存在继承或组合关系时，Policy 也需要经过 Resolution。

因此：

```text
Preset Graph
     ↓
Policy Collection
     ↓
Policy Resolution
     ↓
Policy Evaluation
```

Policy 不应该自行解析 Preset 继承关系。

---

## 6. Policy 与 Execution

Policy Evaluation 应发生在 Execution 的决策阶段。

```text
Execution Request
        ↓
   Build Context
        ↓
 Policy Evaluation
        ↓
    Decision
     ↙     ↘
  Allow    Deny
    ↓        ↓
 Execute    Stop
```

Policy 的职责是产生决策，而不是直接调用 Provider。

---

## 7. 多 Policy

当一次 Execution 对应多个 Policy 时：

```text
Policy A ─┐
Policy B ─┼→ Evaluation → Decision
Policy C ─┘
```

系统需要定义：

* Evaluation 顺序
* Priority
* 冲突解决
* Allow / Deny 关系
* 默认决策

这些规则属于 Policy Evaluation 算法的一部分。

---

## 8. 边界

Policy 不负责：

* Provider 的具体实现
* Execution 的具体执行
* Verification 的具体验证
* Preset Graph 的构建
* CLI 参数解析

Policy 只负责：

> **根据上下文与规则产生执行决策。**

---

## 9. 相关文档

* [Policy Interface](../interfaces/policy.md)
* [Policy Evaluation Algorithm](./algorithms/03-policy-evaluation.md)
* [Preset Architecture](./preset.md)
* [Execution Algorithm](./algorithms/04-execution.md)
