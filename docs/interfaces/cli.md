# CLI Interface

## 1. CLI Command Model

CLI Command 可以抽象为：

```ts
interface CliCommand<TOptions, TResult> {
  readonly name: string

  execute(
    options: TOptions
  ): Promise<TResult>
}
```

CLI Command 负责：

```text
参数 → Runtime Request → Runtime Result → CLI Output
```

不负责实现 Runtime 内部治理逻辑。

---

## 2. Common CLI Options

通用参数：

```ts
interface CommonCliOptions {
  root?: string
  json?: boolean
}
```

其中：

```text
root
    目标项目 Root

json
    是否使用机器可读输出
```

`run` 可以从任意目录调用。

默认：

```text
当前工作目录
```

底层 Runtime 允许显式指定：

```bash
--root <path>
```

---

## 3. Init Options

```ts
interface InitOptions extends CommonCliOptions {
  preset?: string
  force?: boolean
}
```

对应：

```bash
pedyc-harness init
pedyc-harness init --preset vue
pedyc-harness init --preset vue --force
```

### Init Result

```ts
interface InitResult {
  status: "created" | "unchanged" | "updated"
  files: FileChange[]
}
```

```ts
interface FileChange {
  path: string
  status:
    | "created"
    | "unchanged"
    | "modified"
    | "skipped"
}
```

具体 Result 字段可以随着 CLI 输出协议继续收敛。

---

## 4. Run Options

```ts
interface RunOptions extends CommonCliOptions {
  input: string
  dryRun?: boolean
}
```

例如：

```bash
pedyc-harness run \
  --input .harness/task.json \
  --dry-run \
  --json
```

### Run Result

```ts
interface RunResult {
  runId: string
  taskId: string
  status: RunStatus
  changes?: unknown
  validation?: unknown
  review?: unknown
}
```

```ts
type RunStatus =
  | "passed"
  | "failed"
  | "rejected"
  | "error"
```

最终详细执行结果由 Run Record 保存。

---

## 5. Verify Options

```ts
interface VerifyOptions extends CommonCliOptions {
  json?: boolean
}
```

Verify Result：

```ts
interface VerifyResult {
  status: "passed" | "failed"
  checks: VerificationCheck[]
}
```

```ts
interface VerificationCheck {
  name: string
  status: "passed" | "failed" | "skipped"
  message?: string
}
```

Verify 本身不实现 Verification Logic。

它只负责调用 Runtime Verification。

---

## 6. Doctor Options

```ts
interface DoctorOptions extends CommonCliOptions {
  json?: boolean
}
```

Doctor Result：

```ts
interface DoctorResult {
  status: "ok" | "failed"
  checks: DoctorCheck[]
}
```

```ts
interface DoctorCheck {
  name: string
  status: "ok" | "failed"
  message?: string
}
```

典型检查：

```text
Node / Runtime
Provider
Configuration
Required Scripts
Working Directory
Writable Directories
Package Manager
```

---

## 7. Diff Options

```ts
interface DiffOptions extends CommonCliOptions {
  preset?: string
  json?: boolean
}
```

Diff Result：

```ts
interface DiffResult {
  files: DiffFile[]
}
```

```ts
interface DiffFile {
  path: string
  status:
    | "missing"
    | "unchanged"
    | "modified"
}
```

Diff 是只读操作。

---

## 8. Update Options

```ts
interface UpdateOptions extends CommonCliOptions {
  preset?: string
  force?: boolean
  json?: boolean
}
```

对应：

```bash
pedyc-harness update --preset generic
pedyc-harness update --preset generic --force
```

Update 应返回文件级变更结果：

```ts
interface UpdateResult {
  files: FileChange[]
}
```

默认：

```text
missing   → create
unchanged → skip
modified  → skip
```

`--force` 才允许覆盖 modified 文件。

---

## 9. List Presets

规划中的：

```bash
pedyc-harness list-presets
```

建议：

```ts
interface ListPresetsOptions extends CommonCliOptions {
  json?: boolean
}
```

结果：

```ts
interface PresetListResult {
  presets: PresetInfo[]
}
```

```ts
interface PresetInfo {
  name: string
  version?: string
  extends?: string[]
}
```

目标形态下数据来自已安装 npm Preset，而不是 CLI 内置静态表。

---

## 10. Explain

规划中的：

```bash
pedyc-harness explain
```

用于展示：

```text
EffectiveHarnessConfig
+
Provenance
```

建议：

```ts
interface ExplainResult {
  config: EffectiveHarnessConfig
  provenance: ConfigProvenance[]
}
```

其中：

```ts
interface ConfigProvenance {
  path: string
  source: string
}
```

例如：

```text
policy.rules.no-direct-prod-write
    ↓
@acme/harness-preset
```

该接口用于解释配置来源，而不是重新执行 Policy。

---

## 11. CLI Output

CLI 至少支持两种输出模式：

```text
Human-readable
JSON
```

Human-readable：

```text
[task] loading contract
[policy] checking policy
[agent] executing
[diff] inspecting changes
[verify] running checks

Status: PASSED
Run ID: ...
```

JSON：

```json
{
  "runId": "...",
  "taskId": "...",
  "status": "passed",
  "changes": {},
  "validation": {},
  "review": {}
}
```

JSON 输出必须保持结构稳定，以支持：

```text
CI
Scripts
GitHub Actions
Automation
```

---

## 12. Exit Codes

CLI 使用稳定 Exit Code。

建议定义：

```ts
enum CliExitCode {
  Success = 0,
  TaskFailed = 1,
  ValidationFailed = 2,
  PolicyRejected = 3,
  ReviewRejected = 4,
  ConfigurationError = 5,
  ProviderError = 6,
  InvalidInput = 7,
  InternalError = 8,
}
```

语义：

| Code | Meaning             |
| ---: | ------------------- |
|  `0` | Success             |
|  `1` | Task failed         |
|  `2` | Validation failed   |
|  `3` | Policy rejected     |
|  `4` | Review rejected     |
|  `5` | Configuration error |
|  `6` | Provider error      |
|  `7` | Invalid input       |
|  `8` | Internal error      |

具体编号仍可以在实现阶段统一调整，但一旦作为公开 CLI 协议使用，应保持稳定。

---

## 13. CLI Runtime Boundary

CLI 不应该直接调用：

```ts
PolicyEngine
Validator
DiffEngine
```

推荐：

```ts
interface HarnessRuntime {
  run(request: RunRequest): Promise<RunResult>

  verify(request: VerifyRequest): Promise<VerifyResult>

  doctor(request: DoctorRequest): Promise<DoctorResult>
}
```

CLI 负责：

```text
CLI Arguments
    ↓
Request
    ↓
HarnessRuntime
    ↓
Result
    ↓
CLI Output
```

这样 CLI 可以保持为薄适配层。

---

## 14. Configuration Sources

CLI 可以定位以下配置来源：

```text
.harness/harness.json
.harness/policy.json
.harness/agents.json
AGENTS.md
package.json
Preset packages
Task Contract
```

但解析后的配置模型应该进入 Runtime / Core。

CLI 不应该自行实现：

```text
Preset DAG
Config Merge
Policy Evaluation
Verification
```

---

## 15. Command / Runtime Mapping

| CLI Command    | Runtime / Core                |
| -------------- | ----------------------------- |
| `init`         | Initialization / Preset entry |
| `run`          | Harness Runtime               |
| `verify`       | Verification                  |
| `doctor`       | Environment Diagnostics       |
| `diff`         | Template / Project Diff       |
| `update`       | Project Template Update       |
| `list-presets` | Preset Discovery              |
| `explain`      | Effective Config / Provenance |

CLI 本身只负责调用对应能力。

---

## 16. Interface Boundary

最终保持：

```text
┌─────────────────────────┐
│          CLI            │
│                         │
│ args / output / exit    │
└────────────┬────────────┘
             │
        Runtime API
             │
┌────────────▼────────────┐
│       Harness Core      │
│                         │
│ Policy / Agent / Diff   │
│ Verification / Review   │
└─────────────────────────┘
```

核心原则：

> **CLI 是 Runtime 的用户界面，而不是 Runtime 的实现。**

---

## 17. 相关文档

* [CLI 架构](../architecture/cli.md)
* [核心接口设计](./core.md)
* [Preset Interface](./preset.md)
* [Provider Interface](./provider.md)
* [Policy Interface](./policy.md)
* [发布与版本规则](../release.md)
