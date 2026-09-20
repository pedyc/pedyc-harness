# Policy 契约

> `.harness/policy.json` 的形状,以及三个真正执行它的函数。
>
> 来源:`packages/core/src/contracts/policy.ts`、`packages/core/src/config/policy.ts`、`packages/core/src/runtime/policy-engine.ts`。

## 1. 类型

```ts
type AgentMode = 'internal' | 'external'
type AgentRole = 'planner' | 'coder' | 'tester' | 'reviewer'
type Severity = 'error' | 'warning' | 'info'
type RuleAction = 'reject' | 'review' | 'report'

interface CommandPolicy {
  allowedAgentCommands?: string[]
}

interface RuleSetting {
  severity?: Severity   // 只能在规则声明的级别上收紧
  action?: RuleAction   // 只能在默认映射上收紧
}

interface Policy extends CommandPolicy {
  allowedProductPaths: string[]
  maxIterations?: number
  protectedPaths?: string[]
  requiredChecks?: string[]
  forbiddenCommands?: string[]
  agentTimeoutMs?: number
  maxChangedFiles?: number
  onViolation?: 'fail' | 'report'
  rules?: Record<string, RuleSetting>
  severityActions?: Partial<Record<Severity, RuleAction>>
}
```

## 2. 字段与真实约束

类型上的可选性与运行时的实际要求**不一致**,下表是实际行为:

| 字段                   | 类型上必需 | `validatePolicy` 的要求    | 是否被强制执行                                     |
| ---------------------- | ---------- | -------------------------- | -------------------------------------------------- |
| `allowedProductPaths`  | ✅          | 非空数组                   | ✅ `evaluateFiles`,前缀匹配                         |
| `maxIterations`        | ❌          | **正整数**(缺失即拒绝)     | ✅ `executor` 用它钳制 Coder 重试上限               |
| `protectedPaths`       | ❌          | **必须是数组**(缺失即拒绝) | ✅ `evaluateFiles`,命中即拒绝并单独报告             |
| `requiredChecks`       | ❌          | **必须是数组**(缺失即拒绝) | ✅ 逐个作为验证闸门执行,执行前先过命令策略          |
| `forbiddenCommands`    | ❌          | 必须是数组                 | ✅ `evaluateCommand`,在进程创建之前拒绝             |
| `agentTimeoutMs`       | ❌          | 正整数                     | ✅ 传给 `runCommand`,到期终止该次 Provider 调用     |
| `allowedAgentCommands` | ❌          | 必须是数组                 | ✅ `evaluateCommand`,精确成员名;denial 优先         |
| `maxChangedFiles`      | ❌          | 正整数                     | ✅ `evaluateChangeBudget`,按单次 Coder 迭代计数     |
| `onViolation`          | ❌          | `'fail'` \| `'report'`     | ✅ 决定违规是否升级为运行失败                       |
| `rules`                | ❌          | 对象;key 必须是已声明的 rule id,**只能收紧** | ✅ `evaluateFindings` 解析每条 Finding 的严重级别与处置 |
| `severityActions`      | ❌          | 对象;**只能收紧**默认映射   | ✅ `actionFor`,默认 `error→reject`、`warning→review`、`info→report` |

字段分成四组,这是**文档大纲,不是结构**:文档保持扁平,字段名不因分组而改变。

| 分组                 | 字段                                                          |
| -------------------- | ------------------------------------------------------------- |
| Scope                | `allowedProductPaths`、`protectedPaths`                        |
| Command Constraints  | `forbiddenCommands`、`allowedAgentCommands`                    |
| Execution Constraints| `requiredChecks`、`maxIterations`、`agentTimeoutMs`、`maxChangedFiles` |
| Enforcement          | `onViolation`、`rules`、`severityActions`                       |

**要点:`maxIterations`、`protectedPaths`、`requiredChecks` 在类型上可选,但不写就会被
`validatePolicy` 拒绝。** 只有 `allowedProductPaths`、`maxIterations`、`protectedPaths`、
`requiredChecks` 四项齐全的文档才能通过校验。

**`rules` 的 key 必须由实现声明。** 今天声明表只有一处:内置规则
(`packages/core/src/config/rules.ts`),包含 M7 的文件/命令/预算规则与
`change.claimed-file-missing`。Preset 注册规则属于 M21 的代码扩展契约。一个没人声明的 key 会被
`validatePolicy` 拒绝——为不存在的规则写覆盖,读起来与实际生效的规则一模一样。

`onViolation` 控制的是**违规的处置级别**,不是危险副作用的开关:被拒绝的命令在任何模式下都
不会被启动。见 [ADR-006](../decisions/ADR-006-run-lifecycle.md) §2.3。

### forbiddenCommands

`forbiddenCommands` 用于禁止执行特定命令模式。

匹配对象为 Agent 请求执行的 `command + args`，而不是单纯的可执行文件名。

Harness 在 Policy Evaluation 前对命令进行解析和规范化，并以 token 序列进行匹配。

例如：

- `npm publish` → 命中 `npm publish`
- `npm publish --tag beta` → 命中 `npm publish`
- `npm publish-notes` → 不命中 `npm publish`
- `sudo npm publish` → 规范化后命中 `npm publish`

第一版不支持正则表达式或任意字符串子串匹配。

命令匹配采用“有序 token 序列包含”语义：
规则中的 token 必须连续出现在规范化后的命令 token 中。

Shell wrapper、命令链和 shell 字符串的深入解析属于后续安全模型，不由基础字符串匹配解决。

## 3. 导出面

```ts
// 校验(配置层)
validatePolicy(policy: unknown): string | null
policyProblems(policy: unknown): ConfigProblem[]

// 四类判定共用的 Policy Evaluator(运行时)
evaluateFiles(files: string[], policy: Policy): PolicyDecision
evaluateCommand(command: string, args: string[], policy: CommandPolicyContext): PolicyDecision
evaluateChangeBudget(changedCount: number, policy: Policy): PolicyDecision
evaluateFindings(findings: Finding[], policy: Policy, confirmed?: string[]): FindingDecision

// 处置映射与兼容展示
actionFor(severity: Severity, policy: { severityActions?: … }): RuleAction
findOutOfScopeChanges(files: string[], policy: Policy): string[]
isCommandAllowed(command: string, policy: CommandPolicy): boolean
refusedFiles(violations: PolicyViolation[]): string[]
describeFileViolations(violations: PolicyViolation[]): string

// 内置规则声明表(配置层)
builtInRules: Readonly<Record<string, CheckDeclaration>>
knownRule(rule: string): CheckDeclaration | null
defaultActionFor(severity: Severity): RuleAction
```

`PolicyDecision` 是各类判定共同的结论形状:`{ allowed, violations }`,其中每条
`PolicyViolation` 带 `kind`(file / command / rule)、`rule`、`target`、`severity`、
`action`、`reason`、`retryable`。各类的 `action` 都已在 evaluator 内与项目的 `onViolation`、
`severityActions` 调和过,调用方不再自行推导。`FindingDecision` 在此基础上多一个 `unknown`:
没人声明的 rule id 列表。

- **`validatePolicy` / `policyProblems`** —— 校验从磁盘读到的文档。输入是 `unknown`(不受信任的
  JSON),返回问题描述或全部问题。返回 `null` / 空数组的调用方可以把它当作 `Policy` 使用。除形状
  之外还会拒绝放宽 `rules` / `severityActions` 的配置。
- **`evaluateFiles`** —— 文件判定。`protectedPaths` 与 `allowedProductPaths` 两条规则独立触发;
  同一文件可以同时命中两者(受保护路径通常就在允许集合内)。
- **`evaluateCommand`** —— 命令判定。`forbiddenCommands` 与 `allowedAgentCommands` 两条规则,
  denial 优先于 allowance。
- **`evaluateChangeBudget`** —— 单次 Coder 迭代的改动文件数上限。
- **`evaluateFindings`** —— 规则判定。取「规则声明的级别」「`policy.rules` 覆盖」「Finding 自述」
  三者中最严格者,再由 `actionFor` 得到处置。`warning → review` 需要 Reviewer 确认(见
  [验证契约](./verification.md) §3);未知 rule id 不产生判定,只记入 `unknown`,由调用方失败。
- **`actionFor`** —— severity 的默认映射,`severityActions` 只能收紧;夹紧逻辑在 evaluator 内也
  再执行一次,使未经校验的内存对象无法放宽安全语义。
- **`findOutOfScopeChanges`** —— `evaluateFiles` 的投影,只返回 `allowedProductPaths` 规则命中的
  文件;`isCommandAllowed` 是允许列表的精确成员判断(空表表示不限制)。两者保留是为了兼容已发布
  的 `./policy` 子路径。

## 4. 语义细节

文件路径使用**前缀匹配**,不是 glob:

```ts
files.filter((file) => !policy.allowedProductPaths.some((p) => file.startsWith(p)))
```

因此 `allowedProductPaths: ["src/"]` 会允许 `src/anything`,也会允许前缀相同的
`src-other/file.ts`。路径必须以 `/` 结尾才能表达"目录之内"。`protectedPaths` 用同一个匹配器,
方向是过度保护而非漏保护,因此这条已知缺陷记录在这里而不是就地修正。

命令匹配的语义见下方 `### forbiddenCommands`。

## 5. 规则处置层(已实现)

```ts
type Severity = 'error' | 'warning' | 'info'
type RuleAction = 'reject' | 'review' | 'report'

interface RuleSetting {
  severity?: Severity   // 覆盖规则声明的默认级别(只能收紧)
  action?: RuleAction   // 覆盖默认映射(只能收紧)
}

interface Policy extends CommandPolicy {
  // ...§1 的字段...
  rules?: Record<string, RuleSetting>
  severityActions?: Partial<Record<Severity, RuleAction>>
}
```

落地时守住的约束:

- `rules` 的 key 是 **rule id**,由实现声明;**匹配逻辑不在 Policy 里**。
- `severity` 只能被更高层**收紧**,不能被放宽。`enabled` **尚未提供**:判定哪些规则属于不可关闭的
  安全规则需要 M19 的安全模型。
- 默认映射为 `error → reject`、`warning → review`、`info → report`;由 `actionFor` 解析,可被
  `severityActions` 覆盖——但只能更严格。
- Reviewer 报告一个没人声明的 rule id 时,运行以 `agent_error` 结束并列出该 id;这条 Finding
  不会被静默丢弃,也不会被猜一个级别出来。
- 越界改动与受保护路径命中**不参与** `severity → action` 映射:它们由 `allowedProductPaths` /
  `protectedPaths` 两条规则直接判定,`onViolation` 是它们唯一的兼容退路。

> **目标(M19)** 规则化的 Policy(条件与效果)、多 Policy 优先级与冲突解决、deny-wins 合并、
> 不可被普通 Override 解除的安全约束——以上**未实现**。当前 Policy 仍是扁平设置对象 + 处置表,
> 不存在条件表达式,也没有决策对象。

### 目标形态的其余部分

规则的**种类**(`constraint` / `preference` / `instruction` / `verification`)由规则声明设定,决定默认
合并语义与默认级别;Policy 只覆盖处置,不能改 kind。`CheckDeclaration`(`id` / `kind` /
`verification` / `severity`)已经存在并被内置规则表使用,完整的合并语义(deny-wins、conflicts)
属于 M17。形状见[验证契约](./verification.md) 与
[ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)。

语义检查通过 `SemanticVerification` 声明自己的**默认级别**(见[验证契约](./verification.md)),
`policy.rules` 覆盖它;匹配逻辑仍不在 Policy 里,模型与凭证也不在语义检查的声明里
(见 [ADR-005](../decisions/ADR-005-semantic-governance.md))。

见[Preset 契约](./preset.md)与[里程碑路线](../milestones/milestones.md)。

## 6. 相关文档

- [Core 契约](./core.md) · [Provider 契约](./provider.md) · [验证契约](./verification.md)
- [Preset 契约](./preset.md) · [Policy 设计](../architecture/policy.md)
- [治理流水线](../architecture/governance.md) · [ADR-004](../decisions/ADR-004-policy-severity-rules.md)
