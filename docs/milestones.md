# 迁移、重构与发布里程碑

本文件是 [项目目标](./项目目标.md) 的进度记录：把「从 Vue 示例迁移到通用 Harness」的路线图与阶段性验收标准合并在一起。

每个里程碑都必须满足明确的交付物和验证标准后，才能进入下一阶段。

需要特别说明：

> **里程碑编号代表项目演进历史，不严格代表实际执行顺序。**

M11 是在 M7–M10 尚未实施前插入完成的 TypeScript 基础工程里程碑。因此当前实际推进顺序为：

```text
M0 → M1 → M2 → M3 → M4 → M5 → M6
                              ↓
                             M11
                              ↓
                         M7 → M8 → M9 → M10
                                      ↓
                              M12 → M13 → M14
```

M7–M10 仍然属于第二阶段治理能力，M11 不改变其优先级，只是提前完成了支撑治理能力所需要的 TypeScript 化工作。

---

# 里程碑总览

## 第一阶段：通用化与发布

| 里程碑 | 目标                                     | 状态   |
| ------ | ---------------------------------------- | ------ |
| M0     | 固定当前 Vue Harness 基线                | 已完成 |
| M1     | 建立通用 CLI 和项目初始化能力            | 已完成 |
| M2     | 建立 pnpm workspace 与 Core/CLI 初步拆包 | 已完成 |
| M3     | 将完整 Runtime 迁入 Core                 | 已完成 |
| M4     | 完善 Preset 和项目生成模板               | 已完成 |
| M5     | 建立外部项目样例和兼容性验证             | 已完成 |
| M6     | 完成 npm 发布准备并建立 v1.0 发布基线    | 已完成 |

## 第二阶段：治理能力

| 里程碑 | 目标                              | 状态   |
| ------ | --------------------------------- | ------ |
| M7     | 让策略真正可执行（Policy Engine） | 计划中 |
| M8     | 建立独立验证与结构化证据链        | 计划中 |
| M9     | 建立执行轨迹与审计记录            | 计划中 |
| M10    | 建立审批门与人工介入机制          | 计划中 |

## 第三阶段：TypeScript 化

| 里程碑 | 目标                                               | 状态   |
| ------ | -------------------------------------------------- | ------ |
| M11    | 将 Harness Runtime 迁移到 TypeScript 并发布 v1.1.0 | 已完成 |

## 第四阶段：治理发布与可移植

| 里程碑 | 目标                                | 状态   |
| ------ | ----------------------------------- | ------ |
| M12    | 汇总 M7–M10 治理能力并发布 v1.2.0   | 计划中 |
| M13    | 建立可移植的 Agent Provider Adapter | 计划中 |
| M14    | 发布 v1.3.0                         | 计划中 |

---

# 第一阶段：通用化与发布

## M0：固定 Vue Harness 基线

### 目标

保留当前 Vue 3 + TypeScript 项目作为第一个集成宿主，确保重构期间已有 Harness 能力不回退。

### 已交付

* Planner → Coder → Tester → Reviewer 执行闭环。
* JSON Schema、Policy、Provider 和运行记录。
* Vue 项目的类型检查、单元测试和生产构建门禁。
* Claude CLI Adapter 和受保护目录策略。

### 验收标准

```bash
pnpm run harness:verify
pnpm run type-check
pnpm run test:unit
pnpm run build
```

---

## M1：通用 CLI 和项目初始化

### 目标

让其他项目可以通过 npm 包或 `npx` 初始化 Harness，而不依赖当前 Vue 项目的目录结构。

### 已交付

* 运行器支持 `--root`。
* `package.json` 暴露 `pedyc-harness` bin 入口。
* `pedyc-harness init --preset generic|vue`。
* `verify`、`run` 和 `doctor` 命令。
* `init` 默认幂等，`--force` 才覆盖模板文件。
* 根据锁文件选择 npm、pnpm 或 yarn 执行验证命令。
* generic 与 Vue 的差异放入 Preset 初始化模板。

### 验收标准

* generic 和 Vue Preset 都能初始化。
* 重复执行不会覆盖用户配置。
* `--force` 能明确重新生成模板。
* dry-run 返回结构化 `passed` 结果。

---

## M2：pnpm Workspace 与 Core/CLI 初步拆包

### 目标

建立未来 Monorepo 的包边界，但暂时不破坏根目录 Vue 示例的开发和验证流程。

### 已交付

```text
packages/
├── core/   @pedyc/harness-core
└── cli/    pedyc-harness
```

* 根目录启用 `pnpm-workspace.yaml`。
* Core 提供包管理器检测和验证命令原语。
* `scripts/harness/package-manager.mjs` 通过 workspace 导出复用 Core。
* CLI 提供独立发布入口，并兼容根目录旧 CLI。
* 根目录集成测试继续作为迁移安全网。

### 验收标准

* `pnpm install --frozen-lockfile` 成功。
* Core 可以执行 `pnpm pack --dry-run`。
* `pnpm exec pedyc-harness doctor` 成功。
* 根目录全部 Harness、类型、测试和构建门禁通过。

---

## M3：完整 Runtime 迁入 Core

### 状态

**已完成**

### 目标

将 `scripts/harness/run.mjs` 中与技术栈无关的逻辑迁入 `@pedyc/harness-core`，CLI 只负责参数解析和命令调度。

### 已交付

* Task Intake。
* 包管理器检测。
* 命令执行。
* 文件快照。
* Schema 加载与校验。
* Agent 响应解析。
* 阶段响应校验。
* Policy 校验。
* Provider 调度。
* Planner / Coder / Tester / Reviewer 编排。
* 验证命令执行。
* 超时与结构化结果。
* Core API Node 单元测试。
* 旧 CLI 参数与 `.harness/` 文件格式兼容。

### 验收标准

* CLI 不再复制 Runtime 核心逻辑。
* `packages/core` 可以脱离 Vue 项目运行。
* Vue 项目四阶段 dry-run 与迁移前一致。
* Core 覆盖输入失败、Provider 失败、越权变更和命令失败。

---

## M4：Preset 和项目生成模板

### 状态

**已完成**

### 目标

让技术栈差异只存在于 Preset，而不进入 Core 或 CLI 的编排逻辑。

### 已交付

* generic Preset 与 Vue Preset 独立 workspace package。
* CLI Preset Registry。
* 统一 Preset 接口。
* `diff` 命令。
* `update` 命令。
* `update --force`。
* generic 与 Vue 独立初始化及 Registry 测试。

### 验收标准

* 新增 Preset 不需要修改 Core。
* `init`、`diff`、`update` 可重复执行。
* 模板更新不会静默覆盖用户配置。
* generic 和 Vue 均有独立测试。

---

## M5：外部项目样例和兼容性验证

### 状态

**已完成**

### 目标

用真实的最小项目证明 Harness 不依赖 Vue 目录和命令。

### 已交付

```text
examples/
├── README.md
├── generic-project/
├── vue-project/
└── node-project/
```

覆盖：

```text
pnpm
npm
yarn
```

并完成：

```text
init
verify
doctor
run --dry-run --json
```

的自动化验证。

### 验收标准

每个样例至少通过：

```bash
pnpm exec pedyc-harness init
pnpm exec pedyc-harness verify
pnpm exec pedyc-harness run --dry-run --json
```

同时验证：

* pnpm、npm、yarn 锁文件识别。
* Windows 和 Linux 命令入口。
* Node.js 20+。
* 缺失 Provider、缺失脚本和无效配置的结构化错误。
* dry-run 不调用 Provider。
* dry-run 不执行验证命令。
* dry-run 不修改产品文件。

### 验收证据

```bash
pnpm run verify:examples
pnpm run test:unit
```

---

## M6：npm 发布准备与 v1.0 基线

### 状态

**已完成**

### 目标

将 Core、CLI 和 Preset 建立为可审查、可安装、可升级的 npm 发布单元。

### 已交付

四个 package：

```text
@pedyc/harness-core
pedyc-harness
@pedyc/harness-preset-generic
@pedyc/harness-preset-vue
```

已完成：

* package metadata。
* LICENSE / README。
* publish 配置。
* package files 白名单。
* CLI package 化。
* Schema 与 task example 随包发布。
* `.harness/verify.mjs` 项目自定义验证钩子。
* `release:check`。
* tarball 消费者项目测试。
* CHANGELOG。
* Release 测试。

### 验收标准

```bash
pnpm run harness:verify
pnpm run verify:examples
pnpm run release:check
pnpm run type-check
pnpm run test:unit
pnpm run build
```

### 发布门槛

* 所有 workspace 包可独立打包。
* tarball 安装后 CLI 可以运行。
* 所有样例通过验证。
* CI 使用 frozen lockfile。
* 没有未解决的高风险安全问题。

### 遗留说明

v1.0 的「发布」指仓库已经达到可发布状态并完成本地 tarball 验证。

实际 npm registry 发布由维护者根据 [发布与版本规则](./release.md) 执行。

---

# 第二阶段：治理能力

> 本阶段的核心问题不是“Agent 能做更多事情”，而是：
>
> **Agent 做了什么、为什么允许做、结果凭什么可信。**

治理能力优先级：

```text
Policy
  ↓
Independent Verification
  ↓
Audit / Trace
  ↓
Approval Gate
```

---

## M7：策略可执行（Policy Engine）

### 状态

**计划中**

### 目标

让 `policy.json` 中已经声明的策略真正成为运行时约束。

当前主要缺口：

```text
protectedPaths
    ↓
目前只校验字段格式，没有参与拦截

forbiddenCommands
    ↓
目前没有执行层调用
```

因此：

> 当前 Policy 部分仍然是声明，而不是完整的执行约束。

### 工作项

#### 1. 文件策略

将：

```text
allowedProductPaths
protectedPaths
```

统一纳入文件 Scope 判定。

规则：

```text
protectedPaths 命中
    ↓
拒绝

不属于 allowedProductPaths
    ↓
拒绝
```

具体优先级必须由单一 Policy 模块定义。

#### 2. 命令策略

将：

```text
forbiddenCommands
```

接入命令执行层。

Provider 命令和 Verification 命令执行前都必须经过策略检查。

```text
Command
   ↓
PolicyEvaluator
   ↓
Allowed / Rejected
   ↓
Execute
```

#### 3. 统一 Policy Evaluator

文件与命令策略必须由统一的 Policy 模块负责判断。

目标不是增加更多规则，而是避免：

```text
文件检查一套逻辑
命令检查一套逻辑
```

导致规则语义漂移。

#### 4. 可选扩展

按实际需求增加：

```text
timeout
maxChangedFiles
```

暂时只保留字段定义、不实现执行：

```text
network
model
token budget
```

#### 5. Violation Mode

增加：

```text
onViolation:
  fail
  report
```

默认：

```text
fail
```

其中 `report` 用于兼容已有声明性策略。

### 验收标准

* 修改受保护目录会导致运行失败。
* 执行 forbidden command 前即被拒绝。
* 被拒绝的命令不会产生执行副作用。
* `onViolation: report` 保持只报告行为。
* 根仓库和 examples 在默认 `fail` 下全部通过。
* Policy 规则均有失败路径测试。

### 版本影响

Policy 从声明变为强制执行属于行为增强。

如果已有项目显式声明相关字段，强制执行可能改变运行结果，因此必须：

* 在 CHANGELOG 中明确说明；
* 提供迁移说明；
* 明确 `report` 的兼容用途。

具体 SemVer 判定遵循 [发布与版本规则](./release.md)。

---

## M8：独立验证与证据链

### 状态

**计划中**

### 目标

把：

> **Agent 自己说成功 ≠ Harness 证明成功**

落实为正式的 Verification Evidence 契约。

### 工作项

定义结构化证据：

```text
{
  name,
  command,
  packageManager,
  exitCode,
  durationMs,
  stdoutDigest,
  stderrDigest,
  skipped
}
```

证据必须记录：

* 实际执行命令。
* 包管理器。
* Exit Code。
* 执行耗时。
* stdout 摘要。
* stderr 摘要。
* 是否跳过。

### Reviewer 输入

Reviewer 不再只读取 Agent 的：

```text
passed: true
```

而必须消费：

```text
Acceptance Criteria
        +
Verification Evidence
        +
Actual Changes
```

### 一致性检查

如果 Agent 声称修改某文件，但实际 diff 中不存在：

```text
Agent claim
    ≠
Actual Change
```

必须明确列出，而不能静默忽略。

### 验收标准

* 每个 required check 都存在对应 Evidence。
* Evidence 包含命令、Exit Code、耗时。
* 成功但可疑的验证结果仍可通过 Evidence 被审查。
* 没有任何 Evidence 时 Reviewer 不得批准。
* dry-run 不产生 Evidence。
* Agent 自述不能作为独立 Verification Evidence。

### 版本影响

新增 Evidence Schema 字段属于兼容性扩展，具体版本按照 [发布与版本规则](./release.md) 判定。

---

## M9：执行轨迹与审计记录

### 状态

**计划中**

### 目标

让一次运行：

```text
发生了什么
什么时候发生
哪个阶段失败
哪个检查
```
