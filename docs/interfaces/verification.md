# 验证契约

> 一次运行里"通过"是如何被判定的,以及判定依据被记录成什么。
>
> 来源:`packages/core/src/contracts/validation.ts`、`packages/core/src/runtime/approval-gate.ts`、
> `packages/cli/src/run.ts`。

## 1. 闸门如何执行

验证闸门来自 `policy.requiredChecks`。每个条目是一个
**包脚本名**,由探测到的包管理器执行:

| 锁文件 | 实际调用 |
| ------------------ | ------------------ |
| `pnpm-lock.yaml` | `pnpm run <script>` |
| `yarn.lock` | `yarn <script>` |
| 其他 | `npm run <script>` |

脚本**串行**执行,没有并行调度、没有依赖关系、没有失败跳过语义。

`pedyc-harness verify` 会先断言这些脚本名在目标项目的 `package.json` 中确实存在,否则直接失败并
报出缺失的脚本名。

## 2. 记录类型

整个验证面只有一个类型:

```ts
interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'
  details: string
}
```

| 字段 | 内容 |
| --------- | -------------------------------------------------------------- |
| `command` | 形如 `pnpm run build` 的可读命令串 |
| `result` | 退出码为 0 时 `'pass'`,否则 `'fail'` |
| `details` | 失败时取 stderr;成功时为固定文案 `Command completed successfully.` |

## 3. 阶段通过条件

两条判定都在 Harness 侧,不采信 Agent 的自我描述:

```ts
testerApproved(verification, externalTest) =
  verification.every((check) => check.result === 'pass')
  && externalTest.ok
  && externalTest.payload.approved === true

reviewerApproved(reviewer, outOfScopeChanges) =
  reviewer.ok
  && reviewer.payload?.approved === true
  && outOfScopeChanges.length === 0
```

两个要点:

- **Tester 通过需要两个独立条件同时成立**:所有闸门真的通过,且外部 tester 认可它收到的证据。
  没有闸门时 `every` 为 `true`,因此 `requiredChecks` 为空意味着验证形同虚设。
- **范围检查由 Harness 执行**,不交给 Agent。即使 reviewer 批准,只要有越界文件就判定不通过。

> **目标(M8)** 第二条判定扩展为 Findings:Finding 携带 rule id、目标、级别与是否可修复,Gate 按
> Policy 的 `severity → action` 处置;**可修复**的 Findings 回 Coder,**不可修复**的终止,越界改动
> 仍然不参与映射、直接终止。形状见 §8。

## 4. 重试

Tester 未通过时回到 Coder,上限为 `min(input.maxIterations, policy.maxIterations)`,缺省 3。
Coder 会收到上一轮完整的 `verification` 数组作为 `previousVerification`——这是失败原因回流给
Agent 的唯一通道。

Planner、Coder、Reviewer 任一失败都会**直接终止**,不重试。

## 5. 产物

每次运行写入 `.harness/runs/<runId>/`:

| 文件 | 写入时机 |
| -------------------------------------- | ---------------------------- |
| `input.json` | 编排开始前 |
| `policy.json` | 编排开始前 |
| `iteration-<n>-verification.json` | 每轮 Tester 之后 |
| `output.json` | 结束时的最终 `RunResult` |

`runId` 由 ISO 时间戳去掉非数字字符后取前 14 位生成。

## 6. 尚未记录的内容

> **目标(M8)** 下列内容均**未实现**,`VerificationCheck` 里没有对应字段:
>
> - 退出码的结构化记录(现在只折叠成 `pass`/`fail`)
> - stdout 留存与截断策略
> - 每条闸门的耗时与起止时间戳
> - 统一的 `ValidationEvidence` 模型与证据持久化

因此「Agent 的自我描述不是证据」这条原则在当前实现里只做到了**结果层面的独立执行**,尚未做到
**过程层面的可复核**。

## 7. 另一条独立闸门:`verify` 命令

`pedyc-harness verify` 是**配置闸门**,不属于 `run` 的四阶段循环。它依次检查:`.harness/` 配置与
schema 是否齐全、JSON 是否可解析、`validatePolicy` 是否通过、`agents` 形状是否合法、
`requiredChecks` 对应的 npm 脚本是否存在。

若项目存在 `.harness/verify.mjs`,则用它以 `--root <项目根>` 调用该脚本,并**透传其退出码**。
这条钩子只在 `verify` 命令里执行,`run` 流程不会调用它。

## 8. 目标(M8):Evidence 与 Finding

> **目标(M8)** 以下形状**尚未实现**,字段名以落地时的 Schema 为准。语义见
> [治理流水线](../architecture/governance.md)与 [ADR-004](../decisions/ADR-004-policy-severity-rules.md)。

```ts
type EvidenceTrust = 'harness-executed' | 'analyzer-derived' | 'review-derived' | 'agent-claimed'
type Severity = 'error' | 'warning' | 'info'

interface Evidence {
  id: string
  source: string            // 内置 checker 的 id,或 Preset 注册的 provider id
  trust: EvidenceTrust
  command?: string
  exitCode?: number
  durationMs?: number
  stdoutDigest?: string
  stderrDigest?: string
  skipped?: boolean
}

interface Finding {
  rule: string              // 对应 policy.rules 的 key
  target: string            // 例如某个文件
  severity: Severity
  reason: string
  retryable: boolean        // 由 Finding 自己声明,不由 Agent 事后解释
  confidence?: number       // 仅供排序与路由人工,不参与判定
  evidence?: readonly string[]  // 必须能在本轮快照/diff 中找到,否则丢弃
}

interface ReviewResult {
  findings: Finding[]
  approved?: boolean        // 兼容当前形状;最终判定仍由 Harness 给出
}
```

六条要点:

- 没有任何 Evidence 时 Reviewer **不得批准**;
- `agent-claimed` 只能作为线索进入上下文,**不参与判定**;`review-derived` 是 Harness 派发的观察,
  与被检查方的自述分开记录;
- `warning` 需要 Reviewer 明确确认,未确认即不通过;`info` 只记录;
- `confidence` 与启发式分数**不参与判定**——模型自报的置信度仍是自我描述,只能用于排序与路由人工;
- `Finding.evidence` 里的路径必须能在本轮快照/diff 中找到,否则视为幻觉并丢弃(呼应 M8 的
  "Agent claim ≠ Actual Change");
- 越界改动与受保护路径命中**不参与** `severity → action` 映射,直接终止。

## 9. 目标(M8):语义检查声明

> **目标(M8)** 以下形状**尚未实现**,字段名以落地时的 Schema 为准。语义与边界见
> [ADR-005](../decisions/ADR-005-semantic-governance.md)。

```ts
type SemanticTrigger =
  | { kind: 'rules'; rules: readonly string[] }              // 规则命中即触发
  | { kind: 'score'; threshold: number }                     // 分数阈值
  | { kind: 'any'; triggers: readonly SemanticTrigger[] }    // 任一命中

interface SemanticVerification {
  id: string
  type: 'semantic'
  prompt: string                  // 包内相对路径;提示词是数据,不是代码
  trigger: SemanticTrigger
  severity: Severity              // 默认级别,可被 policy.rules 覆盖
  evidence?: readonly string[]    // 需要哪些 Evidence 作为输入
  role?: string                   // 由哪个 Provider role 承接,默认 reviewer
}
```

六条要点:

- 声明里**没有**模型、端点与凭证:调用由 Harness 调度,Preset 只表达需求;不新增独立的
  `LLMProvider` 注册表,而是复用既有 Provider role 与 stdin/stdout 协议。
- `prompt` 是数据不是代码,因此可 diff、可审计、可被项目覆写。
- 触发是 `规则命中 OR 分数阈值`:单一分数会漏检,把权重与阈值放进 Preset 会让它变成不可审计的
  调参器。
- 被触发的多条检查**按轮批量合成一次调用**;调用次数由触发决定,不由检查条数决定。
- `confidence` 与分数**不参与判定**,只用于排序与路由到人工。
- 预算耗尽:`warning` 记 `skipped`,`error` fail-closed;`--semantic=disabled` 必须写入 Run Record。

## 10. 目标(M8):检查声明与可执行约束

> **目标(M8)** 以下形状**尚未实现**,字段名以落地时的 Schema 为准。语义与合并规则见
> [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)。

```ts
type RuleKind = 'constraint' | 'preference' | 'instruction' | 'verification'
type VerificationKind = 'command' | 'structural' | 'heuristic' | 'semantic'
type ConstraintOperator = '<=' | '>=' | '<' | '>' | '==' | 'in' | 'not-in'

interface Constraint {
  target: 'css' | 'json' | 'text' | 'dependency' | 'path' | string
  property: string                  // 例如 "animation-duration"
  operator: ConstraintOperator
  value: string | number | readonly string[]
}

interface CheckDeclaration {
  id: string                        // rule id;policy.rules 用它覆盖处置
  kind: RuleKind
  verification: VerificationKind
  severity: Severity                // 默认级别,只能被 policy.rules 收紧
  constraint?: Constraint           // 声明式约束;需要计算的检查改用 analyzer
  analyzer?: string                 // 结构验证:分析器 id(内置或 Preset 注册)
  command?: string                  // 命令验证:要执行的脚本名
}
```

要点:

- **`kind` 决定合并语义**(`constraint` → deny-wins、`preference` / `instruction` → append、
  `verification` → union),不由字段名决定;项目只能收紧 `severity`,不能改 `kind`。
- **声明式约束有表达力上限**:它只能表达「取一个属性与一个值比较」。需要计算、跨文件推理或理解意图的
  检查必须由 `analyzer` 实现,不能硬塞进 `constraint`。
- **分析器与规则解耦**:分析器只产出事实(`duration = 1s`),规则只做比较,两者可以由不同的包提供;
  因此第三方可以只发布分析器(纯计算、无网络),见
  [ADR-003](../decisions/ADR-003-preset-as-code.md)。
- **「语义」只指 `verification: 'semantic'`**;用 AST 提取属性值属于 `structural`,不是 semantic。
- 同一个 rule id 的冲突按 `安全语义优先 → 同 kind 按层级 → 仍未定则记入 conflicts` 判定,
  **记录不可省略**。

## 11. 相关文档

- [Core 契约](./core.md) · [Policy 契约](./policy.md) · [Provider 契约](./provider.md)
- [Preset 契约](./preset.md) — Evidence Provider 与检查声明如何被注册
- [Verification 设计](../architecture/verification.md) · [治理流水线](../architecture/governance.md)
- [ADR-005](../decisions/ADR-005-semantic-governance.md) · [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)
- [里程碑路线](../milestones/milestones.md)
