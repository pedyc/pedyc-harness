# 迁移、重构与发布里程碑

本文件是 [项目目标](./项目目标.md) 的进度记录：把「从 Vue 示例迁移到通用 Harness」的路线
图与阶段性验收标准合并在一起。原文的迁移阶段和里程碑描述高度重叠，现已收敛为本文件，
每个里程碑都必须满足明确的交付物和验证标准后，才能进入下一阶段。

## 里程碑总览

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M0 | 固定当前 Vue Harness 基线 | 已完成 |
| M1 | 建立通用 CLI 和项目初始化能力 | 已完成 |
| M2 | 完成 pnpm workspace 与 Core/CLI 初步拆包 | 已完成 |
| M3 | 将完整 Runtime 迁入 Core | 已完成 |
| M4 | 完善 Preset 和项目生成模板 | 已完成 |
| M5 | 建立外部项目样例和兼容性验证 | 已完成 |
| M6 | 完成 npm 发布准备和 v1.0 发布 | 计划中 |

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

`verify:examples` 在三个样例上共 30 项检查全部通过；`test:unit` 覆盖 dry-run 不调用
Provider、锁文件识别和上述错误路径。

## M6：npm 发布准备与 v1.0

### 目标

将 Core、CLI 和 Preset 作为可审查、可安装、可升级的 npm 包发布。

### 工作项

- 补全包元数据、README、许可证和仓库链接。
- 配置 `files` 白名单，排除测试、运行记录和本地产品文件。
- 使用 `pnpm pack --dry-run` 检查每个 tarball 内容。
- 增加发布前 smoke test：临时目录安装 tarball 并执行 `init`、`verify`、`run`。
- 建立 changelog 和版本升级规则。
- 记录 Provider 安全边界与兼容性策略。

### 发布门槛

- 所有 workspace 包均可独立打包。
- 从 tarball 安装后 CLI 可以运行。
- 所有样例项目通过验证。
- CI 使用 frozen lockfile。
- 没有未解决的高风险安全问题。

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
