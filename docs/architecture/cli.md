# CLI 架构

## 1. 定位

CLI 是 Harness 的用户入口和 DX 层。

整体关系：

```text
User
  ↓
CLI
  ↓
Runtime
  ↓
Policy / Executor / Validator / Diff / Review
```

CLI 的核心职责是：

```text
参数解析
配置定位与加载
初始化
环境诊断
Runtime 调用
结果输出
Exit Code
```

CLI 不负责实现 Harness 的核心治理逻辑。

---

## 2. CLI 与 Runtime 边界

### CLI 负责

```text
Arguments
Configuration Loading
Preset Installation / Resolution Entry
Initialization
Diagnostics
Output
Exit Code
Process Lifecycle
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

因此 CLI 不应该直接实现：

```text
Policy Evaluation
Verification
Scope Enforcement
Review
```

CLI 只负责把用户操作转换成 Runtime 请求。

---

## 3. 命令模型

当前命令：

```bash
pedyc-harness init
pedyc-harness run
pedyc-harness verify
pedyc-harness doctor
pedyc-harness diff
pedyc-harness update
```

当前已经存在的典型调用：

```bash
npx pedyc-harness init --preset generic
npx pedyc-harness init --preset vue
npx pedyc-harness verify
npx pedyc-harness doctor
npx pedyc-harness diff --preset generic
npx pedyc-harness update --preset generic
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

规划中的命令：

```bash
pedyc-harness list-presets
pedyc-harness explain
```

---

## 4. init

`init` 用于初始化目标项目的 Harness 配置。

当前实现：

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

初始化涉及：

```text
.harness/policy.json
.harness/agents.json
JSON Schema
AGENTS.md
```

### 幂等性

默认行为：

```text
missing   → create
same      → skip
different → preserve
```

因此重复执行：

```bash
pedyc-harness init
```

不应该无条件覆盖用户文件。

### Force

显式指定：

```bash
pedyc-harness init --preset vue --force
```

才允许覆盖 Preset 管理的配置和入口说明。

---

## 5. 当前 Init 与目标 Init

当前实现采用：

```text
Preset
  ↓
Template Copy
  ↓
Target Project
```

因此：

```text
init
  → 生成 Preset 模板
  → diff
  → update
```

目标形态则收窄 `init --preset` 的职责：

```text
init
  ↓
安装 Preset npm package
  ↓
写入 harness.json
```

即：

```text
Preset 内容
    ↓
npm package
    ↓
node_modules
```

而不是：

```text
Preset
    ↓
复制全部内容
    ↓
Project
```

目标形态下，Preset 本身不再作为模板文件被复制进项目。

---

## 6. Run

`run` 是 CLI 对 Runtime 完整执行流程的入口。

```bash
pedyc-harness run --input .harness/task.json
```

完整生命周期：

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

CLI 不实现上述生命周期。

它只负责：

```text
Parse Input
    ↓
Load Configuration
    ↓
Create Runtime Request
    ↓
Invoke Runtime
    ↓
Format Result
```

---

## 7. Dry Run

`run --dry-run` 是安全预览模式。

```bash
pedyc-harness run \
  --input .harness/task.json \
  --dry-run \
  --json
```

Dry Run：

```text
不调用 Agent Provider
不执行 requiredChecks
不修改产品文件
```

只返回结构化的预览结果：

```json
{
  "status": "passed"
}
```

因此即使项目尚未配置 Provider，也可以使用 Dry Run 检查：

```text
配置
输入
契约
```

是否满足运行要求。

---

## 8. Verify

`verify` 用于验证当前项目状态。

```bash
pedyc-harness verify
```

与 `run` 的区别：

```text
run
→ 完整任务执行

verify
→ 验证已有状态 / 变化
```

当前 Verify 分为两个阶段。

### 通用校验

首先检查与具体项目规则无关的 Harness 条件：

```text
Contract 文件存在且可解析
Policy 合法
Provider command 形状正确
角色 mode 合法
requiredChecks 对应脚本存在
```

### Project Verification Hook

如果项目存在：

```text
.harness/verify.mjs
```

则执行该 Hook。

项目特有规则进入 Hook，而不需要修改 Core 或 CLI。

因此：

```text
Generic Verification
        +
Project Verification Hook
```

共同构成 Verify。

---

## 9. Doctor

Doctor 用于执行环境诊断：

```bash
pedyc-harness doctor
```

检查内容至少包括：

```text
Node / Runtime
Provider command
Provider configuration
Required scripts
Working directory
Writable directories
Package Manager
```

例如：

```text
Provider: codex

✓ command found
✓ configuration valid
✓ working directory exists
✓ project is writable
```

Doctor 的目标：

> **在执行 Task 之前发现环境问题。**

因此：

```text
Doctor
= 环境诊断

Verification
= 项目 / Task 验证
```

两者保持独立。

---

## 10. Diff

`diff` 用于比较当前项目与受管理模板之间的状态。

```bash
pedyc-harness diff --preset generic
```

当前可以报告：

```text
missing
unchanged
modified
```

并且：

```text
diff
→ 只读取
→ 不修改文件
```

目标形态下，Preset 内容本身来自 npm package，因此 `diff` 不再负责比较完整 Preset 内容，而主要面向项目自身受管理文件。

---

## 11. Update

`update` 用于显式更新项目受管理内容。

```bash
pedyc-harness update --preset generic
```

当前行为：

```text
缺失文件
    ↓
补充

已修改文件
    ↓
默认跳过
```

只有：

```bash
pedyc-harness update --force
```

才允许覆盖已经修改的模板。

Update 必须能够识别：

```text
用户修改
模板修改
版本差异
```

不能简单执行：

```text
Template → overwrite → Project
```

---

## 12. List Presets

规划中的：

```bash
pedyc-harness list-presets
```

用于列出当前项目可用的 Preset。

目标形态下，列表来源应该是：

```text
已安装 npm Preset
        ↓
Preset dependency graph
```

而不是 CLI 内部维护的静态 Preset 表。

例如：

```text
@acme/harness-preset
  └─ @pedyc/harness-preset-web
      └─ @pedyc/harness-preset-base
```

用户不需要手动理解完整继承关系。

---

## 13. Explain

规划中的：

```bash
pedyc-harness explain
```

用于解释当前 Harness 配置的最终来源。

核心输出对象：

```text
EffectiveHarnessConfig
```

以及：

```text
Provenance
```

用于回答：

> 这条 Policy / Verification / Rule 是谁声明的？

例如：

```text
Policy: no-direct-prod-write

Source:
@acme/harness-preset
  ↓
@acme/harness-preset-web
  ↓
EffectiveHarnessConfig
```

因此 `explain` 是配置可解释性工具，而不是另一个 Policy Engine。

---

## 14. Configuration Loading

CLI 负责定位并读取配置来源。

目标形态包括：

```text
.harness/harness.json
.harness/policy.json
.harness/agents.json
AGENTS.md
package.json
Preset packages
Task Contract
```

其中：

```text
package.json
```

还承担 Preset 版本来源。

CLI 完成加载后，将配置交给 Runtime / Core。

CLI 不应该直接操作：

```text
Policy Engine
Validator
Diff Engine
```

---

## 15. CLI / npm / Core

Preset 生态由三层组成：

```text
CLI
 ↓
DX Layer

npm
 ↓
Distribution Layer

Core
 ↓
Runtime Layer
```

| 层   | 职责                               |
| ---- | ---------------------------------- |
| CLI  | 参数、初始化、诊断、输出           |
| npm  | Preset 分发、版本、依赖            |
| Core | Preset 解析、配置合成、Policy 执行 |

目标形态下：

```bash
pedyc-harness init --preset @acme/harness-preset
```

本质上包含两个动作：

```text
                  init
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
修改 harness.json        安装 npm package
        │                     │
        └──────────┬──────────┘
                   ↓
             Preset Ready
```

例如：

```json
{
  "presets": [
    "@acme/harness-preset"
  ]
}
```

同时：

```json
{
  "devDependencies": {
    "pedyc-harness": "^1.0.0",
    "@acme/harness-preset": "^1.2.0"
  }
}
```

CLI 不负责递归解析 Preset 继承关系。

该职责属于 Core。

---

## 16. Preset 内容不复制

目标形态下：

> `init --preset` 不应该把 Preset 内容复制进项目。

因此：

```text
npm
 ↓
Preset Package
 ↓
Core Resolver
 ↓
EffectiveHarnessConfig
```

而不是：

```text
Preset
 ↓
Template Copy
 ↓
Project
```

这样 Preset 升级由 npm package version / lockfile 管理，不需要通过 `update` 逐文件同步 Preset 内容。

项目自身文件，例如：

```text
AGENTS.md
.harness/...
```

仍然可以通过 CLI 显式生成和更新。

---

## 17. Package Manager

Harness 仓库自身通过：

```json
{
  "packageManager": "pnpm@..."
}
```

固定 pnpm 版本。

CI 使用：

```bash
pnpm install --frozen-lockfile
```

但目标项目不要求使用 pnpm。

Runtime 当前优先检测：

```text
pnpm-lock.yaml
    ↓
yarn.lock
    ↓
npm
```

并使用对应包管理器执行 `requiredChecks`。

`doctor` 应显示检测到的包管理器。

---

## 18. 非 npm 项目

Harness Runtime 本身是 Node.js ESM。

因此 Python、Go 等项目不要求使用 npm 作为项目语言生态。

它们可以通过 CLI 接入：

```bash
npx pedyc-harness ...
```

或者直接调用 CLI。

项目只需要配置：

```text
验证命令
产品路径
Harness 配置
```

---

## 19. 发布与安装

CLI 建议作为目标项目的开发依赖：

```bash
npm install --save-dev pedyc-harness
pnpm add --save-dev pedyc-harness
```

CLI 是自包含发布包：

```text
Runtime
Preset Registry
Schema Templates
CLI
```

均不应该依赖仓库源码路径。

发布验证：

```bash
pnpm run release:check
```

具体版本和发布规则见：

```text
release.md
```

---

## 20. 外部项目验收

`examples/` 提供最小项目：

```text
examples/
├── generic-project
├── vue-project
└── node-project
```

分别覆盖不同包管理器。

例如：

```bash
cd examples/generic-project

pnpm exec pedyc-harness init
pnpm exec pedyc-harness verify
pnpm exec pedyc-harness run --dry-run --json
```

仓库根目录执行：

```bash
pnpm run verify:examples
```

对三个样例执行完整验收。

目的：

> 验证 Harness 不依赖自身仓库的目录结构和包管理器环境。

---

## 21. 架构原则

1. CLI 是入口，不是 Core。
2. CLI 不实现 Policy。
3. CLI 不实现 Verification。
4. CLI 不实现 Review。
5. CLI 不实现 Preset DAG Resolution。
6. CLI 不实现 Config Merge。
7. CLI 负责用户体验和 Runtime 编排入口。
8. Init 默认幂等。
9. Force 必须显式。
10. JSON 输出必须结构化。
11. Exit Code 必须稳定。
12. CLI 应保持薄。
13. Preset 分发由 npm 负责。
14. Preset 解析与配置合成由 Core 负责。
15. CLI 不应该因为支持更多 Preset 而不断增加业务逻辑。

---

## 22. 相关文档

* [CLI Interface](../interfaces/cli.md)
* [Preset 架构](./preset.md)
* [Provider 架构](./provider.md)
* [Policy 架构](./policy.md)
* [核心架构](../核心架构.md)
* [核心接口设计](../核心接口设计.md)
* [发布与版本规则](../release.md)
* [项目目标](../项目目标.md)
