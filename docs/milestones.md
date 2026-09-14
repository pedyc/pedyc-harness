# Harness 迁移与重构里程碑

本项目的通用化、拆包和发布工作按里程碑推进。每个里程碑都必须满足明确的
交付物和验证标准后，才能进入下一阶段。

## 里程碑总览

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M0 | 固定当前 Vue Harness 基线 | 已完成 |
| M1 | 建立通用 CLI 和项目初始化能力 | 已完成 |
| M2 | 完成 pnpm workspace 与 Core/CLI 初步拆包 | 已完成 |
| M3 | 将完整 Runtime 迁入 Core | 已完成 |
| M4 | 完善 Preset 和项目生成模板 | 进行中 |
| M5 | 建立外部项目样例和兼容性验证 | 计划中 |
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

- `pedyc-harness init --preset generic|vue`
- `verify`、`run` 和 `doctor` 命令。
- `--root` 目标项目支持。
- `init` 默认幂等，`--force` 才覆盖模板文件。
- 根据锁文件选择 npm、pnpm 或 yarn 执行验证命令。

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
- CLI 提供独立的发布入口，并兼容当前旧 CLI。
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
- 抽取任务 Intake 和标准化模块。
- 抽取 Policy、路径边界和文件快照模块。
- 抽取 Provider 调用和阶段响应校验模块。
- 抽取验证命令执行、超时和结构化结果模块。
- 为 Core API 增加 Node 单元测试。
- 保留旧 CLI 参数和 `.harness/` 文件格式兼容。

### 验收标准

- CLI 不再复制 Runtime 核心逻辑。
- `packages/core` 可以在没有 Vue 依赖的项目中安装和运行。
- 现有 Vue 项目的四阶段 dry-run 结果与迁移前一致。
- Core 测试覆盖输入失败、Provider 失败、越权变更和命令失败场景。

## M4：Preset 和项目生成模板（进行中）

### 目标

让技术栈差异只存在于 Preset，而不进入 Core 或 CLI 的编排逻辑。

### 工作项

- 已将 generic Preset 和 Vue Preset 抽取为独立 workspace 包。
- 已建立 CLI Preset Registry，CLI 不再硬编码技术栈规则。
- 统一 Preset 接口：检测、默认路径、验证命令、Instructions 和 Skills。
- 增加 `diff` 命令。
- 增加 `update` 命令，并保留用户对配置的修改。
- 完善 generic 项目的最小完整验证骨架。

### 验收标准

- 新增 Preset 不需要修改 Core。
- `init`、`diff`、`update` 可重复执行。
- 模板更新不会静默覆盖用户配置。
- 至少 generic 和 Vue 两个 Preset 有独立测试。

## M5：外部项目样例和兼容性验证

### 目标

用真实的最小项目证明 Harness 不依赖 Vue 目录和命令。

### 计划样例

```text
examples/
├── generic-project/
├── vue-project/
└── node-project/
```

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

## 推进规则

1. 当前里程碑未满足验收标准时，不进入下一里程碑。
2. 跨里程碑的行为变化必须更新 Schema、文档和迁移说明。
3. 每个里程碑都应增加对应测试，而不是只依赖根目录 Vue 测试。
4. 兼容性破坏必须通过主版本或显式迁移步骤处理。
5. Core 不得依赖 Vue；Preset 不得复制 Core 的执行逻辑。
