# 迁移、重构与发布里程碑

本文件是 [项目目标](./项目目标.md) 的进度记录：把「从 Vue 示例迁移到通用 Harness」的路线
图与阶段性验收标准合并在一起。原文的迁移阶段和里程碑描述高度重叠，现已收敛为本文件，
每个里程碑都必须满足明确的交付物和验证标准后，才能进入下一阶段。

## 里程碑总览

### 第一阶段：通用化与发布

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M0 | 固定当前 Vue Harness 基线 | 已完成 |
| M1 | 建立通用 CLI 和项目初始化能力 | 已完成 |
| M2 | 完成 pnpm workspace 与 Core/CLI 初步拆包 | 已完成 |
| M3 | 将完整 Runtime 迁入 Core | 已完成 |
| M4 | 完善 Preset 和项目生成模板 | 已完成 |
| M5 | 建立外部项目样例和兼容性验证 | 已完成 |
| M6 | 完成 npm 发布准备和 v1.0 发布 | 已完成 |

### 第二阶段：治理能力

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M7 | 让策略真正可执行（Policy Engine） | 计划中 |
| M8 | 独立验证与证据链 | 计划中 |
| M9 | 执行轨迹与审计记录 | 计划中 |
| M10 | 审批门与人工介入 | 计划中 |
| M11 | 发布 v1.1.0 | 计划中 |

### 第三阶段：可移植与发布

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M12 | 让 Agent Provider Adapter 可移植到外部项目 | 计划中 |
| M13 | 发布 v1.2.0 | 计划中 |

第二阶段的选取依据来自一次定位复核。v1.0 解决了「能不能装上、能不能跑」，但没有解决
「Agent 到底被允许做什么、做完了凭什么算数」。对照 [项目目标](./项目目标.md) 第三节的
能力优先级核查后发现：五个 ⭐⭐⭐⭐⭐ 方向里，Policy Engine、Diff/Scope Enforcement 和
Independent Verification 只是部分实现，Approval Gate 完全未实现，而 ⭐⭐⭐ 的 Agent
Adapter 反而是文档里规划得最细的一项。

因此第二阶段改为以治理能力为主线，Adapter 可移植性后移到第三阶段。需要注意，M7 让策略
强制生效会改变既有项目的运行时行为——此前 `forbiddenCommands` 和 `protectedPaths` 只是
声明性字段——这一点必须在 M11 的 CHANGELOG 和迁移说明中显式标注。

## M0：固定 Vue Harness 基线

### 目标

保留当前 Vue 3 + TypeScript 项目作为第一个集成宿主，确保重构期间已有 Harness
能力不回退。

### 已交付

- Planner → Coder → Tester → Reviewer 执行闭环。
- JSON Schema、Policy、Provider 和运行记录。
- Vue 项目的类型检查、单元测试和生产构建门禁。
- Claude CLI Adapter 和受保护目录策略。

### 验收标准

```bash
pnpm run harness:verify
pnpm run type-check
pnpm run test:unit
pnpm run build
```

## M1：通用 CLI 和项目初始化

### 目标

让其他项目可以通过 npm 包或 `npx` 初始化 Harness，而不依赖当前 Vue 项目的目录结构。

### 已交付

- 运行器不再把自身目录作为唯一 root，支持 `--root`。
- `package.json` 暴露 `pedyc-harness` bin 入口。
- `pedyc-harness init --preset generic|vue`。
- `verify`、`run` 和 `doctor` 命令。
- `init` 默认幂等，`--force` 才覆盖模板文件。
- 根据锁文件选择 npm、pnpm 或 yarn 执行验证命令。
- generic 与 Vue 的差异放入 Preset 初始化模板。

### 验收标准

- generic 和 Vue Preset 都能初始化。
- 重复执行不会覆盖用户配置。
- `--force` 能明确重新生成模板。
- dry-run 返回结构化 `passed` 结果。

## M2：pnpm Workspace 与 Core/CLI 初步拆包

### 目标

建立未来 Monorepo 的包边界，但暂时不破坏根目录 Vue 示例的开发和验证流程。

### 已交付

```text
packages/
├── core/   @pedyc/harness-core
└── cli/    pedyc-harness
```

- 根目录启用 `pnpm-workspace.yaml`。
- Core 提供包管理器检测和验证命令原语。
- `scripts/harness/package-manager.mjs` 通过 workspace 导出复用 Core，确保现有 Harness
  流程与新包使用相同实现。
- CLI 提供独立的发布入口，并暂时兼容根目录旧 CLI。
- 根目录集成测试继续作为迁移安全网。

### 验收标准

- `pnpm install --frozen-lockfile` 成功。
- Core 包可以执行 `pnpm pack --dry-run`。
- `pnpm exec pedyc-harness doctor` 成功。
- 根目录全部 Harness、类型、测试和构建门禁通过。

## M3：完整 Runtime 迁入 Core（已完成）

### 目标

将当前 `scripts/harness/run.mjs` 中与技术栈无关的逻辑迁入
`@pedyc/harness-core`，CLI 只负责参数解析和命令调度。

### 工作项

- 已抽取任务 Intake、包管理器、命令执行和文件快照模块。
- 根目录运行器已复用 Core 的上述模块。
- 已抽取 Schema 加载/校验、Agent 响应解析和阶段响应校验模块。
- 已抽取 Policy 校验和 Provider 调度模块。
- 已抽取 Planner/Coder/Tester/Reviewer 运行编排模块。
- 已抽取验证命令执行、超时和结构化结果模块。
- 为 Core API 增加 Node 单元测试。
- 保留旧 CLI 参数和 `.harness/` 文件格式兼容。

### 验收标准

- CLI 不再复制 Runtime 核心逻辑。
- `packages/core` 可以在没有 Vue 依赖的项目中安装和运行。
- 现有 Vue 项目的四阶段 dry-run 结果与迁移前一致。
- Core 测试覆盖输入失败、Provider 失败、越权变更和命令失败场景。

## M4：Preset 和项目生成模板（已完成）

### 目标

让技术栈差异只存在于 Preset，而不进入 Core 或 CLI 的编排逻辑。

### 工作项

- 已将 generic Preset 和 Vue Preset 抽取为独立 workspace 包。
- 已建立 CLI Preset Registry，CLI 不再硬编码技术栈规则。
- 统一 Preset 接口：检测、默认路径、验证命令、Instructions 和 Skills。
- 增加 `diff` 命令，报告受管模板文件状态。
- 增加 `update` 命令，默认保留用户对配置的修改。
- 支持 `update --force` 显式覆盖受管模板。
- generic 和 Vue Preset 均有独立初始化与 Registry 测试。

### 验收标准

- 新增 Preset 不需要修改 Core。
- `init`、`diff`、`update` 可重复执行。
- 模板更新不会静默覆盖用户配置。
- 至少 generic 和 Vue 两个 Preset 有独立测试。

## M5：外部项目样例和兼容性验证（已完成）

### 目标

用真实的最小项目证明 Harness 不依赖 Vue 目录和命令。

### 已交付

```text
examples/
├── README.md
├── generic-project/   （generic Preset，pnpm-lock.yaml）
├── vue-project/       （vue Preset，yarn.lock）
└── node-project/      （generic Preset，package-lock.json）
```

- 每个样例提交了 `init` 生成的 `.harness/` 配置、`AGENTS.md` 和合法的 `.harness/task.json`。
- `pnpm run verify:examples`（`scripts/harness/verify-examples.mjs`）对每个样例依次执行
  `init`、`verify`、`doctor` 和 `run --dry-run --json`，检查退出码、结构化输出、锁文件识别
  和 dry-run 不修改产品文件。
- 样例覆盖 pnpm、yarn、npm 三种锁文件，`doctor` 分别报告检测结果。
- 测试覆盖无效配置、缺失 Provider、缺失验证脚本的结构化失败，以及一个非 Vue 项目通过外部
  Provider 完成完整四阶段运行的用例。
- 为使 dry-run 成为真正的安全预览，Core 的 dry-run 现在不调用任何 Agent Provider、不执行
  验证命令，只返回结构化的 `passed` 结果（见「兼容性原则」）。

### 验收标准

每个样例至少通过：

```bash
pnpm exec pedyc-harness init
pnpm exec pedyc-harness verify
pnpm exec pedyc-harness run --dry-run --json
```

同时验证：

- pnpm、npm、yarn 锁文件识别。
- Windows 和 Linux 命令入口。
- Node.js 20 及以上版本。
- 缺失 Provider、缺失脚本和无效配置的错误输出。

### 验收证据

```bash
pnpm run verify:examples
pnpm run test:unit
```

`verify:examples` 在三个样例上共 33 项检查全部通过，每个样例管理 7 个模板文件；`test:unit`
覆盖 dry-run 不调用 Provider、锁文件识别和上述错误路径。

## M6：npm 发布准备与 v1.0

### 目标

将 Core、CLI 和 Preset 作为可审查、可安装、可升级的 npm 包发布。

### 已交付

- 四个可发布包（`@pedyc/harness-core`、`pedyc-harness`、`@pedyc/harness-preset-generic`、
  `@pedyc/harness-preset-vue`）补齐 `description`、`license`、`repository`、`homepage`、
  `bugs`、`keywords`、`engines` 和 `publishConfig`，并各自携带 `LICENSE` 与 `README.md`。
- `files` 白名单只发布 `src`、`templates` 和 `README.md`，测试、样例和运行记录不进 tarball。
- CLI 运行时迁入 `packages/cli/src/`，Schema 与 `task.example.json` 随包发布；根目录
  `scripts/harness/cli.mjs` 和 `run.mjs` 变成指向发布包的薄封装。
- 项目专属校验迁移为 `.harness/verify.mjs` 钩子：CLI 先做通用校验，再执行项目自定义检查。
- `pnpm run release:check`：打包全部包、解包检查文件与 `workspace:` 残留，并在系统临时目录的
  消费者项目中用 tarball 执行 `init --preset generic|vue`、`verify`、`doctor`、
  `run --dry-run --json`。
- [CHANGELOG.md](../CHANGELOG.md) 与 [发布与版本规则](./release.md)：SemVer 判定、同步版本
  策略、发布步骤、Provider 安全边界和兼容性策略。
- `tests/harness/release.spec.ts` 固定模板同步、包元数据一致性、CLI 自包含、薄封装和
  Preset 无 Provider 约定。

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

- 所有 workspace 包均可独立打包。
- 从 tarball 安装后 CLI 可以运行。
- 所有样例项目通过验证。
- CI 使用 frozen lockfile。
- 没有未解决的高风险安全问题。

### 验收证据

`release:check` 在临时消费者项目中运行 6 个 CLI 步骤和 1 项输出契约校验，全部通过；
`test:unit` 覆盖上述发布约束。四个包均为 `1.0.0`，同步发布。

### 遗留说明

v1.0 的「发布」指仓库具备可发布状态并完成本地打包验证。实际推送到 npm registry 需要维护者
凭据，按 [发布与版本规则](./release.md) 中的步骤执行。

## M7：策略可执行（Policy Engine）

### 目标

让 `policy.json` 中已经声明的字段真正生效。当前 `forbiddenCommands` 没有任何代码读取，
`protectedPaths` 只被 `validatePolicy` 校验「是一个数组」，从不参与拦截。策略目前是文档，
不是约束；项目即使明确写了「不得修改 `infra/`」，Harness 也不会因此拒绝任何改动。

### 现状问题

已在 v1.0 代码中核查确认：

- `packages/core/src/policy.mjs` 的 `validatePolicy` 仅检查 `protectedPaths` 是数组。
- `findOutOfScopeChanges` 只使用 `allowedProductPaths`，`protectedPaths` 从不参与。
- `isCommandAllowed` 只检查 `allowedAgentCommands`，`forbiddenCommands` 没有调用方。
- 因此越界拦截完全依赖 `allowedProductPaths: ["src/"]` 的文件改动检查，且不覆盖命令层。

### 工作项

- `protectedPaths` 接入文件改动检查，与 `allowedProductPaths` 共用一套判定：命中即失败。
- `forbiddenCommands` 接入命令执行层：Provider 命令和验证命令在执行前匹配，命中即拒绝。
- 把越界判定收敛为单一策略模块，使文件与命令两条路径由同一组测试覆盖。
- 策略维度按需扩展：`commands`、`timeout`、`maxChangedFiles`。网络、模型、token 预算
  只保留字段定义，不实现执行。
- 增加 `onViolation: fail | report`，默认 `fail`；`report` 保持 v1.0 的只报告行为。
- 为每条规则补「命中即拒绝」的失败路径测试，并确认拒绝时不产生副作用。

### 验收标准

- 修改 `.harness/`、`.github/` 等受保护目录下的文件会导致运行失败，输出指出命中的规则。
- 执行 `forbiddenCommands` 中的命令会被拒绝，且命令没有真正执行。
- `onViolation: report` 下的行为与 v1.0 一致。
- 根仓库与 `examples/` 在默认 `fail` 策略下全部通过。

### 版本影响

这些字段此前是声明性的，强制生效会改变既有项目的运行时行为。按
[发布与版本规则](./release.md) 判为 MINOR，但必须在 CHANGELOG 中单独说明：若项目策略中
已经声明了这些字段，强制生效正是其原本意图；未声明的项目行为不变。

## M8：独立验证与证据链

### 目标

把「不信任 Agent 的自我描述」这条原则变成输出契约。当前 Tester 确实独立执行门禁、不采信
Coder 自述，但结果只到退出码一级：成功时统一写 "Command completed successfully."，
Reviewer 无法据此判定，外部审计也无从复核。

### 工作项

- 定义证据结构并写入 `output.json` 与 `output.schema.json`：
  `{ name, command, packageManager, exitCode, durationMs, stdoutDigest, stderrDigest, skipped }`。
- 留存每条门禁的 stdout/stderr 摘要，**包括成功的情况**，而不只是失败时。
- Reviewer 的输入改为「证据 + 验收标准」，阶段响应中必须引用具体证据条目。
- 区分「未执行」与「执行通过」，禁止用 `passed: true` 掩盖没有真正运行的门禁。
- 一致性检查：Coder 声明修改、但 diff 中并不存在的文件单独列出。

### 验收标准

- `output.json` 中每条 `requiredChecks` 都有对应证据条目，含命令、退出码和耗时。
- 成功但输出可疑（例如测试用例数为 0）的情况能从证据中看出来。
- 没有任何证据时 Reviewer 不得返回 `approved: true`。
- dry-run 仍然不产生任何证据条目，与现有 dry-run 契约一致。

### 版本影响

`output.schema.json` 新增字段，属于 MINOR。现有消费者需要读取新增字段才能获得完整信息。

## M9：执行轨迹与审计记录

### 目标

让一次运行的过程可见、可诊断、可复核。当前 `run` 只输出最终 JSON，中途发生了什么、
哪条门禁慢、Agent 到底执行了什么命令，都无从得知。

### 工作项

- Core 编排器增加事件回调，发出结构化事件：`run:start`、`phase:start`、`phase:end`
  （含 `durationMs`、`status`）、`gate:start`、`gate:end`（含 `command`、`exitCode`、
  `durationMs`、输出摘要）、`run:end`。
- CLI 默认把事件渲染到 stderr；stdout 始终只承载最终 JSON，保证 `--json` 输出可被管道解析。
  增加 `--quiet` 静默事件。
- 事件流持久化到 `.harness/runs/<id>/events.json`。
- `output.schema.json` 的阶段对象增加可选 `durationMs`，运行结果增加可选 `totalDurationMs`。
- 运行记录管理：`pedyc-harness runs list`、`pedyc-harness runs show <id>`，以及保留策略
  （默认保留最近 N 次运行，避免 `.harness/runs/` 无限增长）。

### 验收标准

- 一次非 dry-run 运行产生有序事件流，每个阶段和每条门禁都有耗时。
- `--json` 模式下 stdout 仍可直接 `JSON.parse`，事件全部走 stderr。
- 失败门禁的输出摘要出现在事件流和 `events.json` 中。
- dry-run 不产生任何门禁事件，行为与现有 dry-run 契约一致。
- 保留策略有测试覆盖，旧运行记录按策略清理。

### 版本影响

`output.schema.json` 新增可选字段，属于 MINOR。现有消费者不受影响。

## M10：审批门与人工介入

### 目标

为高风险任务提供可选的人工节点。这是五个核心方向中唯一完全未实现的一项，也是「Agent 越强
越需要」的典型能力：当一次任务会触及受保护区域或改动大量文件时，自动批准不再合适。

### 工作项

- `policy.json` 增加 `approval`：`{ required, on, timeoutMs }`，`on` 取值例如
  `before-coder`、`after-tester`。
- 触发时暂停运行，落盘待审批状态，并打印可复核的上下文：任务、允许范围、即将执行的命令、
  当前 diff。
- `pedyc-harness approve <run-id>` 与 `pedyc-harness reject <run-id>` 恢复或终止运行。
- 非交互环境（CI、无 TTY）默认拒绝，而不是静默通过或无限等待。
- `output.schema.json` 增加 `pendingApproval` 状态。

### 验收标准

- `approval.required: true` 时运行在指定节点暂停并落盘，退出码可被 CI 识别为「待处理」。
- `reject` 后运行以失败结束，且不再产生任何文件改动。
- 无 TTY 环境下不会自动批准。
- 未配置 `approval` 时行为与 v1.0 完全一致。

### 版本影响

纯新增可选配置，属于 MINOR。

## M11：发布 v1.1.0

### 目标

把 M7–M10 的治理能力按 [发布与版本规则](./release.md) 发布。这一版的主题是「策略从声明
变为可执行」，迁移说明比新增功能本身更重要。

### 工作项

- 四个包版本号同步提升到 `1.1.0`。
- 更新 `CHANGELOG.md`：Policy 强制执行的行为变更、`evidence` 字段、`runs` 命令、
  `approval` 配置，以及 `output.schema.json` 的字段变化。
- 更新 `docs/architecture.md`（策略与证据的位置）、`docs/cli.md`（`runs`、`approve`、
  `reject` 与事件输出）、`docs/项目目标.md` 第三节的现状列。
- 从 registry 安装 `1.1.0` 并在干净项目中验证。

### 发布门槛

- `pnpm run harness:verify`、`verify:examples`、`release:check`、`type-check`、`test:unit`、
  `build` 全部通过。
- `release:publish --dry-run` 预检通过。
- 从 registry 安装后 `verify`、`doctor`、`run --dry-run --json` 可用。

## M12：Agent Provider Adapter 可移植

### 目标

让外部项目（非 Vue、非 npm、非本仓库目录）通过生成而非改写源码的方式接入真实 Agent CLI。
Adapter 是 Harness 与 Agent 之间的唯一边界，它一旦不可移植，整套系统对外的可用性就止步于
「能装上 CLI，但接不上自己的 Agent」。

### 现状问题

已在 v1.0 代码中确认的四处硬编码：

- `scripts/harness/claude-adapter.mjs` 用 `resolve(import.meta.dirname, '../..')` 推导项目根，
  只在本仓库的目录结构下成立。
- 系统提示写死 `You are the ${phase} agent in a Vue 3 + TypeScript repository harness.`，
  Vue 之外的 Preset 会被误导。
- `--allowed-tools` 写死 `Bash(npm run type-check)`、`Bash(npm run test:unit)`、
  `Bash(npm run build)`。pnpm、yarn 项目，以及门禁名称不同的项目全部失效。
- 阶段响应格式在 Adapter 提示词和 Core 的 `validateStageResponse` 中各写一份，会随时间漂移。

### 工作项

- 新增 `pedyc-harness adapter:scaffold <claude|custom>`，把 Adapter 生成到目标项目的
  `scripts/harness/`，内容由 `policy.json` 的 `requiredChecks` 和锁文件探测出的包管理器填充。
- Adapter 用 `process.cwd()` 定位项目根。Provider 的 cwd 已经由 Core 的
  `runCommand(root, ...)` 固定为目标项目根，不需要再从自身路径推导。
- 技术栈措辞取自 Preset 的 instruction 或项目 `AGENTS.md`，不再硬编码。
- Core 导出阶段响应要求的机器可读描述，Adapter 据此生成提示词，消除双份定义。
- 提供 Provider 一致性校验：给定标准请求，检查任意 Adapter 的响应满足
  `agent-response.schema.json` 与阶段专用字段。
- 仓库自身的 Adapter 改为该命令的产物，不再手工维护两份。

### 验收标准

- 在 `examples/node-project`（npm）和 `examples/vue-project`（yarn）中 scaffold 出的 Adapter，
  不修改任何源码即可产出合法响应。
- 自定义门禁名（例如 `lint`、`e2e`）被正确写入 allowed-tools，而不是永远写
  type-check / test:unit / build。
- 把项目整体复制到其他路径后 Adapter 仍能工作。
- 仓库代码中不再存在指向本仓库目录结构的 Adapter 路径假设。

### 版本影响

纯新增，无破坏性变更；`adapter:scaffold` 为新命令，属于 MINOR。

### 范围说明

本里程碑只解决「技术栈措辞从配置来」。完整的提示词分层（把 core instructions 显式注入
每次请求）不在本阶段范围内，见文末「本阶段未纳入」。

## M13：发布 v1.2.0

### 目标

把 M12 的 Adapter 成果按 [发布与版本规则](./release.md) 发布。

### 工作项

- 四个包版本号同步提升到 `1.2.0`。
- 更新 `CHANGELOG.md`：新增 `adapter:scaffold` 命令与 Provider 一致性校验。
- 更新 `docs/provider-design.md`（Adapter 生成与一致性校验）。
- 从 registry 安装 `1.2.0` 并在干净项目中验证。

### 发布门槛

- `pnpm run harness:verify`、`verify:examples`、`release:check`、`type-check`、`test:unit`、
  `build` 全部通过。
- `release:publish --dry-run` 预检通过。
- 在 `examples/node-project`（npm）和 `examples/vue-project`（yarn）中 scaffold 出的 Adapter
  可产出合法响应。
- 从 registry 安装后 `verify`、`doctor`、`run --dry-run --json` 可用。

## 本阶段未纳入

以下两项来自 v1.0 的缺口盘点，尚未排期。记录在此以免遗失：

- **真实 LLM 闭环验证**（README 待办中唯一未勾选的一条）。目前只有离线 Adapter 跑通过完整的
  四阶段流程，真实 Claude Code 闭环从未验证成功。它需要可用的 CLI 凭据和配额，且会真实修改
  产品文件，适合作为独立里程碑。
- **完整提示词分层**。`docs/architecture.md` 描述的「core + preset + AGENTS.md + task」四段
  拼接目前在代码中不存在：`AGENTS.md` 由 `init` 生成，但请求里不含它，实际依赖 Agent CLI 自己
  按工作目录读取。M12 只解决措辞来源，不解决注入。

策略执行缺口（`forbiddenCommands` 无代码读取、`protectedPaths` 只校验不拦截）已从
「未排期」提升为 M7 的主体内容，不再列在本节。

此外，[项目目标](./项目目标.md) 第四节列出的方向属于**明确不做**，区别于本节「尚未排期」
的两项：前者是定位决定的，后者是优先级决定的。

## 兼容性原则

迁移过程中必须保持以下契约不变：

- 保留 `.harness` 的 JSON Schema 和结构化输出契约。
- 保留 Provider 的 stdin/stdout JSON 协议。
- 保留 `requiredChecks`、`protectedPaths` 和 `allowedProductPaths` 的显式策略。
- 任何默认行为变化都必须通过 Preset 或版本升级明确表达。

### dry-run 契约

`run --dry-run` 是安全预览：不调用任何 Agent Provider、不执行 `requiredChecks`、不修改产品
文件，只返回 `status: passed` 和四个阶段的结构化结果。M5 之前 dry-run 仍会调用 Planner 和
Tester Provider，导致没有配置 Provider 的项目无法预览。该变化只影响 dry-run，非 dry-run
的四阶段流程和输出契约不变。

## 推进规则

1. 当前里程碑未满足验收标准时，不进入下一里程碑。
2. 跨里程碑的行为变化必须更新 Schema、文档和迁移说明。
3. 每个里程碑都应增加对应测试，而不是只依赖根目录 Vue 测试。
4. 兼容性破坏必须通过主版本或显式迁移步骤处理。
5. Core 不得依赖 Vue；Preset 不得复制 Core 的执行逻辑。
6. 治理能力优先于 Agent 能力：任何新增 Agent 能力（新 Provider、多 Agent、模型路由）都不得
   排在未完成的治理里程碑之前。
7. 每项新能力都要能回答「它服务于 [项目目标](./项目目标.md) 第二节的哪一条设计原则」。
   服务于「让 Agent 更强」而非「让 Agent 更可控」的改动不予接受。
