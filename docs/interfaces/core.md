# Core 契约

> `@pedyc/harness-core` 的导出面,以及 `task` / `run` / schema / 进程 / 快照这几组核心契约。
>
> `Policy` 见 [policy](./policy.md),`Preset` 见 [preset](./preset.md),Agent 调用协议见
> [provider](./provider.md),验证结果见 [verification](./verification.md)。

## 1. 导出面

`@pedyc/harness-core` 通过 `exports` 公开 **12 个子路径**。内部按三层组织,依赖单向:

```text
contracts/   纯类型与 schema 编译
config/      拥有所有对项目配置文档的读取
runtime/     针对 config 层已解析好的值执行一次运行
```

子路径名与内部文件名**并不一一对应**,这是公开 API 与内部命名的隔离层:

| 子路径 | 目标模块 |
| ---------------------- | -------------------------------------------- |
| `.` | `dist/index.js`(所有公开导出) |
| `./contracts` | `dist/contracts/index.js`(纯类型) |
| `./config` | `dist/config/index.js`(配置层) |
| `./intake` | `dist/runtime/intake.js` |
| `./command` | `dist/runtime/command.js` |
| `./snapshots` | `dist/runtime/diff-inspector.js` |
| `./schema` | `dist/config/schema.js` |
| `./agent` | `dist/runtime/agent.js` |
| `./policy` | `dist/runtime/policy-engine.js` |
| `./provider` | `dist/runtime/provider-runner.js` |
| `./orchestrator` | `dist/runtime/executor.js` |
| `./package-manager` | `dist/runtime/package-manager.js` |

`./contracts` 只导出类型,可安全地作为编译期依赖。用户不应依赖 `dist/` 下的深路径。
## 2. 配置层契约

来源:`packages/core/src/contracts/harness.ts` 与 `packages/core/src/config/`。这一层由 M15 引入:
它拥有**所有**对项目配置文档的读取,失败时返回结构化问题而不是抛异常,并且**从不返回部分结果**。

```ts
interface HarnessManifest {
  version: number
  presets?: string[]              // 预设包名;版本属于 package.json 与 lockfile
  policy?: Policy | string        // 文档路径(相对 .harness/)或内联文档
  agents?: AgentsConfig | string
  verification?: string           // 检查声明文档的路径(相对 .harness/)
}

interface ConfigSource {
  kind: 'manifest' | 'policy' | 'agents' | 'preset' | 'verification'
  location: string                // 仓库相对路径,或对无文件来源的描述
  active: boolean                 // false = 声明了但暂无运行时消费
}

interface LoadedHarnessConfig {
  root: string
  manifest: HarnessManifest | null
  policy: Policy
  agents: AgentsConfig
  presets: ResolvedPreset[]       // 依赖在前,见 Preset 契约
  checks: ResolvedCheck[]         // 生效的检查声明,含来源
  sources: ConfigSource[]
}

type LoadConfigResult =
  | { ok: true; config: LoadedHarnessConfig }
  | { ok: false; errors: HarnessConfigError[] }
```

`verification` 指向一份**检查声明文档**。它与 policy/agents 的解析方式不同:后者是**来源选择**
(项目压过预设),而 checks 是**并集**——每个预设各自贡献自己的检查,再加项目自己的那份。
同名检查被两份文档声明且内容不同时报 `check_conflict`,因为「谁赢」属于 M17 的合成语义,今天
不能猜一个赢家出来。

`HarnessConfigError` 带稳定的 `code`(CI 可以据此分支而不必解析文案)、`file`(仓库相对路径;
预设内的文档报告为 `<包名>/preset.json`,因为裸相对路径指向读者打不开的位置)、可选的 `field`
(点分路径)与 `message`。**验收规则是:一个错误配置必须同时指出文档与其中的字段。**

`ConfigErrorCode` 现有 17 个取值,分四组:`.harness/` 与清单(`harness_directory_missing`、
`harness_schema_unreadable`、`manifest_invalid_json`、`manifest_unreadable`、`manifest_invalid`);
普通文档(`config_file_missing`、`config_file_unreadable`、`config_file_invalid_json`、
`config_file_invalid`、`config_path_outside_harness`);预设(`preset_not_installed`、
`preset_manifest_unreadable`、`preset_manifest_invalid_json`、`preset_manifest_invalid`、
`preset_cyclic`、`preset_path_outside_package`);合成(`check_conflict`)。

主要入口(经 `.` 与 `./config` 导出):

| 函数 | 作用 |
| ------------------------------ | ------------------------------------------------------------ |
| `loadHarnessConfig(root)` | 解析清单 → 预设 → policy/agents;返回完整配置或全部问题 |
| `manifestPath` / `manifestFile` | 清单路径与文件名 |
| `readManifest` | 读取并校验清单 |
| `resolvePresets` / `presetPackageName` | 预设解析,见 [Preset 契约](./preset.md) |
| `policyProblems` / `validatePolicy` | 策略校验:前者收集全部问题,后者返回首个;都接受生效规则集作为第二个参数 |
| `verificationProblems` / `mergeChecks` | 校验一份检查声明文档;把多份文档合并为并集并报告同名冲突 |
| `analyzerDeclarations` / `analyzerTarget` | 本构建提供的分析器 id 与它们服务的 `Constraint.target` |
| `agentProblems` / `validateAgents` | agents 校验,同样区分「全部」与「首个」 |
| `defaultPolicy` / `defaultAgents` | 没有对应文档时的内置默认值 |
| `formatConfigError` | 把一条 `HarnessConfigError` 渲染为一行 |
| `harnessDirectory` | 治理目录名(`.harness`) |
| `compileSchema` / `readSchema` / `createAjv` | schema 编译的公共原语 |

`run` 与 `verify` 都不再直接读 `.harness/policy.json`:配置在**任何阶段执行之前**解析完毕,
一个无法解析的项目绝不会被部分执行。

## 3. Task 契约

来源:`packages/core/src/contracts/task.ts`。三层输入最终归一到 `NormalizedTask`。

```ts
interface NormalizedTask {
  feature: string
  objective: string
  constraints: string[]
  acceptanceCriteria: string[]
  testHints: string[]
  maxIterations: number
}
```

`RawTaskInput` 是未归一的输入,同一概念接受多个字段名:

| 归一字段 | 接受的原始字段 |
| -------------------- | ---------------------------------------------- |
| `feature` | `task` → `feature` |
| `objective` | `goal` → `objective` |
| `constraints` | `specialConstraints` → `constraints` |
| `acceptanceCriteria` | `acceptance` → `acceptanceCriteria` |
| `testHints` | `testHints`,缺省为四条 `pnpm run …` 默认闸门 |
| `maxIterations` | `maxIterations`,缺省 `3` |

`normalizeTask(task)` 返回 `IntakeResult`:

```ts
interface IntakeResult {
  status: 'ready' | 'needs_input'
  questions: string[]
  normalizedTask: NormalizedTask
}
```

缺失关键信息时**不报错**,而是转为问题:缺 `feature`、缺 `objective`、或 `acceptanceCriteria` 为空
时 `status` 为 `needs_input`。`readTaskFile(path)` 读取 JSON 后走同一条归一化路径。

注意默认的 `testHints` 硬编码为 `pnpm run …` 形式,与项目实际使用的包管理器无关。

## 4. Run 契约

来源:`packages/core/src/contracts/run.ts`。

```ts
type RunStatus = 'passed' | 'failed'
type PhaseStatus = 'running' | 'passed' | 'failed'

interface PhaseRecord {
  name: string
  status: PhaseStatus
  details: string
  iteration?: number
}

interface FileChange {
  file: string
  change: string      // 自由文本;当前固定为 "Changed during coder iteration N."
}

interface ScopeRecord {
  allowed: boolean
  refusedFiles: string[]
  details: string
}
```

`OrchestrationResult` 是 `runOrchestrator` 的返回值。它**不含** `status` 与 `summary`——只有调用方
知道如何措辞:

```ts
interface OrchestrationResult {
  completed: boolean
  termination?: TerminationReason
  implementationPlan: string[]
  fileChanges: FileChange[]
  scope?: ScopeRecord
  evidence: Evidence[]
  verification: VerificationCheck[]
  findings: Finding[]
  /** What the semantic layer did; absent on a dry run, which dispatches nothing. */
  semantic?: SemanticRecord
  /** How the checking stage was routed; absent when the caller did not say. */
  independence?: IndependenceRecord
  violations: PolicyViolation[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
}
```

`RunResult` 是写入 `output.json` 的文档,匹配 `schemas/output.schema.json`:

```ts
interface RunResult {
  status: RunStatus
  termination?: TerminationReason
  summary: string
  implementationPlan: string[]
  fileChanges: FileChange[]
  scope?: ScopeRecord
  evidence: Evidence[]
  verification: VerificationCheck[]
  findings: Finding[]
  semantic?: SemanticRecord
  independence?: IndependenceRecord
  violations: PolicyViolation[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
  dryRun: boolean
}
```

`status` 由 `orchestration.completed` 派生,不由证据评估派生。`evidence` 是判定的记录形态,
`verification` 是它的投影:两者都由同一个 `Evidence` 数组派生,不会各自漂移,见
[验证契约](./verification.md) §2。`findings` 是规则实现说的话,`violations` 是 Harness 对它们的
处置,两者分开记录。`scope` 是 Harness 自己的范围判定,与 Reviewer 的裁定是**两项独立事实**:
`judgeScope` 在本轮改动上单独执行并单独报告,由 `scope` 阶段与 `reviewer` 阶段各自记录结果,
Reviewer 批准也不能抵消它。`scope` 与 `termination` 在 dry-run 下都不写——那次运行没有判定任何东西。

`runOrchestrator` 的 `runVerification` 接受 `Evidence[]`,同时继续接受旧的 `VerificationCheck[]`;
后者会被升级为 `harness-executed` 证据(退出码由 `result` 推出,耗时与摘要因调用方未记录而留空),
因此 1.2.0 的调用方不必同时迁移。

> **目标(ADR-006)** `RunResult` 补 `runId`;`PhaseRecord` 补 `kind`(`'run' | 'stage'`,区分编排
> 阶段与 Agent 阶段);嵌套子结果与 `verdict` 留到破坏性窗口。`RunRecord` 与 `RunResult` 分离,
> 且只记 Harness 自己观察到的事实。`termination` 已实现。见
> [Governance Runtime 架构](../architecture/runtime.md) 与 [ADR-006](../decisions/ADR-006-run-lifecycle.md)。

## 5. 验证结果契约

来源:`packages/core/src/contracts/evidence.ts` 与 `validation.ts`。1.3.0 起判定所依据的**记录形态**
是 `Evidence`,旧的 `VerificationCheck` 只是它的投影:

```ts
type EvidenceTrust = 'harness-executed' | 'analyzer-derived' | 'review-derived' | 'agent-claimed'

interface Evidence {
  id: string
  source: string
  trust: EvidenceTrust
  name?: string
  command?: string
  packageManager?: string
  exitCode?: number
  durationMs?: number
  startedAt?: string
  stdoutDigest?: string
  stderrDigest?: string
  stdout?: string          // 截断保存的副本;digest 覆盖未截断的全文
  stderr?: string
  skipped?: boolean        // 未执行:被拒绝、被禁用或超出预算
  details?: string
}

interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'
  details: string
}
```

可选字段**是可选,而不是可编造**:未执行的检查没有退出码,分析器没有命令,给一个从未观察到的事实
补一个值正是让记录不可审计的原因。完整语义见[验证契约](./verification.md)。

## 6. Schema 与校验

来源:`packages/core/src/config/schema.ts`,经 `./schema` 公开。

```ts
interface HarnessSchemas {
  input: object
  output: object
  agentResponse: object
}

interface HarnessValidators {
  ajv: Ajv2020
  input: ValidateFunction
  output: ValidateFunction
  agentResponse: ValidateFunction
}

interface ResponseValidator {
  (value: unknown): boolean
  errors?: null | ErrorObject[]
}

type SchemaErrorFormatter = Pick<Ajv2020, 'errorsText'>
```

- `loadSchemas(root)` 从 `<root>/.harness/` 读取 `input.schema.json`、`output.schema.json`、
  `agent-response.schema.json`。
- `createValidators(schemas)` 用 `Ajv2020`(`allErrors: true, strict: false`)编译三者。
- `validationDetails(ajv, validator)` 把 `validator.errors` 渲染为一行文本。

schema 的唯一来源是仓库根的 `schemas/`,由 `pnpm run schemas:sync` 生成各副本,
`pnpm run schemas:check` 校验副本未漂移。

## 7. Agent 响应解码

来源:`packages/core/src/runtime/agent.ts`,经 `./agent` 公开。

- `parseAgentResponse(name, stdout, validate, ajv): ParsedAgentResponse` —— 解码一个阶段的
  stdout。**空 stdout 视为成功**(内置阶段本就不产生载荷);非空则必须是单个符合
  `agent-response.schema.json` 的 JSON 对象。
- `validateStageResponse(name, payload): string | null` —— 施加 schema 表达不了的阶段要求:
  planner 必须给出非空 `implementationPlan`;tester 必须有布尔 `approved` 与非空 `evidence`;
  reviewer 必须有布尔 `approved`。返回问题描述或 `null`。

```ts
interface ParsedAgentResponse {
  ok: boolean
  details: string
  payload: AgentPayload
}
```

## 8. 进程与快照

来源:`packages/core/src/runtime/command.ts`、`core/diff-inspector.ts`。

```ts
interface CommandResult { code: number; stdout: string; stderr: string; termination: 'exited' | 'timeout' | 'cancelled' }
type FileSnapshot = Map<string, string>   // 仓库相对 POSIX 路径 → 内容
```

- `runCommand(root, command, args, stdin, options)` 在 `root` 中启动进程,以 `cwd` 隔离。**非零退出不
  reject**,而是作为正常结果返回,由编排层记录为证据。`options.timeoutMs` 与 `options.signal` 让
  Harness 能停掉自己启动的进程,`termination` 区分「命令自己退出」与「被 Harness 停止」。`stdin`
  非 `null` 时写入 `JSON.stringify(stdin) + '\n'`。Windows 上 `npm`/`npx`/`pnpm`/`yarn` 自动补
  `.cmd`,并使用 `shell: true`。
- `snapshotFiles(root)` 捕获每个文件的内容,键为仓库相对 POSIX 路径;只在**仓库根**忽略
  `node_modules`、`dist`、`.git`。
- `changedFiles(before, after)` 返回新增、删除或内容变化的文件。

因此改动范围的判定窗口**恰好是一次 Coder 调用**:快照在调用前取、调用后立即比较。Harness 自己在
循环之前写的 `input.json` / `policy.json` 与循环之后写的 `output.json` 都不落入该窗口。

## 9. 包管理器探测

来源:`packages/core/src/runtime/package-manager.ts`,经 `./package-manager` 公开。

```ts
interface PackageManager { name: 'pnpm' | 'yarn' | 'npm'; command: string; args: string[] }
interface PackageScriptCommand extends PackageManager { display: string }
```

`detectPackageManager(root)` 按锁文件探测,顺序固定:`pnpm-lock.yaml` → `pnpm`;
`yarn.lock` → `yarn`;否则 `npm`。`packageScriptCommand(root, script)` 在探测结果上追加脚本名,
并给出供证据输出使用的 `display` 字符串。

## 10. 版本

`harnessCoreVersion` 从 `@pedyc/harness-core` 自身的 `package.json` 读取版本号,而不是在源码里写
字面量——硬编码副本曾在发版后继续上报旧版本。

## 11. 相关文档

- [Policy 契约](./policy.md) · [Preset 契约](./preset.md) · [Provider 契约](./provider.md)
- [验证契约](./verification.md) · [CLI 契约](./cli.md)
- [系统架构](../architecture/system.md) · [Governance Runtime 架构](../architecture/runtime.md)
- [里程碑路线](../milestones/milestones.md) · [ADR-006](../decisions/ADR-006-run-lifecycle.md)
- [文档规范](../CONVENTIONS.md)
