# 核心接口设计

> pedyc-harness 的核心接口描述任务、策略、Agent 执行、变更、验证、Review 与最终运行结果之间的关系。

本文只负责：

* Core Domain Model
* 核心 TypeScript 类型
* 生命周期关系
* 数据边界
* JSON Schema 边界
* 配置解析模型（Manifest / Preset Manifest / EffectiveHarnessConfig）

不负责具体 CLI、Preset、Provider 实现。

---

## 一、核心对象

Harness 的核心数据流：

```text
TaskContract
      ↓
HarnessPolicy
      ↓
AgentRequest
      ↓
AgentResult
      ↓
ChangeSet
      ↓
ValidationEvidence
      ↓
ReviewResult
      ↓
RunResult
```

其中：

```text
AgentResult ≠ RunResult
```

Agent 返回的是：

> Agent 执行结果。

Harness 最终输出的是：

> 经 Policy、Change、Verification、Review 后得到的可信运行结果。

---

# 二、TaskContract

`TaskContract` 定义一次任务：

* 要做什么
* 修改范围是什么
* 什么条件算完成
* 需要执行哪些验证

```ts
export interface TaskContract {
  id: string
  description: string
  scope: TaskScope
  acceptanceCriteria: AcceptanceCriterion[]
  verification: VerificationRequirement[]
}
```

### TaskScope

```ts
export interface TaskScope {
  allowedPaths: string[]
  forbiddenPaths?: string[]
}
```

### AcceptanceCriterion

```ts
export interface AcceptanceCriterion {
  id: string
  description: string
  required: boolean
}
```

### VerificationRequirement

```ts
export interface VerificationRequirement {
  id: string
  command: string
  description?: string
  required: boolean
}
```

Task Contract 是任务的声明性边界。

它不负责：

* 执行 Agent
* 执行命令
* 检查 Git Diff

这些属于 Runtime。

---

# 三、HarnessPolicy

`HarnessPolicy` 描述：

> **这一次运行允许 Agent 做什么。**

```ts
export interface HarnessPolicy {
  allowedPaths: string[]
  protectedPaths: string[]
  allowedCommands: CommandPolicy[]
  forbiddenCommands: string[]
  maxIterations: number
  requiredVerification: VerificationRequirement[]
}
```

### CommandPolicy

```ts
export interface CommandPolicy {
  command: string
  allowed: boolean
}
```

Policy 与 TaskContract 的区别：

```text
TaskContract
    ↓
任务要求什么

HarnessPolicy
    ↓
系统允许什么
```

最终执行必须同时满足二者。

---

# 四、AgentAdapter

Harness 不直接绑定 Claude Code、Codex 或其他具体 Agent。

```ts
export interface AgentAdapter {
  readonly id: string

  execute(
    request: AgentRequest
  ): Promise<AgentResult>
}
```

Adapter 的职责：

```text
Harness
   ↓
AgentRequest
   ↓
Adapter
   ↓
External Agent
   ↓
AgentResult
```

Adapter 不负责：

* Policy 判定
* 最终验收
* Scope 最终判定
* Review
* Audit

这些属于 Harness Runtime。

---

# 五、AgentRequest

`AgentRequest` 是 Harness 发给 Agent 的执行请求。

```ts
export interface AgentRequest {
  task: TaskContract
  policy: HarnessPolicy
  stage: AgentStage
  context: AgentContext
}
```

### AgentStage

```ts
export type AgentStage =
  | "planner"
  | "coder"
  | "tester"
  | "reviewer"
```

当前项目的核心思路不是构建 Multi-Agent Framework。

这些 stage 表示 Harness 生命周期中的执行角色，而不是要求系统必须实现复杂的 Agent 编排体系。

---

# 六、AgentContext

```ts
export interface AgentContext {
  workingDirectory: string
  iteration: number
  previousOutput?: unknown
}
```

Context 只提供当前 Agent 执行所需的运行上下文。

长期 Memory、RAG、向量检索等不属于 Core Domain。

---

# 七、AgentResult

Agent 执行结束后返回：

```ts
export interface AgentResult {
  status: AgentExecutionStatus
  output: unknown
  changes: ChangeSet
  message?: string
}
```

### AgentExecutionStatus

```ts
export type AgentExecutionStatus =
  | "success"
  | "failed"
  | "timeout"
  | "cancelled"
```

注意：

> `AgentResult` 不是最终可信结果。

尤其是：

```ts
output
```

属于 Agent 自述。

例如：

```json
{
  "output": {
    "tests": "all passed"
  }
}
```

不能直接作为 Verification Evidence。

---

# 八、ChangeSet

Harness 必须关注实际发生的变更。

```ts
export interface ChangeSet {
  files: FileChange[]
  added: number
  modified: number
  deleted: number
}
```

### FileChange

```ts
export interface FileChange {
  path: string
  status: FileChangeStatus
}
```

### FileChangeStatus

```ts
export type FileChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
```

核心原则：

> **实际文件系统 / Git Diff 优先于 Agent 自己声明的 changes。**

Agent 的 `changes` 可以作为执行结果的一部分，但最终 Scope Enforcement 应基于 Harness 观察到的实际变更。

---

# 九、ValidationEvidence

独立验证产生证据：

```ts
export interface ValidationEvidence {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  startedAt: string
  finishedAt: string
}
```

它与 Agent 的：

```ts
AgentResult.output
```

有本质区别。

```text
Agent output
    ↓
Agent 说自己做了什么

ValidationEvidence
    ↓
Harness 实际执行了什么
```

因此只有后者可以成为独立验证的核心证据。

---

# 十、ReviewResult

Review 根据：

```text
Task
+
Policy
+
Actual Changes
+
Validation Evidence
```

做最终判断。

```ts
export interface ReviewResult {
  approved: boolean
  issues: ReviewIssue[]
  acceptanceEvidence: AcceptanceEvidence[]
}
```

### ReviewIssue

```ts
export interface ReviewIssue {
  severity: IssueSeverity
  message: string
  path?: string
}
```

### IssueSeverity

```ts
export type IssueSeverity =
  | "info"
  | "warning"
  | "error"
  | "critical"
```

### AcceptanceEvidence

```ts
export interface AcceptanceEvidence {
  criterionId: string
  satisfied: boolean
  evidence: string
}
```

Review 的目标不是重新实现 Agent。

它只回答：

> **当前结果是否满足 Contract、Policy 与 Verification 要求。**

---

# 十一、RunResult

`RunResult` 是一次完整 Harness Run 的最终记录。

```ts
export interface RunResult {
  runId: string
  taskId: string
  status: RunStatus
  stages: StageResult[]
  changes: ChangeSet
  validation: ValidationEvidence[]
  review?: ReviewResult
  startedAt: string
  finishedAt: string
}
```

### RunStatus

```ts
export type RunStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "rejected"
  | "cancelled"
```

### StageResult

```ts
export interface StageResult {
  stage: AgentStage
  status: AgentExecutionStatus
  startedAt: string
  finishedAt: string
  output?: unknown
}
```

`RunResult` 是 Harness 的最终审计对象。

它必须能够回答：

```text
这是什么任务？
        ↓
使用了什么 Policy？
        ↓
执行了哪些阶段？
        ↓
Agent 做了什么？
        ↓
实际修改了什么？
        ↓
执行了哪些验证？
        ↓
验证结果是什么？
        ↓
最终为什么 PASS / FAIL / REJECTED？
```

---

# 十二、对象之间的关系

完整关系：

```text
                    ┌─────────────────┐
                    │  TaskContract   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  HarnessPolicy  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  AgentRequest   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  AgentAdapter   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   AgentResult   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    ChangeSet    │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
       ┌─────────────────┐       ┌──────────────────┐
       │ Scope Inspection│       │ Independent Test │
       └────────┬────────┘       └────────┬─────────┘
                │                         │
                └────────────┬────────────┘
                             ▼
                    ┌─────────────────┐
                    │  ReviewResult   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    RunResult    │
                    └─────────────────┘
```

---

# 十三、可信边界

Core 最重要的边界不是 TypeScript 类型，而是：

> **哪些数据可以相信。**

可信度关系：

```text
Agent self-report
      ↓
      低

AgentResult
      ↓
      仅表示 Agent 执行结果

Filesystem / Git Diff
      ↓
      实际变更证据

Harness-executed validation
      ↓
      独立验证证据

Policy evaluation
      ↓
      约束判定

ReviewResult
      ↓
      综合判定

RunResult
      ↓
      最终审计记录
```

因此：

```text
AgentResult
    ≠
ValidationEvidence
    ≠
ReviewResult
    ≠
RunResult
```

不能为了减少类型数量而合并这些对象。

---

# 十四、JSON Schema 边界

Core TypeScript 类型负责：

> TypeScript 编译期模型。

JSON Schema 负责：

> 跨进程、跨 Provider、跨语言的数据边界。

当前仓库已经存在并通过 CLI 发布的 Schema：

```text
schemas/
├── task.schema.json
├── task.example.json
├── input.schema.json
├── output.schema.json
└── agent-response.schema.json
```

其中 `input` / `output` / `agent-response` 对应一次 Run 的输入、Provider 响应和阶段响应契约。

仍需补齐的对象（规划中，尚未实现）：

```text
HarnessPolicy
AgentRequest
AgentResult
ReviewResult
RunResult
harness.json（Manifest）
preset.json（Preset Manifest）
```

目标结构：

```text
schemas/
├── task.schema.json
├── policy.schema.json
├── agent-request.schema.json
├── agent-result.schema.json
├── review-result.schema.json
├── run-result.schema.json
├── harness.schema.json
└── preset.schema.json
```

Runtime 使用 JSON Schema / Ajv 对跨边界数据进行校验。

---

# 十五、配置解析模型

配置解析是 Runtime 之前的一层：它把多个来源合成为单一输入。

### HarnessConfig（`.harness/harness.json`）

Harness Manifest：只声明使用什么，不承载全部细节。

```ts
export interface HarnessConfig {
  version: number
  /** 项目启用的 Preset 包名，版本由 package.json 与 lockfile 决定。 */
  presets?: string[]
  /** 兼容别名，语义同 presets。 */
  extends?: string[]
  /** 内联配置或指向 .harness/ 内的相对路径。 */
  policy?: PolicyConfig | string
  verification?: VerificationConfig | string
  agent?: AgentConfig | string
  rules?: string[]
}
```

关键约束：

> `presets` 只写包名，不写版本。

```json
{
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue", "@acme/harness-preset"]
}
```

版本属于 `package.json` 与 lockfile，避免三处版本信息漂移。

### PresetManifest（`preset.json`）

```ts
export interface PresetManifest {
  name: string
  extends?: string[]
  policy?: PolicyConfig | string
  verification?: VerificationConfig | string
  agents?: AgentsConfig | string
  rules?: string[]
}
```

Preset 也可以继承 Preset，因此解析结果是一张图，而不是一条链。

### MergeStrategy

```ts
export type MergeStrategy =
  | "replace"
  | "merge"
  | "append"
  | "deny-wins"
  | "immutable"
```

每个字段声明自己的语义，由单一模块实现。完整字段表见
[Policy 设计](./Policy设计.md)，Preset 侧说明见 [Preset 设计](./Preset设计.md)。

### EffectiveHarnessConfig

Runtime 的唯一配置输入：

```ts
export interface EffectiveHarnessConfig {
  policy: HarnessPolicy
  verification: VerificationConfig
  agent: AgentConfig
  rules: string[]
  /** 每个生效值的来源，用于审计。 */
  provenance: ConfigProvenance[]
}

export interface ConfigProvenance {
  /** 例如 "@acme/harness-preset"、"project"、"task"。 */
  source: string
  /** 生效字段路径，例如 "policy.protectedPaths"。 */
  path: string
  strategy: MergeStrategy
}
```

`EffectiveHarnessConfig` 与 `HarnessPolicy` 的关系：

```text
HarnessPolicy
    ↓
Policy 合成后的结果

EffectiveHarnessConfig
    ↓
Policy + Verification + Agent + Rules
```

Runtime 不关心 `EffectiveHarnessConfig` 中各值的来源，但 provenance 必须写入 Run Record，
否则「这次运行为什么用这条 Policy」无法复核。

### 解析顺序

```text
harness.json
     ↓
Preset Resolver        依赖图 / 去重 / 循环检测 / 拓扑排序
     ↓
Config Resolver        字段级 Merge Strategy
     ↓
EffectiveHarnessConfig
     ↓
Harness Runtime
```

循环依赖必须报错并给出完整环路，而不是让递归调用栈溢出。

> 本节的类型是目标模型，尚未实现。当前实现直接读取 `.harness/policy.json` 与
> `.harness/agents.json`，没有 Manifest、没有 Preset 继承、没有合并与 provenance。

---

# 十六、Core 模块映射

核心接口与源码目录对应（当前实现）：

```text
packages/core/src/

├── contracts/
│   ├── task.ts
│   ├── policy.ts
│   ├── preset.ts
│   ├── agent.ts
│   ├── validation.ts
│   ├── run.ts
│   └── index.ts
│
├── core/
│   ├── intake.ts
│   ├── executor.ts
│   ├── policy-engine.ts
│   ├── diff-inspector.ts
│   ├── validator.ts
│   ├── approval-gate.ts
│   ├── command.ts
│   ├── agent.ts
│   └── package-manager.ts
│
├── adapters/
│   └── provider-runner.ts
└── index.ts
```

规划中的模块（配置解析层）：

```text
├── config/
│   ├── load.ts          Manifest 加载
│   ├── presets.ts       Preset Resolver（依赖图 / 循环检测 / 拓扑排序）
│   ├── merge.ts         Config Resolver（字段级 Merge Strategy）
│   └── effective.ts     EffectiveHarnessConfig 合成
```

职责关系：

| 模块               | 负责                           |
| ------------------ | ------------------------------ |
| `contracts/`       | Domain Model                   |
| `core/intake`      | 输入与 Contract 校验           |
| `core/executor`    | Harness 生命周期               |
| `core/policy-engine` | Policy 判定                  |
| `core/diff-inspector` | 实际变更检查                |
| `core/validator`   | 独立验证                       |
| `core/approval-gate` | 门禁与人工审批               |
| `adapters/`        | Agent Adapter                  |
| `config/`（规划）  | 配置解析与合成                 |
| `index.ts`         | Core Public API                |

---

# 十七、设计约束

新增 Core API 时必须优先回答：

### 1. 这是 Harness 的领域对象吗？

如果只是某个 Agent 的能力，不应该进入 Core。

### 2. 它是否需要跨进程传输？

如果需要，应考虑 JSON Schema。

### 3. 它是不是 Agent 自述？

如果是，不能把它当成独立 Evidence。

### 4. 它是不是最终判定？

如果是，应进入 Review / RunResult，而不是 AgentResult。

### 5. 它是否依赖具体技术栈？

如果依赖 Vue、React、Vite 等，应优先考虑放入 Preset，而不是 Core。

### 6. 它是否依赖具体 Agent？

如果依赖 Claude Code、Codex 等具体实现，应优先考虑 Adapter，而不是 Core。

### 7. 它是配置的声明，还是运行的逻辑？

如果是声明，应进入 Manifest 或 Preset Manifest，并显式定义合并语义；不要在 Runtime 里增加
「如果来源是 A 就覆盖，如果来源是 B 就合并」的分支。

---

# 十八、核心原则

Core API 最终服务于三个问题：

```text
Policy Evaluation
+
Independent Evidence
+
Change Inspection
```

而不是：

```text
Model Intelligence
+
Prompt Optimization
+
Agent Memory
```

因此 Core 的边界应该始终保持在：

> **约束、执行、验证、变更检查、审计。**
