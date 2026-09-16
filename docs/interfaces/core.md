# Core 契约

> `@pedyc/harness-core` 的导出面,以及 `task` / `run` / schema / 进程 / 快照这几组核心契约。
>
> `Policy` 见 [policy](./policy.md),`Preset` 见 [preset](./preset.md),Agent 调用协议见
> [provider](./provider.md),验证结果见 [verification](./verification.md)。

## 1. 导出面

`@pedyc/harness-core` 通过 `exports` 公开 11 个子路径。子路径名与内部文件名**并不一一对应**,
这是公开 API 与内部命名的隔离层:

| 子路径 | 目标模块 |
| ---------------------- | -------------------------------------------- |
| `.` | `dist/index.js`(所有公开导出) |
| `./contracts` | `dist/contracts/index.js`(纯类型) |
| `./intake` | `dist/core/intake.js` |
| `./command` | `dist/core/command.js` |
| `./snapshots` | `dist/core/diff-inspector.js` |
| `./schema` | `dist/core/validator.js` |
| `./agent` | `dist/core/agent.js` |
| `./policy` | `dist/core/policy-engine.js` |
| `./provider` | `dist/adapters/provider-runner.js` |
| `./orchestrator` | `dist/core/executor.js` |
| `./package-manager` | `dist/core/package-manager.js` |

`./contracts` 只导出类型,可安全地作为编译期依赖。用户不应依赖 `dist/` 下的深路径。

## 2. Task 契约

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

## 3. Run 契约

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
```

`OrchestrationResult` 是 `runOrchestrator` 的返回值。它**不含** `status` 与 `summary`——只有调用方
知道如何措辞:

```ts
interface OrchestrationResult {
  completed: boolean
  implementationPlan: string[]
  fileChanges: FileChange[]
  verification: VerificationCheck[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
}
```

`RunResult` 是写入 `output.json` 的文档,匹配 `schemas/output.schema.json`:

```ts
interface RunResult {
  status: RunStatus
  summary: string
  implementationPlan: string[]
  fileChanges: FileChange[]
  verification: VerificationCheck[]
  issues: string[]
  phases: PhaseRecord[]
  iterations: number
  dryRun: boolean
}
```

`status` 由 `orchestration.completed` 派生,不由证据评估派生。

## 4. 验证结果契约

来源:`packages/core/src/contracts/validation.ts`。整个验证面只有这一个类型:

```ts
interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'
  details: string
}
```

`details` 取 stderr,或成功时的固定文案。退出码、stdout、耗时与时间戳**不被记录**——更完整的证据
模型属于 [verification](./verification.md) 中标注的目标形态。

## 5. Schema 与校验

来源:`packages/core/src/core/validator.ts`,经 `./schema` 公开。

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

## 6. Agent 响应解码

来源:`packages/core/src/core/agent.ts`,经 `./agent` 公开。

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

## 7. 进程与快照

来源:`packages/core/src/core/command.ts`、`core/diff-inspector.ts`。

```ts
interface CommandResult { code: number; stdout: string; stderr: string }
type FileSnapshot = Map<string, string>   // 仓库相对 POSIX 路径 → 内容
```

- `runCommand(root, command, args, stdin)` 在 `root` 中启动进程,以 `cwd` 隔离。**非零退出不
  reject**,而是作为正常结果返回,由编排层记录为证据。`stdin` 非 `null` 时写入
  `JSON.stringify(stdin) + '\n'`。Windows 上 `npm`/`npx`/`pnpm`/`yarn` 自动补 `.cmd`,并使用
  `shell: true`。
- `snapshotFiles(root)` 捕获每个文件的内容,键为仓库相对 POSIX 路径;只在**仓库根**忽略
  `node_modules`、`dist`、`.git`。
- `changedFiles(before, after)` 返回新增、删除或内容变化的文件。

因此改动范围的判定窗口**恰好是一次 Coder 调用**:快照在调用前取、调用后立即比较。Harness 自己在
循环之前写的 `input.json` / `policy.json` 与循环之后写的 `output.json` 都不落入该窗口。

## 8. 包管理器探测

来源:`packages/core/src/core/package-manager.ts`,经 `./package-manager` 公开。

```ts
interface PackageManager { name: 'pnpm' | 'yarn' | 'npm'; command: string; args: string[] }
interface PackageScriptCommand extends PackageManager { display: string }
```

`detectPackageManager(root)` 按锁文件探测,顺序固定:`pnpm-lock.yaml` → `pnpm`;
`yarn.lock` → `yarn`;否则 `npm`。`packageScriptCommand(root, script)` 在探测结果上追加脚本名,
并给出供证据输出使用的 `display` 字符串。

## 9. 版本

`harnessCoreVersion` 从 `@pedyc/harness-core` 自身的 `package.json` 读取版本号,而不是在源码里写
字面量——硬编码副本曾在发版后继续上报旧版本。

## 10. 相关文档

- [Policy 契约](./policy.md) · [Preset 契约](./preset.md) · [Provider 契约](./provider.md)
- [验证契约](./verification.md) · [CLI 契约](./cli.md)
- [系统架构](../architecture/system.md) · [里程碑路线](../milestones/milestones.md)
- [文档规范](../CONVENTIONS.md)
