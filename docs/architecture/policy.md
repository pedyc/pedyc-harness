# Policy 架构

> Policy 决定**一次任务允许 Agent 做什么**,以及不满足约束时如何拒绝。它是 Harness 的约束面。
>
> 字段表、函数签名与类型形状见 [Policy 契约](../interfaces/policy.md);配置如何继承与合并见
> [Preset 设计](./preset.md)。本目录只回答:是什么、什么时候执行、如何参与决策。

## 1. 是什么

Policy 是 `.harness/policy.json` 这一份**扁平设置对象**。它不是规则引擎:没有条件、没有效果、
没有优先级、没有冲突解决,也没有决策对象。它只回答四个问题:

| 它约束什么 | 依据 | 在哪个决策点生效 |
| ------------------ | ---------------------- | -------------------------------------- |
| 允许改哪些文件 | `allowedProductPaths` | Coder 返回后,Harness 比对文件快照 |
| 允许跑哪些命令 | `allowedAgentCommands` | 每次启动 Provider 之前 |
| 必须通过哪些闸门 | `requiredChecks` | Tester 阶段逐个执行 |
| 最多重试几次 | `maxIterations` | 编排循环的迭代上限 |

Policy 描述的是「**这一次**允许做什么」,不是「Agent 理论上能做什么」。允许集合之外的一切都视为
越界,不需要额外声明禁止项。

> **目标(M7)** 目标形态在四类判定之外增加第五类:**规则处置**——规则实现产生 Finding,Policy 声明
> 该规则有多严重、该怎么处置。它仍然是**处置声明**,不是条件匹配,见 §5.1。

## 2. 什么时候执行

Policy 在五个不同时机被读取,后果各不相同:

| 时机 | 动作 | 不满足时 |
| -------------------- | -------------------------------------------- | ------------------------ |
| `init` | Preset 的 `policy` 原样写成 `.harness/policy.json` | — |
| `verify`(命令) | `validatePolicy` 校验形状,并断言 `requiredChecks` 的脚本确实存在于 `package.json` | 非零退出,不进入执行 |
| `run` 加载阶段 | `validatePolicy`,不通过即终止 | 运行失败,不调用任何 Agent |
| 每次 Provider 调用前 | `isCommandAllowed` | 该阶段失败 |
| 每次 Coder 返回后 | `findOutOfScopeChanges`(快照 diff) | Reviewer 判定不通过 |

范围判定的位置很关键:**它在 Coder 之后、Reviewer 之前**,依据是 Harness 自己的文件快照比较,
而不是 Agent 的声明。这是「实际改了什么」与「允许改什么」的直接比对。

## 3. 如何参与决策

三个函数各自是一个决策点,且都只读 Policy、不产生副作用:

| 函数 | 决策 | 语义要点 |
| ------------------------ | -------------------------- | ---------------------------------------------------- |
| `validatePolicy` | 这份配置能不能用 | 输入是不受信任的 JSON;返回问题描述或 `null` |
| `isCommandAllowed` | 这次调用放不放行 | 允许列表为空 = 不限制 |
| `findOutOfScopeChanges` | 这批改动算不算越界 | **前缀匹配**,不是 glob |

编排层消费它们的返回值:命令不被允许 → 该 Provider 阶段失败;存在越界文件 →
`reviewerApproved` 直接不通过,**即使 Reviewer 自己批准了**。范围检查留在 Harness 侧,是刻意的
设计——把判定权交给被检查的一方没有意义。

前缀匹配的实际含义:允许 `src/` 会同时允许 `src/anything` 与 `src-other/file.ts`。要表达「目录
之内」,路径必须以 `/` 结尾。

## 4. 已知的执行缺口

当前 Policy 的**表达能力强于它的执行力**。以下字段会被 schema 接受,但不产生任何效果:

| 字段 | 现状 |
| ------------------ | ------------------------------------------------------------ |
| `protectedPaths` | 只校验形状,从不与改动比对 |
| `forbiddenCommands` | 没有任何代码读取 |
| `agentTimeoutMs` | `runCommand` 不设置超时,挂起的 Provider 会一直挂起 |

还有一处容易误判:**`maxIterations`、`protectedPaths`、`requiredChecks` 在类型上可选,但不写就会被
`validatePolicy` 拒绝**。契约中给出了完整的字段与约束对照表。

这些缺口是当前实现的状态,不是设计意图。要依赖其中任何一项,必须先让它在代码中被强制执行。

## 5. 目标形态

> **目标(M7、M19)** 目标形态有两条方向,职责不同。以下内容均**未实现**:当前既没有合并语义,
> 也没有规则处置层。

### 5.1 规则处置层(M7)

规则实现产生 Finding,Policy 声明 `rule id → severity → action`:

| Severity | 默认 Action | 含义 |
| --------- | ----------- | -------------------- |
| `error` | `reject` | 判定不通过 |
| `warning` | `review` | 需 Reviewer 确认后才算通过 |
| `info` | `report` | 只记录,不影响判定 |

三点必须守住:

- **Policy 声明处置,不声明匹配。** 条件表达式、优先级与冲突解决仍不进入 `policy.json`;匹配逻辑
  属于内置 checker 或 Preset 注册的规则(见 [Preset 设计 §8](./preset.md))。
- **统一 Evaluator。** 文件、命令、规则三类判定由同一个 Policy 模块给出结论,避免"文件一套逻辑、
  命令一套逻辑、规则又一套逻辑"。
- **severity 属于安全语义。** 更高层只能收紧(把 `warning` 提升为 `error`、把 `report` 改为
  `reject`),不能放宽;降低级别、关闭规则、把 `reject` 改为 `report` 都视为放宽,必须被拒绝。

详见 [ADR-004](../decisions/ADR-004-policy-severity-rules.md)与[治理流水线](./governance.md)。

### 5.2 配置组合语义(M19)

多个 Preset 合并时,默认值类配置可以被覆盖,安全类约束只能收紧(deny-wins),不可被普通 Override
解除。这解决的是「谁的配置说了算」,与 5.1 的「哪条规则怎么处置」是两件事。

见 [Preset 设计](./preset.md)与[里程碑路线](../milestones/milestones.md)。

## 6. 边界

Policy **不负责**:调用 Provider、执行验证、构建 Preset 依赖图、解析 CLI 参数。它也不负责"发现
问题"——匹配由规则实现完成,Policy 只决定发现之后的处置。它只根据上下文与规则产生判定结果,由编排
层据此决定后续行为。

Policy 也**不感知技术栈**。Vue 或 React 的特殊规则属于 Preset,不属于 Policy 的字段。

## 7. 相关文档

- [Policy 契约](../interfaces/policy.md) — 字段表、约束与三个函数
- [系统架构](./system.md) — 一次 Run 的执行顺序
- [治理流水线](./governance.md) — Findings 如何被处置、如何回流
- [Preset 架构](./preset.md) — 目标形态下的配置合成与规则来源
- [验证架构](./verification.md) — `requiredChecks` 如何被判定
- [ADR-004](../decisions/ADR-004-policy-severity-rules.md) — 严重级别规则层
