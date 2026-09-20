# Policy 架构

> Policy 决定**一次任务允许 Agent 做什么**,以及不满足约束时如何拒绝。它是 Harness 的约束面。
>
> 字段表、函数签名与类型形状见 [Policy 契约](../interfaces/policy.md);配置如何继承与合并见
> [Preset 设计](./preset.md)。本目录只回答:是什么、什么时候执行、如何参与决策。

## 1. 是什么

Policy 是 `.harness/policy.json` 这一份**扁平设置对象**加上一张**处置表**。它不是规则引擎:没有
条件、没有效果、没有优先级、没有冲突解决,也没有决策对象。它只回答五个问题:

| 它约束什么       | 依据                                    | 在哪个决策点生效                        |
| ---------------- | --------------------------------------- | --------------------------------------- |
| 允许改哪些文件   | `allowedProductPaths`                   | Coder 返回后,Harness 比对文件快照       |
| 不许改哪些文件   | `protectedPaths`                        | 同上,命中即拒绝并单独报告                |
| 允许跑哪些命令   | `allowedAgentCommands`、`forbiddenCommands` | 每次启动 Provider 与验证命令之前    |
| 必须通过哪些闸门 | `requiredChecks`                        | Tester 阶段逐个执行                     |
| 最多重试几次     | `maxIterations`、`maxChangedFiles`      | 编排循环的迭代上限与单次改动上限        |
| 规则怎么处置     | `rules`、`severityActions`              | Finding 产生之后,由 `actionFor` 解析    |

字段的类型、必需性与逐条约束见 [Policy 契约](../interfaces/policy.md) §2——本文不复制那张表。

Policy 描述的是「**这一次**允许做什么」,不是「Agent 理论上能做什么」。允许集合之外的一切都视为
越界,不需要额外声明禁止项。

规则处置层**已随第一个 rule 实现落地**:规则实现产生 Finding,Policy 声明该规则有多严重、该怎么
处置(见 §5.1)。它仍然是**处置声明**,不是条件匹配。

## 2. 什么时候执行
Policy 在五个不同时机被读取,后果各不相同:

| 时机                 | 动作                                                                              | 不满足时                  |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| `init`               | Preset 的 `policy` 原样写成 `.harness/policy.json`                                | —                         |
| `verify`(命令)       | `validatePolicy` 校验形状(含 `rules` 只能收紧),并断言 `requiredChecks` 的脚本确实存在于 `package.json` | 非零退出,不进入执行 |
| `run` 加载阶段       | `validatePolicy`,不通过即终止                                                     | 运行失败,不调用任何 Agent |
| 每次 Provider 调用前 | `evaluateCommand` | 该阶段失败 |
| 每条验证命令执行前 | `evaluateCommand` | 该闸门不执行,判定为不通过 |
| 每次 Coder 返回后 | `evaluateFiles`、`evaluateChangeBudget`(快照 diff) | Reviewer 判定不通过 |
| Reviewer 返回后 | `evaluateFindings`(Finding → severity → action) | 按处置决定重试或终止 |

范围判定的位置很关键:**它在 Coder 之后、Reviewer 之前**,依据是 Harness 自己的文件快照比较,
而不是 Agent 的声明。这是「实际改了什么」与「允许改什么」的直接比对。

## 3. 如何参与决策

三个函数各自是一个决策点,且都只读 Policy、不产生副作用:

| 函数                    | 决策               | 语义要点                                    |
| ----------------------- | ------------------ | ------------------------------------------- |
| `validatePolicy`        | 这份配置能不能用   | 输入是不受信任的 JSON;返回问题描述或 `null` |
| `isCommandAllowed`      | 这次调用放不放行   | 允许列表为空 = 不限制                       |
| `findOutOfScopeChanges` | 这批改动算不算越界 | **前缀匹配**,不是 glob                      |
| `evaluateFindings`      | 这批 Finding 怎么处置 | 取声明、项目覆盖与自述三者中最严格者;未知 rule id 不判定 |
| `actionFor`             | 这个 severity 对应什么 action | 默认映射,可被 `severityActions` 收紧 |

编排层消费它们的返回值:命令不被允许 → 该 Provider 阶段失败;存在越界文件 →
`reviewerApproved` 直接不通过,**即使 Reviewer 自己批准了**。范围检查留在 Harness 侧,是刻意的
设计——把判定权交给被检查的一方没有意义。

前缀匹配的实际含义:允许 `src/` 会同时允许 `src/anything` 与 `src-other/file.ts`。要表达「目录
之内」,路径必须以 `/` 结尾。

## 4. 执行边界

Policy 的每一个字段现在都真的参与判定(M7 落地前后,`protectedPaths`、`forbiddenCommands`、
`agentTimeoutMs` 曾只被 schema 接受而不产生任何效果)。但**能拦什么、拦不到什么**由观察粒度决定,
这条边界必须写下来,否则会被当成一个做不到的沙箱:

| 能实时拒绝                     | 因为                                |
| ------------------------------ | ----------------------------------- |
| Harness 自己启动的 Provider 命令 | 策略检查发生在进程创建之前          |
| 验证命令                       | 同上                                |
| 受保护路径的**前置**拒绝         | 路径在启动前就已确定                |

| 拦不到                         | 因为                                        |
| ------------------------------ | ------------------------------------------- |
| Agent 进程内部的写入            | 批协议下一次阶段 = 一次进程调用,只能事后从快照差异中发现 |
| 引号内的 shell 字符串           | 只做 token 序列匹配,不做 shell 解析          |

因此命令策略是**护栏,不是沙箱**。详见 [ADR-006](../decisions/ADR-006-run-lifecycle.md) §2.3。

还有一处容易误判:**`maxIterations`、`protectedPaths`、`requiredChecks` 在类型上可选,但不写就会被
`validatePolicy` 拒绝**。契约中给出了完整的字段与约束对照表。

## 5. 目标形态

> **目标(M19)** 配置组合语义(**M17** 的字段级合并与 **M19** 的安全模型)仍未实现:当前既没有合并
> 语义,也没有 deny-wins。

### 5.1 规则处置层(已实现)

`policy.json` 里有规则处置表,规则实现产生 Finding,Policy 声明 `rule id → severity → action`:

| Severity  | 默认 Action | 含义                       |
| --------- | ----------- | -------------------------- |
| `error`   | `reject`    | 判定不通过                 |
| `warning` | `review`    | 需 Reviewer 确认后才算通过 |
| `info`    | `report`    | 只记录,不影响判定          |

已落地的部分与三点约束一一对应:

- **Policy 声明处置,不声明匹配。** 条件表达式、优先级与冲突解决仍不进入 `policy.json`;匹配逻辑
  属于规则实现。今天存在的都是内置规则(`packages/core/src/config/rules.ts` 是它们唯一的声明表),
  Preset 注册规则仍属于 M21 的代码扩展契约。
- **统一 Evaluator。** 文件、命令、规则三类判定由同一个 Policy 模块给出同一形状的结论
  (`PolicyDecision` / `PolicyViolation`),避免"文件一套逻辑、命令一套逻辑、规则又一套逻辑"。
- **severity 属于安全语义。** 更高层只能收紧(把 `warning` 提升为 `error`、把 `report` 改为
  `reject`),不能放宽;`validatePolicy` 会对放宽的配置直接报错,`evaluateFindings` 与 `actionFor`
  也会再夹一次,使未经校验的内存对象同样无法放宽。
- **未知 rule id 报错,而不是静默忽略。** `policy.rules` 的 key 必须由某个实现声明;Reviewer 报告
  一个没人声明的 rule id 会让运行以 `agent_error` 结束,而不是把这条 Finding 丢掉。

`warning` 的"Reviewer 明确确认"具体指:harness 产生的 warning 需要 Reviewer 报告同一条 rule id 才算
确认,未确认按不通过处理;Reviewer 自己报告的 warning 天然是已确认的。

详见 [治理流水线](./governance.md)。

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
