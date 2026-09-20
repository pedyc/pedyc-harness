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

判定所依据的**记录形态**是 `Evidence`(1.3.0 起,来源 `contracts/evidence.ts`):

```ts
type EvidenceTrust = 'harness-executed' | 'analyzer-derived' | 'review-derived' | 'agent-claimed'

interface Evidence {
  id: string
  source: string            // requiredChecks、某个分析器 id,或 tester-claim
  trust: EvidenceTrust
  name?: string
  command?: string          // 形如 `pnpm run build`
  packageManager?: string
  exitCode?: number
  durationMs?: number
  startedAt?: string
  stdoutDigest?: string     // `sha256:<hex>`,覆盖未截断的全文
  stderrDigest?: string
  stdout?: string           // 截断保存,便于复核;digest 才是可比对的那份
  stderr?: string
  skipped?: boolean         // 未执行:被策略拒绝、被禁用或超出预算
  details?: string
}
```

`VerificationCheck` 是 1.2.0 的形状,现在只是 `Evidence` 的投影,由 `toVerificationCheck` 派生:

```ts
interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'    // skipped 或非零退出码即 fail
  details: string
}
```

| 字段 | 内容 |
| --------- | -------------------------------------------------------------- |
| `command` | 形如 `pnpm run build` 的可读命令串 |
| `result` | 真正执行且退出码为 0 时 `'pass'`,否则 `'fail'` |
| `details` | 失败时取 stderr(被拒绝的检查取拒绝理由);成功时为固定文案 `Command completed successfully.` |

字段可选**不是可编造**:没有执行的检查就没有退出码,分析器没有命令。给一个从未观察到的事实补一个值,
正是让记录无法审计的原因。

### 信任等级

| 等级 | 产生者 | 是否参与判定 |
| ------------------ | -------------------------------- | ------------ |
| `harness-executed` | Harness 亲自执行(闸门、快照比对) | ✅ |
| `analyzer-derived` | Harness 或 Preset 的确定性分析器  | ✅ |
| `review-derived` | Harness 派发的语义审查(Provider 执行) | ✅ |
| `agent-claimed` | 被检查方的自述(例如 Tester 复述自己看到的证据) | ❌ 只作线索 |

`agent-claimed` 的证据会进入记录,但 `judgingEvidence` 会在判定前把它过滤掉,因此 Tester 自述
「测试都通过了」不能把一条失败闸门变成通过。

## 3. 阶段通过条件

两条判定都在 Harness 侧,不采信 Agent 的自我描述:

```ts
testerApproved(evidence, externalTest) =
  judgingEvidence(evidence).every((item) => item.skipped !== true && item.exitCode === 0)
  && externalTest.ok
  && externalTest.payload.approved === true

reviewerVerdict(reviewer, evidence) =               // Reviewer 阶段自己的裁定
  judgingEvidence(evidence).length > 0
  && reviewer.ok
  && reviewer.payload?.approved === true

reviewerApproved(reviewer, refusedFiles, evidence) =  // 阶段裁定 + Harness 的范围判定
  reviewerVerdict(reviewer, evidence) && refusedFiles.length === 0

findingVerdict(evaluateFindings(findings, policy, confirmed)) =
  { passed, blocking, retry }
```

四个要点:

- **Tester 通过需要两个独立条件同时成立**:所有闸门真的通过,且外部 tester 认可它收到的证据。
  判据来自 `Evidence` 的退出码,不来自 Agent 复述的证据。
- **没有任何可判定的 Evidence 时 Reviewer 不得批准**:一个没拿到证据的 Reviewer 没有什么可批准,
  「Agent 说没问题」不是独立验证。这条在 `requiredChecks` 为空时也会触发,运行随即以
  `agent_error` 结束并给出「no verification evidence」的说明。
- **范围判定是 Harness 自己的一步,不是 Reviewer 裁定的一部分**:`judgeScope` 在 Reviewer 之前
  执行并单独报告(`scope` 阶段记录与 `RunResult.scope`)。`reviewerVerdict` 只表达 Reviewer 自己的
  裁定,`reviewerApproved` 才是两者的合取——记录因此能回答「是哪一项为假」。即使 reviewer 批准,
  只要有越界文件,运行仍然不通过。
- **Findings 由 Harness 处置**:`blocking` 是 `action: reject` 的那些;全部可修复则回 Coder 重试,
  否则终止。Reviewer 的 `approved: true` 不能抵消一条 reject Finding。存在没人声明的 rule id 时
  `passed` 为 `false` 且 `retry` 为 `false`,运行以 `agent_error` 结束。越界改动**从不**重试。

## 4. 重试

Tester 未通过时回到 Coder,上限为 `min(input.maxIterations, policy.maxIterations)`,缺省 3。
Coder 会收到上一轮完整的 `verification` 数组作为 `previousVerification`,以及上一轮的结构化
Findings 作为 `previousFindings`——两者都是失败原因回流给 Agent 的通道,后者不是自然语言总结。

Planner、Coder、Reviewer 任一失败都会**直接终止**,不重试。

## 5. 产物

每次运行写入 `.harness/runs/<runId>/`:

| 文件 | 写入时机 |
| -------------------------------------- | ---------------------------- |
| `input.json` | 编排开始前 |
| `policy.json` | 编排开始前 |
| `iteration-<n>-verification.json` | 每轮 Tester 之后,内容是该轮的 `Evidence[]` |
| `output.json` | 结束时的最终 `RunResult` |

`runId` 由 ISO 时间戳去掉非数字字符后取前 14 位生成。

`iteration-<n>-verification.json` 现在保存结构化证据:每条含 `command`、`exitCode`、`durationMs`、
`stdoutDigest` / `stderrDigest` 与 `trust`,`RunResult.evidence` 是同一份内容在最终结果里的副本。

## 6. 已经记录的内容

1.3.0 起以下事实都随证据落盘,「Agent 的自我描述不是证据」因此不只停在结果层面,也能在过程层面复核:

* 退出码(`exitCode`),不再只折叠成 `pass`/`fail`;
* stdout / stderr 的截断副本与覆盖全文的 `sha256` 摘要;
* 每条闸门的耗时(`durationMs`)与起始时间(`startedAt`);
* 每条证据的来源与信任等级(`source` / `trust`);
* 未执行的检查(`skipped`)与原因,而不是让它从记录里消失。

Findings 的记录随 §8 一起落地(`RunResult.findings` 是规则实现说的话,`violations` 是它们的处置);
仍然属于目标形态的是**语义审查的调度**(§9)与**结构验证**(§10)。

## 7. 另一条独立闸门:`verify` 命令

`pedyc-harness verify` 是**配置闸门**,不属于 `run` 的四阶段循环。它依次检查:`.harness/` 配置与
schema 是否齐全、JSON 是否可解析、`validatePolicy` 是否通过、`agents` 形状是否合法、
`requiredChecks` 对应的 npm 脚本是否存在。

若项目存在 `.harness/verify.mjs`,则用它以 `--root <项目根>` 调用该脚本,并**透传其退出码**。
这条钩子只在 `verify` 命令里执行,`run` 流程不会调用它。

## 8. Finding 与 ReviewResult(已实现)

来源:`contracts/finding.ts`、`runtime/findings.ts`、`runtime/policy-engine.ts`。

```ts
type Severity = 'error' | 'warning' | 'info'

interface Finding {
  rule: string              // 必须由某个实现声明,否则运行失败
  target: string            // 例如某个文件
  severity: Severity
  reason: string
  retryable: boolean        // 由 Finding 自己声明,不由 Agent 事后解释
  confidence?: number       // 仅供排序与路由人工,不参与判定
  evidence?: readonly string[]  // 不在本轮快照/diff 里的路径被丢弃
}

interface ReviewResult {
  findings: Finding[]
  approved?: boolean        // 兼容字段;最终判定仍由 Harness 给出
}
```

要点:

- 没有任何 Evidence 时 Reviewer **不得批准**(见 §3);
- `agent-claimed` 只能作为线索进入上下文,**不参与判定**;`review-derived` 是 Harness 派发的观察,
  与被检查方的自述分开记录;
- `warning` 需要 Reviewer 明确确认,未确认即不通过;`info` 只记录;
- `confidence` 与启发式分数**不参与判定**——模型自报的置信度仍是自我描述,只能用于排序与路由人工;
- `Finding.evidence` 里的路径必须能在本轮快照/diff 中找到,否则视为幻觉并丢弃(呼应 M8 的
  "Agent claim ≠ Actual Change");
- 越界改动与受保护路径命中**不参与** `severity → action` 映射,直接终止。

今天产生 Finding 的实现是 Harness 自己的一致性检查:Agent 声称改了某个文件、而本轮 diff 中不存在
时,`change.claimed-file-missing` 记一条 `warning`、`retryable: true` 的 Finding,并把这条 Harness
自己观察到的事实交给 Reviewer 确认。Reviewer 也可以在 `findings` 里报告自己的判断;两者的区别在
记录里是 `source`/确认关系,而不是同一个字段的两种读法。Preset 注册的检查与语义审查仍属于 M21、
M8 的后续工作项。

## 9. 语义检查声明与调度(已实现)

来源:`contracts/rules.ts`(`CheckDeclaration` 的语义字段)、`config/checks.ts`、
`runtime/semantic.ts`、`runtime/executor.ts`。

```ts
type SemanticTrigger =
  | { kind: 'rules'; rules: readonly string[] }              // 规则命中即触发
  | { kind: 'any'; triggers: readonly SemanticTrigger[] }    // 任一命中

interface CheckDeclaration {
  // ...§10 的字段...
  verification: 'semantic'
  prompt: string                  // 声明者目录内的相对路径;提示词是数据,不是代码
  trigger: SemanticTrigger
  role?: AgentRole                // 由哪个 Provider role 承接,默认 reviewer
}
```

六条要点:

- 声明里**没有**模型、端点与凭证:调用由 Harness 调度,Preset 只表达需求;不新增独立的
  `LLMProvider` 注册表,而是复用既有 Provider role 与 stdin/stdout 协议。
- `prompt` 是数据不是代码,因此可 diff、可审计、可被项目覆写;它在配置阶段被读取并留在
  `ResolvedCheck.promptText` 里,只能指向声明者自己的目录(预设包内,或 `.harness/`)。
- 触发是 `规则命中`(`rules` 或 `any` 组合)。**`score` 触发在本构建里没有读者**:没有启发式引擎
  产出可比较的分数,声明它会被配置校验拒绝,而不是被接受后永不触发。
- 被触发的多条检查**按轮批量合成一次调用**(同一 role 一批);调用次数由触发决定,不由检查条数决定。
  多个 role 各自一批,这是角色路由的代价,也是它唯一的例外。
- `confidence` 与分数**不参与判定**,只用于排序与路由到人工。
- 预算耗尽(`policy.maxSemanticCalls`):`warning` 记 `skipped` 并继续,`error` fail-closed;
  `--semantic=disabled` 在 `RunResult.semantic` 里记录 `status: 'disabled'` 与被跳过的检查。

`RunResult.semantic` 即使什么都没做也会记录(`status: 'idle'`),因为「没有调用模型」与
「这一层被关掉了」是两个不同的事实。语义调用的产出记为 `review-derived` 证据。

## 10. 检查声明与可执行约束(结构验证已实现)

来源:`contracts/rules.ts`、`config/checks.ts`、`config/analyzers.ts`、`runtime/analyzers.ts`、
`runtime/structural.ts`。

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
  constraint?: Constraint           // 声明式约束
  analyzer?: string                 // 结构验证:分析器 id
}
```

检查声明来自**并集**:每个预设的 `verification` 文档与项目自己的那份(`.harness/verification.json`
或清单里的 `verification` 路径)相加,同名不同内容报 `check_conflict`。触发与执行在
`runStructuralChecks`:

```text
改动后的文件 → 分析器(事实: css 的 animation-duration = 1s)
             → 规则/声明(比较: <= 400ms)
             → Finding(rule / target / severity / reason / retryable)
             → Evidence(trust: analyzer-derived)
```

要点:

- **`kind` 决定合并语义**(`constraint` → deny-wins、`preference` / `instruction` → append、
  `verification` → union),不由字段名决定;项目只能收紧 `severity`,不能改 `kind`。今天实现的是
  `verification` 的并集;deny-wins 与 `conflicts` 属于 M17。
- **声明式约束有表达力上限**:它只能表达「取一个属性与一个值比较」。超出上限的形状在配置校验阶段
  被拒(`operator` 与 `value` 形状不匹配、`structural` 检查没有 `constraint` 或 `analyzer`、
  分析器 id 不存在、约束的 `target` 与分析器产出的种类不一致);运行期还会拒绝**无法比较**的取值
  (例如把 `1s` 与 `400px` 比大小)—— 报错并终止,绝不静默通过。
- **分析器与规则解耦**:分析器只产出事实(`animation-duration = 1s`),声明只做比较,两者由不同的
  模块提供,引擎只认 id;因此第三方可以只发布分析器(纯计算、无网络),见
  [ADR-003](../decisions/ADR-003-preset-as-code.md)。本构建内置 `css.duration` 与 `json.property`
  两个分析器,`config/analyzers.ts` 是它们唯一的声明表。
- **属性不存在不算违规**:约束说的是「这个属性必须满足 X」,不是「这个属性必须存在」。
- **「语义」只指 `verification: 'semantic'`**;用 AST 提取属性值属于 `structural`,不是 semantic。
  本构建尚未实现 heuristic / semantic / command 三类声明的执行器,声明它们会被明确拒绝而不是被
  接受后不做任何事。

## 11. 相关文档

- [Core 契约](./core.md) · [Policy 契约](./policy.md) · [Provider 契约](./provider.md)
- [Preset 契约](./preset.md) — Evidence Provider 与检查声明如何被注册
- [Verification 设计](../architecture/verification.md) · [治理流水线](../architecture/governance.md)
- [ADR-005](../decisions/ADR-005-semantic-governance.md) · [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)
- [里程碑路线](../milestones/milestones.md)
