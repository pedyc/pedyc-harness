# 迁移、重构与发布里程碑

本文件是 [项目目标](../项目目标.md) 的进度记录：把「从 Vue 示例迁移到通用 Harness」的路线图与阶段性验收标准合并在一起。

每个里程碑都必须满足明确的交付物和验证标准后，才能进入下一阶段。

需要特别说明：

> **里程碑编号代表项目演进历史，不严格代表实际执行顺序。**

M11 是在 M7–M10 尚未实施前插入完成的 TypeScript 基础工程里程碑；配置层虽然编号为第五阶段，
但已提前完成。**当前实际位置：M15、M16 已由 M12 发布为 1.2.0（声明式配置层）；下一步的实现工作是
M7（策略可执行），它属于 1.3.0。** 实际推进顺序是：

```text
M0 → M1 → M2 → M3 → M4 → M5 → M6
                              ↓
                             M11
                              ↓
        M15 → M16 ← 已完成
              ↓
        M12（发布 1.2.0：声明式配置层）← 已发布
              ↓
        M7 → M8 → M17 → M9 → M10
              ↓
        M14（发布 1.3.0：治理执行）← 当前工作

M13（可移植 Provider，在 1.2.0 基线之后，可随时插入）
M18 → M19（在 M17 之后）
M20（生态命令，可随时插入）
M21（代码 Preset，在 M8 与 M17 之后）
```

阶段名称保留不变，因为阶段记录的是演进历史，不是优先级。

## 为什么配置层要先做

```text
M15–M16  决定配置从哪里读
        ↓
M7       才能基于稳定来源实现强制执行
        ↓
M17      才能基于 M7 实际字段定义合并语义
        ↓
M9       才能把生效配置与 provenance 写进 Run Record
```

反过来的代价是返工：

* M7 若先按 `.harness/policy.json` 写死读取路径，M15 引入 Manifest 后必须重写加载层。
* M9 若先固定 Run Record schema，M17 引入 provenance 后必须改两次。

需要注意的是，配置层只提前**加载与合成**，不提前合并语义的定稿：字段级合并规则仍要等 M7
把策略字段实现出来之后再固化。

## 依赖关系

| 里程碑 | 依赖            | 说明                                     |
| ------ | --------------- | ---------------------------------------- |
| M15    | —               | 配置入口与 Runtime 模块边界              |
| M16    | M15             | Preset 需要 Manifest 与加载器            |
| M7     | M16             | 强制执行的策略需要稳定来源               |
| M8     | M7              | 证据契约挂在验证执行之上                 |
| M17    | M7、M16         | 合并语义基于 M7 实际实现的字段           |
| M9     | M17             | Run Record 需要写入生效配置与 provenance |
| M10    | M9              | 审批记录属于审计记录的一部分             |
| M12    | M15、M16        | 发布 v1.2.0：声明式配置层                |
| M13    | M12             | Provider 协议在 1.2.0 基线上演进         |
| M14    | M7、M8          | 发布 v1.3.0：治理执行                    |
| M18    | M16、M17        | 团队 Preset 需要继承与合成               |
| M19    | M17             | 安全模型建立在合并语义之上               |
| M20    | M18、M19        | 生态命令在治理模型稳定后再做             |
| M21    | M7、M8、M17     | 扩展面注册的是规则与证据实现，并参与合成 |

---

## 版本阶梯

里程碑回答「什么时候做什么」，版本回答「用户可以期待什么」。两者不是一一对应：一个版本可能包含
若干里程碑，一个里程碑也可能横跨两个版本。

| 版本      | 能力契约（用户可用 `npx` 复现）                                       | 依赖        | 状态                   |
| --------- | -------------------------------------------------------------------- | ----------- | ---------------------- |
| 1.0.1     | `init --preset vue\|generic` 生成 `.harness/`、契约与 `AGENTS.md`；`run`（固定四阶段）/`verify`/`doctor`/`diff`/`update`/`list-presets`；Provider 需项目自配；Preset 是带默认导出的代码包 | M0–M6       | 已发布                 |
| 1.1.0     | TypeScript 化；`@pedyc/harness-core/contracts` 公开；`schemas/` 单一来源 + `schemas:check`（非破坏） | M11         | 已发布                 |
| 1.2.0     | **声明式配置层**：`.harness/harness.json` 成为入口；Preset 变 npm 数据包 + `extends` DAG；CLI 无静态表；`init` 不再复制 Preset 内容；`doctor`/`list-presets` 报告配置来源 | M15、M16    | 已发布                 |
| 1.3.0     | **治理真正生效**：`protectedPaths` 与 `forbiddenCommands` 被强制；`onViolation`；severity 处置；超时与取消；结构化证据与信任等级；Findings 与结构验证 | M7、M8      | 计划中                 |
| 1.4.0     | **生效配置与审计**：字段级合并 + deny-wins + provenance + `conflicts`；`RunResult` 与 `RunRecord` 分离；审批门 | M17、M9、M10 | 计划中                |
| 1.5.0+    | 可移植 Provider；团队 / 组织 Preset 与策略安全模型；Preset 生态命令与代码扩展契约 | M13、M18–M21 | 计划中                |

两条规则：

* **版本号怎么定由 [发布与版本规则](../release.md) §11 决定**，本节只描述「这个版本承诺什么能力」。
* 发布里程碑不预先「攒」里程碑：**已经完成的内容按阶梯发布**，未完成的顺延。这条原则来自 M14 自身，
  2026-09 的 M15/M16 提前完成正是它的第一次应用。

两个版本的语义级别尚未定稿，不要提前假定它们是 MINOR：

* **1.3.0（M7、M8）**：`protectedPaths`/`forbiddenCommands` 从「声明但不管用」变成「真的拦」，
  按 §11 属于「CLI 行为导致旧用法失效」。要判 MINOR，必须同时提供 `onViolation: report` 作为
  兼容退路（M7 的既有工作项）。
* **1.4.0（M17）**：项目自己的 `policy` 不再「整份覆盖」预设，而是字段级合并 + deny-wins——
  **既有项目生效的治理会变**，这是整条路线上最像 MAJOR 的一项。若给不出兼容开关，它就应该被编成
  2.0.0，而不是 1.4.0。

---

## 里程碑总览

### 第一阶段：通用化与发布

| 里程碑 | 目标                                     | 状态   |
| ------ | ---------------------------------------- | ------ |
| M0     | 固定当前 Vue Harness 基线                | 已完成 |
| M1     | 建立通用 CLI 和项目初始化能力            | 已完成 |
| M2     | 建立 pnpm workspace 与 Core/CLI 初步拆包 | 已完成 |
| M3     | 将完整 Runtime 迁入 Core                 | 已完成 |
| M4     | 完善 Preset 和项目生成模板               | 已完成 |
| M5     | 建立外部项目样例和兼容性验证             | 已完成 |
| M6     | 完成 npm 发布准备并建立 v1.0 发布基线    | 已完成 |

### 第二阶段：治理能力

| 里程碑 | 目标                              | 状态   |
| ------ | --------------------------------- | ------ |
| M7     | 让策略真正可执行（Policy Engine） | 计划中 |
| M8     | 建立独立验证与结构化证据链        | 计划中 |
| M9     | 建立执行轨迹与审计记录            | 计划中 |
| M10    | 建立审批门与人工介入机制          | 计划中 |

> M7 依赖 M16 提供的配置来源（**已具备**），M9 依赖 M17 提供的生效配置与 provenance，因此本阶段
> 的启动时间晚于 M15–M16，而现在 M15–M16 已经落地。

### 第三阶段：TypeScript 化

| 里程碑 | 目标                                               | 状态   |
| ------ | -------------------------------------------------- | ------ |
| M11    | 将 Harness Runtime 迁移到 TypeScript 并发布 v1.1.0 | 已完成 |

### 第四阶段：治理发布与可移植

| 里程碑 | 目标                                | 状态   |
| ------ | ----------------------------------- | ------ |
| M12    | 发布 v1.2.0：声明式配置层           | 已完成 |
| M13    | 建立可移植的 Agent Provider Adapter | 计划中 |
| M14    | 发布 v1.3.0：治理执行               | 计划中 |

### 第五阶段：声明式治理配置

> 本阶段虽然编号在最后，但 M15–M16 曾是最**高优先级**，先于 M7 落地；两者现已完成，M17 排在
> M7 之后。原因见文件开头的「为什么配置层要先做」。

| 里程碑 | 目标                                                              | 状态   |
| ------ | ----------------------------------------------------------------- | ------ |
| M15    | 建立 Config Foundation（Manifest、加载、校验）与 Runtime 模块边界 | 已完成 |
| M16    | 建立 Preset System（npm 分发、继承、DAG 解析）                    | 已完成 |
| M17    | 合成 EffectiveHarnessConfig / EffectivePolicy                     | 计划中 |
| M18    | 支持团队与组织 Preset                                             | 计划中 |
| M19    | 定义策略安全模型（合并语义与不可覆盖约束）                        | 计划中 |
| M20    | 提供 Preset 搜索 / 安装 / 发布的最小生态能力                      | 计划中 |
| M21    | 定义 Preset 代码扩展契约（入口、注册面、信任与 provenance）        | 计划中 |

设计依据见 [系统架构](../architecture/system.md)、[Preset 设计](../architecture/preset.md)、[Policy 设计](../architecture/policy.md)、
[核心接口设计](../interfaces/README.md)。

---

## 第一阶段：通用化与发布

### M0：固定 Vue Harness 基线

#### 目标

保留当前 Vue 3 + TypeScript 项目作为第一个集成宿主，确保重构期间已有 Harness 能力不回退。

#### 已交付

* Planner → Coder → Tester → Reviewer 执行闭环。
* JSON Schema、Policy、Provider 和运行记录。
* Vue 项目的类型检查、单元测试和生产构建门禁。
* Claude CLI Adapter 和受保护目录策略。

#### 验收标准

```bash
pnpm run harness:verify
pnpm run type-check
pnpm run test:unit
pnpm run build
```

---

### M1：通用 CLI 和项目初始化

#### 目标

让其他项目可以通过 npm 包或 `npx` 初始化 Harness，而不依赖当前 Vue 项目的目录结构。

#### 已交付

* 运行器支持 `--root`。
* `package.json` 暴露 `pedyc-harness` bin 入口。
* `pedyc-harness init --preset generic|vue`。
* `verify`、`run` 和 `doctor` 命令。
* `init` 默认幂等，`--force` 才覆盖模板文件。
* 根据锁文件选择 npm、pnpm 或 yarn 执行验证命令。
* generic 与 Vue 的差异放入 Preset 初始化模板。

#### 验收标准

* generic 和 Vue Preset 都能初始化。
* 重复执行不会覆盖用户配置。
* `--force` 能明确重新生成模板。
* dry-run 返回结构化 `passed` 结果。

---

### M2：pnpm Workspace 与 Core/CLI 初步拆包

#### 目标

建立未来 Monorepo 的包边界，但暂时不破坏根目录 Vue 示例的开发和验证流程。

#### 已交付

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

#### 验收标准

* `pnpm install --frozen-lockfile` 成功。
* Core 可以执行 `pnpm pack --dry-run`。
* `pnpm exec pedyc-harness doctor` 成功。
* 根目录全部 Harness、类型、测试和构建门禁通过。

---

### M3：完整 Runtime 迁入 Core

#### 目标

将 `scripts/harness/run.mjs` 中与技术栈无关的逻辑迁入 `@pedyc/harness-core`，CLI 只负责参数解析和命令调度。

#### 已交付

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

#### 验收标准

* CLI 不再复制 Runtime 核心逻辑。
* `packages/core` 可以脱离 Vue 项目运行。
* Vue 项目四阶段 dry-run 与迁移前一致。
* Core 覆盖输入失败、Provider 失败、越权变更和命令失败。

---

### M4：Preset 和项目生成模板

#### 目标

让技术栈差异只存在于 Preset，而不进入 Core 或 CLI 的编排逻辑。

#### 已交付

* generic Preset 与 Vue Preset 独立 workspace package。
* CLI Preset Registry。
* 统一 Preset 接口。
* `diff` 命令。
* `update` 命令。
* `update --force`。
* generic 与 Vue 独立初始化及 Registry 测试。

#### 验收标准

* 新增 Preset 不需要修改 Core。
* `init`、`diff`、`update` 可重复执行。
* 模板更新不会静默覆盖用户配置。
* generic 和 Vue 均有独立测试。

---

### M5：外部项目样例和兼容性验证

#### 目标

用真实的最小项目证明 Harness 不依赖 Vue 目录和命令。

#### 已交付

```text
examples/
├── README.md
├── generic-project/
├── vue-project/
└── node-project/
```

覆盖 `pnpm`、`npm`、`yarn` 三个包管理器,并完成 `init`、`verify`、`doctor`、
`run --dry-run --json` 的自动化验证。

#### 验收标准

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

#### 验收证据

```bash
pnpm run verify:examples
pnpm run test:unit
```

---

### M6：npm 发布准备与 v1.0 基线

#### 目标

将 Core、CLI 和 Preset 建立为可审查、可安装、可升级的 npm 发布单元。

#### 已交付

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

#### 验收标准

```bash
pnpm run harness:verify
pnpm run verify:examples
pnpm run release:check
pnpm run type-check
pnpm run test:unit
pnpm run build
```

#### 发布门槛

* 所有 workspace 包可独立打包。
* tarball 安装后 CLI 可以运行。
* 所有样例通过验证。
* CI 使用 frozen lockfile。
* 没有未解决的高风险安全问题。

#### 遗留说明

v1.0 的「发布」指仓库已经达到可发布状态并完成本地 tarball 验证。

实际 npm registry 发布由维护者根据 [发布与版本规则](../release.md) 执行。

---

## 第二阶段：治理能力

> 本阶段的核心问题不是“Agent 能做更多事情”，而是：
>
> **Agent 做了什么、为什么允许做、结果凭什么可信。**

治理能力优先级是 Policy → Independent Verification → Audit / Trace → Approval Gate。

---

### M7：策略可执行（Policy Engine）

#### 目标

让 `policy.json` 中已经声明的策略真正成为运行时约束。

当前主要缺口:`protectedPaths` 只校验字段格式,没有参与拦截;`forbiddenCommands` 没有执行层调用。

因此：

> 当前 Policy 部分仍然是声明，而不是完整的执行约束。

#### 工作项

##### 1. 文件策略

将 `allowedProductPaths` 与 `protectedPaths` 统一纳入文件 Scope 判定。

规则有两条:`protectedPaths` 命中即拒绝;不属于 `allowedProductPaths` 也拒绝。

具体优先级必须由单一 Policy 模块定义。

##### 2. 命令策略

将 `forbiddenCommands` 接入命令执行层。

Provider 命令和 Verification 命令执行前都必须经过策略检查:`Command → PolicyEvaluator →
Allowed / Rejected → Execute`。

##### 3. 统一 Policy Evaluator

文件与命令策略必须由统一的 Policy 模块负责判断。

目标不是增加更多规则,而是避免「文件检查一套逻辑、命令检查一套逻辑」导致的规则语义漂移。

##### 4. 可选扩展

按实际需求增加 `timeout`、`maxChangedFiles`。

暂时只保留字段定义、不实现执行:`network`、`model`、`token budget`。

##### 5. Violation Mode

增加 `onViolation: fail | report`,默认 `fail`。

其中 `report` 用于兼容已有声明性策略。

##### 6. 规则处置层（severity）

在文件与命令之外增加第三类判定:规则实现产生 Finding,Policy 声明 `rule id → severity → action`。

默认映射为 `error → reject`、`warning → review`、`info → report`;Finding 自己声明是否可修复,只有
可修复的 Findings 才回 Coder 重试。

匹配逻辑不进入 Policy:条件与优先级仍属于实现(内置 checker 或 Preset 注册的规则)。severity 属于
安全语义,更高层只能收紧,不能放宽。

见 [ADR-004](../decisions/ADR-004-policy-severity-rules.md) 与 [治理流水线](../architecture/governance.md)。

##### 7. 实时拒绝的边界与超时

Provider 协议是「一次阶段 = 一次进程调用」,因此 Runtime 能实时拒绝的只有**它自己启动的进程**:
Provider 命令与验证命令的策略检查(`forbiddenCommands`)、以及受保护路径的前置拒绝。Agent 进程内部
的写入只能事后从快照差异中发现——这条边界必须写进文档,而不是留给读者猜。

同时把 `agentTimeoutMs` 接入命令执行,并提供取消管线,使 `timeout` 与 `cancelled` 成为真实可产生的
终止原因。

见 [Governance Runtime 架构](../architecture/runtime.md) 与 [ADR-006](../decisions/ADR-006-run-lifecycle.md)。

#### 验收标准

* 修改受保护目录会导致运行失败。
* 执行 forbidden command 前即被拒绝。
* 被拒绝的命令不会产生执行副作用。
* `onViolation: report` 保持只报告行为。
* 根仓库和 examples 在默认 `fail` 下全部通过。
* Policy 规则均有失败路径测试。
* 未知 rule id 报错,而不是静默忽略。
* 试图把 `warning` 降为 `info`、或把 `reject` 改为 `report` 的更高层配置被拒绝。
* 文件、命令、规则三类判定共用同一个 Policy Evaluator。
* `forbiddenCommands` 在 Provider 与验证命令执行前生效,被拒绝的命令不产生执行副作用。
* `agentTimeoutMs` 到期会终止该阶段,并记录终止原因为 `timeout`。
* 取消可以中断正在运行的 Provider 进程,并记录为 `cancelled`。

#### 版本影响

Policy 从声明变为强制执行属于行为增强。

如果已有项目显式声明相关字段，强制执行可能改变运行结果，因此必须：

* 在 CHANGELOG 中明确说明；
* 提供迁移说明；
* 明确 `report` 的兼容用途。

具体 SemVer 判定遵循 [发布与版本规则](../release.md)。

---

### M8：独立验证与证据链

#### 目标

把：

> **Agent 自己说成功 ≠ Harness 证明成功**

落实为正式的 Verification Evidence 契约。

#### 工作项

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
* **来源与信任等级**。

#### 证据信任等级

每条 Evidence 必须带来源,按可信度分三级:`harness-executed`(Harness 亲自执行)、
`analyzer-derived`(确定性分析器)、`agent-claimed`(Agent 自称)。只有前两级参与判定,
`agent-claimed` 只能作为线索进入上下文。

#### Evidence Provider 注册

Preset 可以通过 Extension Contract 注册确定性分析器,产出与内置 checker 相同的 Evidence 结构。
注册时机、可撤销与 provenance 属于 M21,见 [ADR-003](../decisions/ADR-003-preset-as-code.md)。

#### 语义检查由 Harness 调度

Preset 只能**声明**语义治理需求(`SemanticVerification`:提示词、触发条件、默认级别、所需 Evidence),
模型、凭证与网络由 Harness 调度,并复用既有 Provider role 与 stdin/stdout 协议——不新增独立的
`LLMProvider` 注册表。

触发为 `规则命中 OR 分数阈值`;被触发的多条检查按轮批量合成一次调用,调用次数由触发决定,不由检查
条数决定。`confidence` 与启发式分数不参与判定,只用于排序与路由人工。

预算耗尽:`warning` 记 `skipped`,`error` fail-closed;`--semantic=disabled` 必须写入 Run Record。

见 [ADR-005](../decisions/ADR-005-semantic-governance.md)。

#### 结构验证与检查种类

验证分四类:命令(退出码)、结构(解析产物上的约束)、启发式(可解释的分数)、语义(需要模型)。其中
**结构验证是新增能力**:分析器从改动后的源码中提取事实(例如 CSS 的 `animation-duration: 1s`),
规则只负责与声明的约束比较。分析器与规则解耦,可以由不同的包分别提供。

检查声明带 `kind`(`constraint` / `preference` / `instruction` / `verification`),kind 决定默认合并
语义与默认级别。术语纪律:用 AST 提取属性值属于结构验证,**不叫 semantic**——「语义」只指需要模型的
那一类。

见 [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)。

#### Reviewer 输入

Reviewer 不再只读取 Agent 的 `passed: true`,而必须消费 Acceptance Criteria + Verification
Evidence + Actual Changes。

Reviewer 的输出是**结构化 Findings**(rule、target、severity、reason、retryable),而不是一句批准;
`approved: boolean` 只作为兼容字段保留,最终判定仍由 Harness 给出。可修复的 Findings 回 Coder,
不可修复的终止;越界改动与受保护路径命中不参与 severity 映射,直接终止。

#### 一致性检查

如果 Agent 声称修改某文件、但实际 diff 中不存在(Agent claim ≠ Actual Change),必须明确列出,而不能静默忽略。

#### 范围判定独立成一步

把越界判定从 Reviewer 步骤里提出来,成为独立执行、独立报告的判定,而不是只体现在 `details` 文本里。
即使 Reviewer 批准,越界仍然一票否决。

见 [Governance Runtime 架构](../architecture/runtime.md)。

#### 验收标准

* 每个 required check 都存在对应 Evidence。
* Evidence 包含命令、Exit Code、耗时。
* 每条 Evidence 都带信任等级,`agent-claimed` 不参与判定。
* 成功但可疑的验证结果仍可通过 Evidence 被审查。
* 没有任何 Evidence 时 Reviewer 不得批准。
* dry-run 不产生 Evidence。
* Agent 自述不能作为独立 Verification Evidence。
* Reviewer 返回 Findings 而不是布尔值。
* Reviewer 与 Coder 的同源关系可声明、可审计。
* 语义检查的声明里不出现模型、端点或凭证;provider 由 `agents.json` 决定。
* 未触发的检查不产生调用;一轮内多条被触发的检查只产生一次调用。
* `Finding.evidence` 中不在本轮快照/diff 里的路径被丢弃。
* `confidence` 与启发式分数不改变判定结果,并有对应的失败路径测试。
* 语义审查被跳过或被显式禁用时,Run Record 明确记录。
* 越界判定与 Reviewer 的裁定在记录里是两项独立事实。
* 结构验证能对改动后的文件求值声明的约束,并给出 `analyzer-derived` 的 Finding。
* 分析器与规则分别来自不同包时仍能工作。
* 声明式约束超出表达力上限时给出明确错误,而不是静默通过。

#### 版本影响

新增 Evidence Schema 字段属于兼容性扩展，具体版本按照 [发布与版本规则](../release.md) 判定。

---

### M9：执行轨迹与审计记录

#### 目标

让一次运行能回答:发生了什么、什么时候发生、哪个阶段失败、哪个检查。

前置条件：M17。Run Record 需要写入本次生效的配置与 provenance，先于 M17 固定 schema 会导致
记录格式改两次。

当前缺口：

```text
.harness/runs/<run-id>/
├── input.json
├── policy.json
└── output.json
        ↓
有结果，但阶段时间线与证据不完整
```

#### 工作项

##### 1. Run Record 结构

统一记录结构，字段与 Schema 一起定义，而不是只有一个 `output.json`：

```text
.harness/runs/<run-id>/
├── input.json
├── policy.json
├── effective-config.json    生效配置快照（M17 之后）
├── stages/                  阶段记录
├── changes.json             实际变更
├── validation.json          验证证据
└── result.json              最终结果
```

结构定义见 [系统架构](../architecture/system.md)。

##### 2. 阶段时间线

阶段记录必须包含 `stage`、`status`、`startedAt`、`finishedAt`、`durationMs`。

阶段名必须稳定，不能靠解析自由文本得到。

##### 3. Run ID

稳定、可排序、唯一。同一任务重复执行不得覆盖历史记录。

##### 4. 证据留存

`ValidationEvidence` 需要保留命令、Exit Code、耗时与输出去向，见
[Verification 设计](../architecture/verification.md)。大输出截断时保留 digest，而不是丢弃。

##### 5. 脱敏

密钥、Token、环境变量值和不应外泄的绝对路径不得写入 Run Record。

##### 6. 保留策略

`.harness/runs/` 属于 Runtime State,不进入版本库;同时需要明确的清理策略,避免无限增长。

##### 7. CI 输出

`--json` 输出与 Run Record 保持一致，使 CI 可以直接消费而不再解析日志文本。

##### 8. 与 RunResult 分离

`RunResult` 是治理结论的快速读取面；`RunRecord` 是完整审计。两者不得混用一个 schema，也不得把
Agent 的完整对话写进 RunRecord——那属于 Provider 与 Agent 自己的日志，写进来会重复、会带来脱敏
负担，也会越过「不做会话式 Agent」的边界。

RunRecord 还必须携带三样今天没有的东西：终止原因（`termination`）、每条 Evidence 的**信任等级**、
以及 M17 之后每条生效值的 provenance。

见 [ADR-006](../decisions/ADR-006-run-lifecycle.md) 与 [Governance Runtime 架构](../architecture/runtime.md)。

#### 验收标准

* 每次 Run 都产生完整 Run Record，能回答开头的四个问题。
* 阶段记录包含开始、结束时间与状态。
* 失败可以定位到具体阶段、检查与命令。
* Run Record 中不出现明文密钥。
* 同一任务重复执行不覆盖历史记录。
* `.harness/runs/` 被 gitignore，且清理策略已文档化。
* RunRecord 能回答「循环为什么停下」（termination）与「这条结论凭什么可信」（信任等级）。
* `RunResult` 与 RunRecord 是两个独立读取面，字段不重复。
* RunRecord 不含 Agent 的完整对话。

#### 版本影响

新增记录字段属于兼容性扩展。若改变 `output.json` 既有字段的语义，按
[发布与版本规则](../release.md) 判定 MINOR 或 MAJOR。

---

### M10：审批门与人工介入

#### 目标

让「需要人的判断」成为显式的门禁，而不是口头约定。

当前只有 Agent 侧门禁（tester / reviewer 的批准判定），没有人工介入机制。

#### 工作项

##### 1. 审批策略

声明哪些情况必须人工审批:命中 `protectedPaths`、越权变更、验证缺失或跳过、高风险命令。

审批策略属于 Policy 的一部分，但不替代独立验证。

##### 2. 审批与证据的关系

即使 Evidence 缺失也不能靠人工批准通过:人工审批只能否决或确认,不能补足不存在的证据。

##### 3. 非交互模式

CI 中不能阻塞等待输入:无审批人时默认拒绝并明确报告。

默认行为必须是失败而不是挂起。

##### 4. 审批记录

Run Record 必须记录:谁批准、何时批准、批准了什么、依据哪些证据。

##### 5. 状态与退出码

增加「等待审批」对应的运行状态与稳定 Exit Code，见 [CLI 设计](../architecture/cli.md)。

##### 6. 恢复执行

审批通过后可以继续同一次运行，而不是从头重跑。

#### 验收标准

* 需要审批的运行不会自动通过。
* CI 中没有审批人时运行失败并说明原因，不挂起。
* 审批记录进入 Run Record。
* 审批不能绕过 `protectedPaths` 与 Scope 判定。
* 未配置审批策略的项目行为不变。

#### 版本影响

新增运行状态与 Exit Code 属于 MINOR；修改既有 Exit Code 语义属于 MAJOR。

---

## 第四阶段：治理发布与可移植

> 本阶段把 M7–M10 的治理能力与 M15–M17 的配置基础收敛为可发布的版本，并把 Provider 抽象从
> 「能换」提升到「可移植、可被第三方实现」。

---

### M12：发布 v1.2.0（声明式配置层）

#### 目标

把**已经完成**的配置层发布出去，而不是等治理能力做完再一起发：

```text
M15  Config Manifest
     +
M16  Preset Resolution
     ↓
v1.2.0
```

配置层先于 M7 落地是刻意的（见文件开头的「为什么配置层要先做」），因此 M12 的职责只剩「发布」。
版本里包含什么由[版本阶梯](#版本阶梯)定义，本节只列验收。

**已发布（1.2.0）。** 四个包版本已同步提升到 `1.2.0`，CHANGELOG 已从 `[Unreleased]` 定稿，
迁移说明见[迁移到 1.2.0](../migrating-to-1.2.0.md)。

#### 能力契约（用户可复现）

| 能力             | 复现方式                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| 生成治理目录     | `npx pedyc-harness init --preset vue` 写出 `.harness/harness.json` 与契约文件，**不复制** Preset 内容 |
| 无静态表的 Preset | `harness.json` 里写包名（短名按约定展开，含 `/` 原样）；`npx pedyc-harness list-presets` 列出 `declared` / `inherited` |
| 继承与解析       | `extends` 形成 DAG：去重、依赖在前、环检测给出完整环路                    |
| 配置来源可见     | `npx pedyc-harness doctor` 打印实际生效的配置来源（含回退到内置默认值）   |
| 既有项目不被打断 | 已有 `.harness/policy.json` / `agents.json` 的项目行为不变：项目文档优先于 Preset |

#### 验收标准

```bash
pnpm run harness:verify
pnpm run verify:examples
pnpm run release:check
pnpm run type-check
pnpm run test:unit
pnpm run build
```

* 上表每一条都能在一个**仓库之外**的临时项目里按顺序执行通过。
* tarball 安装后 CLI 可以正常运行。
* CHANGELOG 覆盖 `Breaking` 项，并写明**为什么按 MINOR 处理**（见
  [发布与版本规则](../release.md) §11 的「未消费 API」例外）。
* 迁移说明写明：从只有 `policy.json` 的项目迁移到 `harness.json` 的步骤，以及不迁移时的行为。

#### 发布门槛

遵循 [发布与版本规则](../release.md) 的发布前检查清单。

---

### M13：可移植的 Agent Provider Adapter

#### 目标

Provider 不只是「能换」，而是能被第三方实现并发布。

当前耦合见 [Provider 设计](../architecture/provider.md)：Adapter 对仓库路径存在硬编码、部分 Gate 名称
是固定约定、Provider 配置尚未完全抽象。

#### 工作项

##### 1. 收敛抽象

把目标抽象收敛为一条链:Provider Registry → Provider Config → Adapter Factory → AgentAdapter。
这些名字描述的是 M13 的目标形态,当前都不存在。

##### 2. 去掉隐式约定

* 移除对仓库内路径的硬编码。
* 移除固定 Gate 名称约定，或将其写入协议。

##### 3. 协议文档化

明确入参 JSON、stdout 输出契约、stderr 用途、Exit Code 语义,以及超时与取消。

##### 4. 至少两个独立 Adapter

用一个非 Claude 实现验证抽象确实中立，而不是只为一个 Adapter 量身定制。

##### 5. doctor 报告

`doctor` 输出 Provider 配置来源与兼容性检查结果。

##### 6. 协议与观察边界

批协议（一次阶段 = 一次进程调用）决定了观察能力：Harness 只能看到阶段级的快照、命令与退出码。
适配器**可以**上报进度事件，但必须是能力协商的可选行为——Harness 不得依赖它，缺失时行为完全一致。

若将来引入流式会话协议，那是破坏性变更（MAJOR），且需要独立论证：它会改变「换一个 Agent 不需要修改
Harness」的成本结构。

见 [Governance Runtime 架构](../architecture/runtime.md) 与 [ADR-006](../decisions/ADR-006-run-lifecycle.md)。

#### 验收标准

* 更换 Provider 不需要修改 Core。
* 新增 Adapter 不需要依赖仓库内路径。
* Provider 失败、超时、非法输出都产生结构化错误。
* Adapter 无法绕过 Policy、Diff 与 Independent Verification。
* Harness 在适配器不上报任何进度事件时行为完全一致。
* 协议文档明确写出「可观察粒度」与「不可拦截的部分」。
* 不以 Provider 数量作为完成标准，只以可替换性为准。

#### 版本影响

属于新增能力，通常是 MINOR；若改变既有 Provider 协议则按 MAJOR 处理。

---

### M14：发布 v1.3.0（治理执行）

#### 目标

把 M7 与 M8 作为一次发布交付：**声明出来的策略真的拦得住，验证结果真的可复核**。

```text
M7   Policy Enforcement（文件 / 命令 / 规则处置，超时与取消）
     +
M8   独立验证与证据链（结构化证据、信任等级、Findings、结构验证）
     ↓
v1.3.0
```

未完成的里程碑进入后续版本，不为了凑版本号而推迟发布——这条原则同样适用于 M12 与后续每个发布。
Provider 的可移植性（M13）不再绑在本版本上。

#### 能力契约（用户可复现）

| 能力               | 复现方式                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| 受保护路径真的被拦 | 改动命中 `protectedPaths` 的文件后运行：`run` 失败并指出该文件           |
| 禁止命令真的被拒   | 让 Provider 或验证命令命中 `forbiddenCommands`：拒绝发生在执行之前，且无副作用 |
| 声明变强制有退路   | `onViolation: report` 保持只报告行为                                     |
| 证据可复核         | 每轮 `iteration-<n>-verification.json` 含命令、退出码、耗时与输出摘要     |
| 判定结构化         | Reviewer 返回 Findings，按 `severity → action` 处置；越界一票否决         |

#### 验收标准

```bash
pnpm run harness:verify
pnpm run verify:examples
pnpm run release:check
pnpm run type-check
pnpm run test:unit
pnpm run build
```

* 上表每一条都能在一个**仓库之外**的临时项目里复现。
* M7 与 M8 各自的验收标准全部满足。
* 版本号取值遵循「四个包中最高的语义级别」。

#### 版本影响

`protectedPaths` / `forbiddenCommands` 从「声明但不管用」变成「真的拦」，按
[发布与版本规则](../release.md) §11 属于「CLI 行为导致旧用法失效」。**要判 MINOR，必须提供
`onViolation: report` 作为兼容退路并在 CHANGELOG 中写明；否则本次发布应为 MAJOR。**

---

## 第五阶段：声明式治理配置

> 本阶段编号排在最后，但 **M15–M16 的执行顺序排在第二阶段之前**。M17 依赖 M7 的字段定义，
> 因此仍留在第二阶段之后；M18–M20 需要前序治理能力落地，留在最后。
>
> 核心问题不是「Agent 能做更多事情」，而是：
>
> **治理策略能否被声明、继承和共享。**
>
> 能力由 npm 安装，治理模型由 `.harness/` 声明，Preset 提供可复用的默认能力。

---

### M15：配置基础与 Runtime 模块边界（Config Foundation）

#### 目标

让项目治理有一个明确的声明入口，而不是把配置散落在多个隐式位置；同时把 Core 的模块边界
一次收敛到位，避免 M7、M9 之后再改结构。

**已交付。** 落地前这里记着三处缺口：没有 `harness.json`、项目配置来源由 CLI 硬编码；没有 schema，
非法配置只能在运行中途失败；`contracts/` 与 `core/` 平铺，配置读取、策略判定与执行混在同一层。
三者都已在下方工作项中解决，契约见 [Core 契约](../interfaces/core.md)。

#### 工作项

##### 1. Manifest

定义 `.harness/harness.json` 与 `harness.schema.json`：

```json
{
  "$schema": "https://pedyc.dev/schema/harness.json",
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"]
}
```

##### 2. Config Loader

负责 `定位 .harness/ → 读取 Manifest → 解析相对路径 → Schema 校验 → Config Sources`。

配置错误必须在执行前失败，并返回结构化错误。

##### 3. 兼容既有项目

没有 `harness.json` 的项目必须保持现有行为：继续读取 `policy.json` 与 `agents.json`。
迁移是增量的，不是破坏性的。

##### 4. CLI 接入

* `init` 生成 `harness.json`。
* `doctor` 报告实际生效的配置来源。
* `verify` 校验 Manifest 合法性。

##### 5. Runtime 模块边界

配置入口一旦确定，Core 的内部结构必须同步收敛，否则加载逻辑会散落在 CLI 与 Runtime 中：

```text
packages/core/src/
├── contracts/    领域模型与 Schema 边界
├── config/       配置加载、校验、合成
└── runtime/      执行、策略判定、验证、变更检查
```

要求：

* 配置读取只发生在 `config/`，Runtime 不接受零散的文件路径参数。
* `contracts/` 保持无副作用，不依赖 Node 文件系统。
* 模块依赖单向，不出现 `runtime → cli` 或 `config → runtime` 的回指。
* 当前 `core/` 下的模块按职责迁移，不为了目录整齐而重写实现。

#### 验收标准

* 缺失或非法的 `harness.json` 返回结构化配置错误，退出码符合 [CLI 设计](../architecture/cli.md)。
* 只有 `harness.json` 的最小项目可以完成 `verify` 与 `run --dry-run`。
* 没有 `harness.json` 的既有项目行为不变。
* 配置错误信息指出具体文件与字段。
* 配置读取集中在 `config/`，CLI 不再自行解析配置路径。
* Core 模块依赖单向，无循环引用。

#### 版本影响

新增配置入口属于兼容性扩展。是否提升 MINOR 按 [发布与版本规则](../release.md) 判定。

---

### M16：Preset System

#### 目标

让 Preset 以 npm package 分发,并支持 Preset 之间的继承,即 `Preset = npm package + preset.json`。

**已交付。** 下面的工作项即交付范围；`preset.json` 的字段与解析语义见
[Preset 契约](../interfaces/preset.md)。

#### 工作项

##### 1. `preset.json`

定义 Preset Manifest 与 `preset.schema.json`，字段见
[Preset 设计](../architecture/preset.md)。

##### 2. Preset Resolver

实现 `递归加载 → 去重 → 循环检测 → 拓扑排序`。

循环依赖必须报错并给出完整环路，不能出现调用栈溢出。

##### 3. `init --preset`

语义收窄为两个动作:写入 `.harness/harness.json` + 安装 npm package。

不再把 Preset 内容复制进目标项目。

##### 4. `list-presets`

列出已安装 Preset 及其继承关系，而不只是 CLI 内置表。

#### 验收标准

* 循环依赖返回明确错误，信息包含完整环路。
* 同一 Preset 在一条解析链中只加载一次。
* 官方 generic、Vue Preset 以 npm 包形式被解析，不再依赖 CLI 硬编码表。
* 未安装的 Preset 给出可操作的错误提示，而不是静默回退。
* `init --preset` 重复执行不产生重复依赖或重复声明。

---

### M17：Effective Policy

#### 目标

把多个来源合成为 Runtime 的唯一输入：

```text
Preset
  +
Organization Preset
  +
Project Config
  +
Task Config
        ↓
   Config Resolver
        ↓
EffectiveHarnessConfig
        ↓
   Harness Runtime
```

前置条件：M7、M16。字段级合并语义必须基于 M7 实际实现的策略字段（`protectedPaths`、
`forbiddenCommands`、`onViolation` 等）定义；过早定稿会写出运行时不存在的字段。

因此本里程碑虽然属于配置层，但**不随 M15–M16 一起提前**。

#### 工作项

##### 1. Merge Strategy

按字段实现合并语义:`replace`、`merge`、`append`、`deny-wins`、`immutable`。

规则类字段的合并语义由 `kind` 决定(`constraint` → deny-wins、`preference` / `instruction` → append、
`verification` → union),不由字段名决定,见 [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)。

字段表见 [Policy 设计](../architecture/policy.md) 与 [Preset 设计](../architecture/preset.md)。
实现必须收敛在单一模块，避免规则语义漂移。

##### 2. Provenance

记录每个生效值的来源，并随 Run Record 保存。

##### 3. Runtime 收敛

Runtime 不再直接读取分散的配置文件，只消费 `EffectiveHarnessConfig`。

##### 4. `explain`

提供命令查看合并结果与来源，用于回答「这条规则是谁声明的」。

##### 5. 治理编译产物

Resolver 输出 `EffectiveGovernance`：policy、rules（带 kind 与 severity）、verification、instructions、
provenance 与 **`conflicts`**。

冲突按 `安全语义优先 → 同 kind 按配置层级 → 仍未定则记录并取更严格者` 判定；第三步**必须记录**，
否则审计无法回答「为什么 300ms 赢了 400ms」。

见 [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md) 与
[Preset 设计](../architecture/preset.md) §11。

#### 验收标准

* Runtime 不再从多个来源分别读取 Policy。
* 每个生效值都能追溯到来源。
* `protectedPaths` 只能追加，项目配置无法移除上层声明的项。
* M7 的 Policy Evaluator 消费 `EffectivePolicy`，文件与命令判定共用同一份规则。
* 每条合并语义都有对应的失败路径测试。
* 多个 Preset 的 rules 与 verification 同时生效：constraint 取交集，verification 取并集。
* 两份 Preset 对同一属性给出不同约束时，`conflicts` 记录最终取值与理由。

---

### M18：团队与组织 Preset

#### 目标

让组织级治理通过 npm 包共享,而不是靠复制配置文件——`@acme/harness-preset` 让开发者、CI 与 Agent
使用同一套 Governance。

#### 工作项

* Preset 发布指南：`preset.json`、`peerDependencies`、`files` 白名单。
* 私有 registry 与 GitHub Package Registry 的接入验证。
* 项目层与任务层的覆盖规则说明。
* 个人层 Preset 的本地位置约定。

#### 验收标准

* 同一公司 Preset 被多个项目引用时产生一致的 Effective Policy。
* 本地开发与 CI 使用同一份 Effective Policy。
* 个人 Preset 不能放宽组织或项目的安全约束。
* 文档说明如何在不修改 Core 的前提下发布新的 Preset。

---

### M19：策略安全模型

#### 目标

正式定义不可覆盖的安全约束，让「只能收紧、不能放宽」成为可执行规则。

#### 工作项

* 把合并语义表落成代码与测试。
* 把规则种类（`kind`）与默认合并语义、默认级别的对应关系落成代码与测试，见
  [ADR-007](../decisions/ADR-007-rule-kinds-and-constraints.md)。
* 提供表达 `immutable` / `deny-wins` 的配置形式。
* 冲突诊断：说明哪一层试图放宽哪条约束。
* 迁移说明与 CHANGELOG 条目。

#### 验收标准

* 试图放宽安全约束的配置被拒绝，并给出原因与来源。
* 每条安全规则都有失败路径测试。
* 拒绝行为不依赖 Agent 自述，只依据配置与观察结果。

---

### M20：Preset 生态能力

#### 目标

复用 npm 生态提供最小的生态命令，而不是自建 Preset 商店。

#### 工作项

提供 `harness search preset`、`harness install preset`、`harness publish preset`;它们都是对 npm
能力的薄封装,或直接复用 `npm` CLI。

#### 验收标准

* 不引入 Harness 自建的托管服务、账号体系或版本管理器。
* 命令不改变 npm 的认证与权限模型。
* 未实现这些命令时，手动 `npm install` 仍能完整工作。

#### 设计约束

> 只有当 npm 生态无法满足需求时，才重新论证是否需要自有 Registry。

---

### M21：Preset 代码扩展契约

#### 目标

让复杂 Preset 可以携带实现，而不只是声明：确定性分析器、审查定义与生成逻辑都能随 npm 包复用，
同时 Core 仍然不感知具体技术栈，治理链仍然可审计。

决策与替代方案见 [ADR-003](../decisions/ADR-003-preset-as-code.md)。

#### 工作项

* **入口加载**：清单 `entry` 指向的模块在 `VALIDATED` 之后加载，加载失败不得进入 `ACTIVE`
  （当前 `entry` 只被解析器校验路径，没有任何运行时加载它）。
* **注册面**：治理默认值与规则声明、验证定义、Evidence Provider、审查定义、项目模板——封闭枚举，
  注册面之外没有入口。
* **注册身份**：每项注册带稳定 id 与 provenance（`package@version` + 扩展点 + id）；冲突在
  `VALIDATE` 阶段报错，不允许后注册者静默覆盖前者。
* **能力边界**：受限上下文，不提供文件系统与网络；不能调用 Provider、不能决定 Gate 结果、不能写
  Run Record。
* **顺序无关**：注册结果不得依赖注册顺序。
* **能力清单**：Preset 可声明 `capabilities`（`filesystem` / `shell` / `network` / `semanticReview`）；
  语义是**请求**，deny-by-default，由 Harness 在注册期授予并校验，声明本身不产生任何权限。
* **发布规则**：`release:check` 从"预设包不含代码"改为"预设包可以携带入口代码，但不得携带第二份
  治理定义"。
* **兼容声明**：Preset 用 `peerDependencies` 声明兼容的 `pedyc-harness` 范围（两个官方 Preset
  目前尚未声明）。

#### 验收标准

* 一个只含数据的 Preset 与今天的行为完全一致。
* 入口加载失败、注册 id 冲突、路径越界，都在任何 Preset 代码执行之前被拒绝。
* Preset 注册的 Evidence Provider 与内置 checker 产出同一种 Evidence。
* 任何注册项都能从 Run Record 追溯到来源包与版本。
* 未声明的能力一律不可用：一个未声明 `network` 的 Preset 无法发起网络调用。
* 至少有一个官方 Preset 用代码扩展实现一条规则，作为端到端样例。
