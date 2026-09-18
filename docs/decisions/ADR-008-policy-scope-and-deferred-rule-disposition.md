# ADR-008 — Policy 的范围与推迟的规则处置层

* **Status:** Accepted
* **Date:** 2026-09-18
* **Supersedes:** [ADR-004](./ADR-004-policy-severity-rules.md)
* **Related:** [ADR-006](./ADR-006-run-lifecycle.md)、[ADR-007](./ADR-007-rule-kinds-and-constraints.md)

## 1. Context

M7 让 Policy 真正可执行时,一度把第五类判定——**规则处置层**——也放进了 `policy.json`:
`rules: Record<string, RuleSetting>` 与 `severityActions`。落地到实现时暴露了一个具体事实:

**没有任何 rule 实现存在。** 产出 Finding 的分析器属于 M8,Preset 注册规则属于 M21。因此
`rules` 的唯一合法值是空对象:实现里 `knownRules` 为空,任何 id 都会报「未知 rule id」。也就是
说,这个字段在发布的那一刻就已经是「**被 schema 接受、却没有任何效果**」的字段。

这正是 M7 本身要清除的缺陷。M7 之前,`protectedPaths`、`forbiddenCommands`、`agentTimeoutMs`
三个字段被 schema 接受、被文档描述,却没有任何代码读它们;整个里程碑的工作就是把这类字段变成真的
拦,或者不再宣称它存在。再放一个新的进去是自相矛盾。

同时,ADR-004 自己也留了余地:`docs/interfaces/policy.md` 在描述该形状时写着「**未实现**,字段名
以落地时的 Schema 为准」,即这个形状本来就是暂定的。而 ADR-007 规定默认级别与合并语义由规则的
`kind` 决定,这暗示项目侧真正的覆盖面可能该按 `kind` 而不是按 `rule id` 组织——在第一个 checker
出现之前无从判断。

## 2. Decision

### 2.1 Policy 的职责收敛为四类

Policy 回答「这一次允许做什么」,不做规则引擎:

| 分组                  | 回答的问题           | 字段                                                          |
| --------------------- | -------------------- | ------------------------------------------------------------- |
| Scope                 | 允许改哪些文件       | `allowedProductPaths`、`protectedPaths`                        |
| Command Constraints   | 允许跑哪些命令       | `forbiddenCommands`、`allowedAgentCommands`                    |
| Execution Constraints | 边界在哪             | `requiredChecks`、`maxIterations`、`agentTimeoutMs`、`maxChangedFiles` |
| Enforcement           | 违规怎么处置         | `onViolation`                                                  |

**分组是文档大纲,不是结构。** 文档保持扁平:字段名不依赖它属于哪一组,重新分组因此不是破坏性变更。

### 2.2 规则处置层推迟到 M8

`rules` 与 `severityActions` 从 Schema、契约与校验中移除,连同只为它们存在的处置基础设施。
它们与**第一个 rule 实现**同批回来,那时才有真实占用者来决定形状:`rule id` 是否需要 Preset
限定、覆盖是按 id 还是按 `kind`、`enabled` 是否属于安全语义。

### 2.3 ADR-004 的实质主张仍然成立

被推翻的是**落地时间与字段形状**,不是分工本身:

> 规则实现回答「发现了什么」,Policy 回答「这有多严重、该怎么处置」。

处置仍归声明侧(否则项目只能 fork Preset 才能收紧一条规则),匹配仍归实现侧(否则 `policy.json`
会变成规则引擎)。`severity` 只能收紧、不能放宽,仍然成立。

### 2.4 声明即消费

新增一条不变量,防止同类问题重现:

> **Schema 里的新字段必须同时给出读取者。** 没有读取者的形状只能作为目标设计写在文档里,不能进
> Schema。M7 之前 `protectedPaths` 的两年(两个里程碑)沉默期,就是因为这条不变量不存在。

## 3. Consequences

### Positive

* 发布出去的 `policy.json` 不再包含唯一合法值为空的字段;「声明了就有效」这句话重新为真。
* 规则处置表的形状由第一个真实 checker 决定,而不是由猜测决定,避免发布后改名的破坏性变更。
* Policy 的职责边界被写成四类,审查时可以直接问「这个字段属于哪一类,谁读它」。

### Negative

* ADR-004 的两条验收标准(「未知 rule id 报错」「放宽 severity 被拒绝」)随字段一起挪到 M8,
  M7 的定义完成范围因此变小——这是刻意的取舍,不是遗漏。
* 已经写好的处置基础设施(`knownRules`、`actionFor`、只能收紧的校验、相关测试)被删除;
  这部分工作要等 M8 重做,届时形状可能不同。
* `preset.json` 的 `rules`(声明规则文件路径)保留不动:它是 Preset 侧的**声明**入口,属 M21,
  与 `Policy.rules`(处置)不是同一件事。两者何时合流由 M21 决定。

## 4. Alternatives

| 方案 | 为什么没选 |
| ---- | ---------- |
| 保留 `rules`,发布时标注「暂无效果」 | 正是 M7 要清除的状态;文档标注挡不住「写了就以为生效」 |
| 把处置写进规则自己的声明(Preset / 内置) | 项目无法收紧单条规则,只能 fork Preset——ADR-004 已否决 |
| 单独一份 `.harness/rules.json` | Policy 干净且可收紧,但与「manifest 不定义 rules」的结论冲突,且仍要先有 rule id 才能定义形状 |
| 保留 `severityActions`(全局映射,非每规则表) | 同样没有消费者:没有 Finding 就没有 severity 可映射 |

## 5. Core Principle

> **先有消费者,再有字段。** 形状可以暂定,但一个唯一合法值为空的字段发布出去,就是把「声明」
> 当成了「实现」。
