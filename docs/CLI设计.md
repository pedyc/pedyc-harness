# CLI 使用与生成规则

CLI 是 [项目目标](./项目目标.md) 中的工具链入口：npm 包提供稳定的运行时和模板，CLI 把
适配当前项目的配置、脚本和提示词生成到目标项目中。

## 命令

已实现：

```bash
npx pedyc-harness init --preset generic
npx pedyc-harness init --preset vue
npx pedyc-harness verify
npx pedyc-harness doctor
npx pedyc-harness diff --preset generic
npx pedyc-harness update --preset generic
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

`run` 也可以从任意目录调用，CLI 会把当前目录作为目标项目 root；底层脚本支持显式的
`--root <path>`。

`run --dry-run` 是安全预览：不调用任何 Agent Provider、不执行 `requiredChecks`、不修改产品
文件，只返回 `status: passed` 的结构化结果。它可以在还没有配置 Provider 的项目中直接运行，
用于确认配置和输入契约是否可用。

`verify` 分两步：先做与项目无关的通用校验（契约文件存在且可解析、Policy 合法、Provider 命令
形状正确、角色 mode 合法、`requiredChecks` 都能在 `package.json` 中找到对应脚本），再在项目
存在 `.harness/verify.mjs` 时执行该钩子。项目特有规则写进钩子，不需要修改 Core 或 CLI。

规划中：

- `list-presets`：列出可用 Preset，避免让用户记忆 Preset 名称。目标形态下它会列出项目已安装的
  Preset 包及其继承关系，而不只是 CLI 内置表。
- `explain`：打印本次运行使用的 `EffectiveHarnessConfig`，以及每个值的来源（provenance），
  用于回答「这条 Policy 是谁声明的」。

## 初始化行为

`init` 创建 `.harness/policy.json`、`.harness/agents.json`、JSON Schema 和 `AGENTS.md`。
按 [项目目标](./项目目标.md) 第七节的原则，初始化必须可以安全地重复执行：已有 JSON 配置
不会被无条件合并或覆盖；已有 `AGENTS.md` 也只有在传入 `--force` 时才覆盖。

`--force` 会重新生成 Preset 管理的配置和入口说明，适合显式升级模板：

```bash
npx pedyc-harness init --preset vue --force
```

`diff` 比较当前项目与 Preset 的受管模板文件，输出 `missing`、`unchanged` 或 `modified`
状态，不会修改文件。`update` 只补充缺失文件，并默认跳过已经修改的文件；传入 `--force`
才会覆盖已修改的模板。

目标形态下 `init --preset` 的语义会收窄：Preset 内容不再被复制进项目，`init` 只写入
`.harness/harness.json` 并安装对应的 npm package，`diff` / `update` 的对象退化为项目自有
文件。原因与迁移方式见 [§11](#11-cli--npm--core-的职责边界)；当前实现仍是模板复制模式。

## 发布建议

建议将 CLI 作为项目的开发依赖：

```bash
npm install --save-dev pedyc-harness
pnpm add --save-dev pedyc-harness
```

CLI 负责生成项目级配置，Runtime 负责执行。配置和提示词进入项目版本库后，Harness 升级可以
通过 `init`、`diff` 或 `update` 显式完成，而不是隐式改变 CI 行为。

CLI 是自包含的发布包：运行时、Preset Registry 和 Schema 模板都在包内，不引用仓库路径。
打包与安装验证由 `pnpm run release:check` 完成，版本与发布规则见
[发布与版本规则](./release.md)。

## 外部项目样例

`examples/` 提供 `generic-project`、`vue-project` 和 `node-project` 三个最小项目，分别使用
pnpm、yarn 和 npm 锁文件。它们用于验证 Harness 不依赖仓库自身的目录结构：

```bash
cd examples/generic-project
pnpm exec pedyc-harness init
pnpm exec pedyc-harness verify
pnpm exec pedyc-harness run --dry-run --json
```

在仓库根目录执行 `pnpm run verify:examples` 会对三个样例运行完整验收命令。

## 包管理器兼容

Harness 仓库使用 `packageManager` 字段固定 pnpm 版本，并在 CI 中使用
`pnpm install --frozen-lockfile`。目标项目不要求使用 pnpm：Runtime 会优先检测
`pnpm-lock.yaml`，其次检测 `yarn.lock`，否则使用 npm 执行 `requiredChecks`。
`doctor` 会显示检测到的包管理器，便于确认项目接入环境。

## 非 npm 项目

Runtime 本身是 Node.js ESM 脚本。Python、Go 等项目可以使用 `npx` 或直接调用 CLI，
只需在 `.harness/policy.json` 中配置自己的验证命令和产品路径。

---

## CLI 设计

> CLI 是 Harness 的用户入口。
>
> CLI 负责参数、配置、输出和进程生命周期，
> 不负责实现 Harness 的核心治理逻辑。

---

### 1. CLI 定位

整体关系：

```text
User
  ↓
CLI
  ↓
Runtime
  ↓
Policy / Executor / Validator / Diff
````

CLI 不应该直接实现：

```text
Policy evaluation
Verification
Scope enforcement
Review
```

这些属于 Core Runtime。

---

### 2. 命令

核心命令：

```bash
pedyc-harness init
pedyc-harness run
pedyc-harness verify
pedyc-harness doctor
```

未来可以增加：

```bash
pedyc-harness update
```

---

## 3. init

### 作用

初始化项目 Harness 配置。

```bash
pedyc-harness init
```

流程：

```text
Resolve Preset
    ↓
Load Templates
    ↓
Check Existing Files
    ↓
Generate Missing Files
    ↓
Report Changes
```

---

### 幂等性

重复执行：

```bash
pedyc-harness init
```

应该安全。

默认：

```text
missing → create
same → skip
different → preserve
```

显式：

```bash
pedyc-harness init --force
```

才允许覆盖。

---

## 4. run

### 作用

执行完整 Harness 生命周期：

```text
Task
 ↓
Contract
 ↓
Policy
 ↓
Agent
 ↓
Changes
 ↓
Verification
 ↓
Gate
 ↓
Result
```

例如：

```bash
pedyc-harness run task.json
```

CLI 本身不实现上述流程，而是调用 Runtime。

---

### 输出

执行过程中可以输出：

```text
[task] loading contract
[policy] checking policy
[agent] executing
[diff] inspecting changes
[verify] running checks
[review] evaluating result
```

最终输出：

```text
Status: PASSED
Run ID: …
```

详细结果写入 Run Record。

---

## 5. verify

### 作用

对当前项目状态执行 Harness Verification。

```bash
pedyc-harness verify
```

与：

```bash
pedyc-harness run
```

区别：

```text
run
→ 完整任务执行

verify
→ 验证已有状态/变化
```

Verify 不应该依赖 Agent 声称：

```text
"tests passed"
```

而必须实际执行验证命令。

---

## 6. doctor

Doctor 用于检查执行环境：

```bash
pedyc-harness doctor
```

检查：

```text
Node / runtime
Provider command
Configuration
Required scripts
Working directory
Writable directory
```

Doctor 的目标：

> 尽早发现环境问题，而不是执行任务后才失败。

---

## 7. update

未来可以提供：

```bash
pedyc-harness update
```

用于更新：

```text
Preset
Templates
Project Harness configuration
```

Update 必须识别：

```text
用户修改
模板修改
版本差异
```

不能简单覆盖。

---

## 8. Exit Codes

CLI 必须使用稳定 Exit Code。

```text
0   success
1   task failed
2   validation failed
3   policy rejected
4   review rejected
5   configuration error
6   provider error
7   invalid input
8   internal error
```

当前已实现的编号：

| 编号 | 含义                | 何时返回                                                            |
| ---- | ------------------- | ------------------------------------------------------------------- |
| 0    | success             | 命令成功                                                             |
| 1    | task failed         | 运行未通过，或命令用法错误                                           |
| 5    | configuration error | 配置缺失、非法、路径越界，或 `verify` / `doctor` 无法解析配置        |

`2` / `3` / `4` / `6` / `7` / `8` 保留给后续里程碑：把它们预留出来而不是现在凑合映射，
是为了让已经落地的编号以后不再变动。

规则：

> 配置错误（`5`）必须在执行前返回，不能等到运行中途。

> 项目自有的 `.harness/verify.mjs` 退出码原样透传，不被 CLI 改写。

重要的是：

> Shell / CI 可以仅通过 Exit Code 判断 Harness 是否成功。

---

## 9. JSON 输出

CLI 可以提供机器可读输出：

```bash
pedyc-harness run task.json --json
```

输出：

```json
{
  "runId": "…",
  "taskId": "…",
  "status": "passed",
  "changes": {},
  "validation": {},
  "review": {}
}
```

这样可以支持：

```text
CI
Scripts
GitHub Actions
其他 Automation
```

---

## 10. Configuration Loading

CLI 不再自行解析配置路径：定位、读取与校验统一由 Core 的 `loadHarnessConfig` 完成，
CLI 只消费结果与结构化错误。

CLI 负责加载：

```text
.harness/harness.json      Manifest
.harness/policy.json
.harness/agents.json
AGENTS.md
package.json               依赖与 Preset 版本来源
Preset（已安装的 npm 包）
Task Contract
```

配置解析完成后，交给 Runtime。

来源优先级（**来源选择**，不是字段合并；字段级合并属于 M17）：

```text
Manifest 声明的路径 / 内联对象
      ↓
约定位置 .harness/policy.json、.harness/agents.json
      ↓
内置默认值
```

没有 `harness.json` 的项目走同一条管线的后两级，行为与 Manifest 出现之前一致。
迁移是增量的，不是破坏性的。

`doctor` 打印实际生效的来源；回退到内置默认值也会被列出来：

```text
Configuration sources:
  manifest   .harness/harness.json
  policy     .harness/policy.json
  agents     built-in defaults
  preset     @pedyc/harness-preset-vue   (declared, not yet consumed)
```

静默回退与显式配置在结果上无法区分，所以回退必须被报告出来。

不要让：

```text
CLI command
```

直接操作：

```text
Policy Engine
Validator
Diff Engine
```

---

## 11. CLI / npm / Core 的职责边界

Preset 生态由三层共同组成，职责不重叠：

```text
CLI
   ↓
DX layer

npm
   ↓
distribution layer

Core
   ↓
runtime layer
```

| 层   | 职责                                                     |
| ---- | -------------------------------------------------------- |
| CLI  | 参数解析、初始化、诊断、输出，让用户不必理解多层 Preset   |
| npm  | Preset 分发、版本、依赖                                   |
| Core | Preset 解析、配置合成、Policy 执行                       |

因此 `init --preset` 实际上是两个动作：

```text
                  init
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
修改 harness.json        安装 npm package
        │                     │
        └──────────┬──────────┘
                   ↓
              npm install
                   ↓
             preset ready
```

期望输出：

```text
✔ Found package manager: npm

✔ Installing @acme/harness-preset

✔ Validating preset

✔ Resolving dependencies

✔ Creating .harness/harness.json

✔ Preset loaded successfully
```

因此：

```json
{
  "presets": ["@acme/harness-preset"]
}
```

并且：

```json
{
  "devDependencies": {
    "pedyc-harness": "^1.0.0",
    "@acme/harness-preset": "^1.2.0"
  }
}
```

这里有一个重要区别：

> **`init --preset` 不应该把 Preset 的内容复制进项目。**

它应该只把依赖写进 `package.json`、把引用写进 `.harness/harness.json`。Preset 升级因此
不需要 `update` 去逐文件比对，也就不会静默覆盖用户修改。

这与当前实现不同：当前 `init` 会把 Preset 模板文件生成到目标项目，`update` 负责后续同步。
目标形态下的模板生成只保留给项目自有文件（如 `AGENTS.md`）。

手动方式同样支持：

```bash
npm install -D @acme/harness-preset
```

用户不需要知道多层 Preset。安装一个包、在 `harness.json` 中声明一次，其余由 Harness 自动解析：

```text
@acme/harness-preset
        ↓
@pedyc/harness-preset-web
        ↓
@pedyc/harness-preset-base
```

需要解释时使用诊断命令，而不是要求用户维护继承关系。

---

## 12. CLI 与 Runtime 边界

### CLI 负责

```text
参数解析
配置加载
Preset resolve
输出
Exit Code
进程启动
```

### Runtime 负责

```text
Contract
Policy
Agent Execution
Diff
Verification
Review
Run Record
```

---

## 13. CLI 设计原则

1. CLI 是入口，不是核心逻辑。
2. CLI 不实现 Policy。
3. CLI 不实现 Verification。
4. CLI 不实现 Review。
5. CLI 输出必须适合人和 CI。
6. Exit Code 必须稳定。
7. Init 默认幂等。
8. Force 必须显式。
9. JSON 输出必须结构化。
10. CLI 应尽量保持薄。
