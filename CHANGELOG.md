# Changelog

本文件记录 Pedyc Harness 的对外变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

所有 workspace 包共享同一个版本号，同步发布。升级规则见 [发布与版本规则](./docs/release.md)。

## [2.0.0] - 2026-09-15

### Added
- 

### Changed
- 重构：从JS迁移到TS

### Fixed
- 

## [1.1.0] - 2026-09-15

Harness 运行时从零类型标注的 ESM `.mjs` 迁移到 TypeScript，由 `tsc` 编译到 `dist/` 发布。

这是一次**非破坏性变更**：`@pedyc/harness-core` 的十个 `exports` 子路径名全部保留，`.harness/`
JSON Schema 的字节内容、Provider 的 stdin/stdout 契约、`run --dry-run --json` 的输出形状和
`policy.json` 的字段语义都没有改动，`engines.node` 仍为 `>=20`（`dist/` 是普通 JS）。
包内文件从 `src/*.mjs` 变为 `dist/*.js`，但 `exports` 从未暴露 `src/`，因此深路径不属于公开
接口。

### Added

- `@pedyc/harness-core/contracts` 子路径，导出跨模块契约类型：`Policy`、`AgentsConfig`、
  `NormalizedTask`、`RunResult`、`StageRequest`、`Preset` 等。
- 各包发布 `dist/` 时同时携带 `.d.ts` 与 sourcemap，消费者首次获得可用的类型提示。
- 根 `schemas/` 作为 JSON Schema 唯一来源，配 `pnpm run schemas:sync` / `schemas:check`；
  后者在 `.harness/`、`packages/cli/templates/` 或 `examples/*/.harness/` 的副本漂移时
  非零退出，并已接入 CI 与 `harness:verify`。
- 测试覆盖类型与 Schema 的一致性，以及 `harnessCoreVersion` 与四个包 manifest 版本的一致性。

### Changed

- 四个包与仓库工具链改用 TypeScript。`packages/cli`、两个 preset 包和 `release-check`、
  `publish`、`verify-examples`、`claude-adapter`、`schemas-sync` 均由 `tsc` 编译。
- `packages/core` 源码按 `contracts/`、`core/`、`adapters/` 分层。内部的策略校验、审批判定等
  重复逻辑合并到 `@pedyc/harness-core/policy`，`@pedyc/harness-core/snapshots` 等子路径名不变。
- 仓库自身的 `.harness/verify.mjs`、`tests/fixtures/echo-adapter.mjs` 和四个转发 shim 保持
  `.mjs`：前者在任意生成项目里直接执行，必须无需构建步骤即可运行。
- 两个 preset 包新增对 `@pedyc/harness-core` 的依赖（仅类型引用，运行时产物无 import）。
- 构建顺序变为强制约束：`pnpm run build` 必须先于其余门禁，因为仓库内脚本通过包 `exports`
  解析到 `dist/`。根 `prepare` 钩子保证 `pnpm install` 之后即存在构建产物。
- 仓库自身的 Vue 演示应用（根 `src/`、`index.html`、`vite.config.ts`）移除，验证入口改为
  Harness 自身；`packages/preset-vue` 与 `examples/vue-project` 保留不变。
- 仓库自己的 `policy.json` 中 `allowedProductPaths` 由 `src/` 改为 `packages/`。

### Fixed

- `@pedyc/harness-core` 导出的 `harnessCoreVersion` 不再硬编码版本号，改为读取自身
  `package.json`。`1.0.1` 中该常量仍返回 `1.0.0`；仓库内没有任何调用方，所以没有测试
  能发现这处漂移，registry 上已发布的 `1.0.1` 产物同样保持原值。
- README、里程碑和发布规则中残留的 `1.0.0` 版本引用改为当前版本，或去掉具体版本号，
  避免下次升版再次过期。

## [1.0.1] - 2026-09-15

首次推送到 npm registry 的版本。四个包同步发布，其中 `pedyc-harness` 是首次可用版本。

### Added

- 四个包发布到 npm registry：`pedyc-harness`、`@pedyc/harness-core`、
  `@pedyc/harness-preset-generic`、`@pedyc/harness-preset-vue`，版本 `1.0.1`。
- 安装入口为 `npm install --save-dev pedyc-harness@1.0.1`。

### Notes

- **四个包的发布内容相对 `1.0.0` 没有任何代码变更**，只调整了版本号。仓库内的
  `release:check` 有一处修复：tarball 文件名改为从 manifest 读取版本，不再硬编码 `1.0.0`。
  该脚本不在发布包内，不影响上面这条结论。`1.0.0` 是一次未完成的发布：
  三个 scoped 包已经上线，`pedyc-harness@1.0.0` 从未发布，因此不存在依赖它的版本。
  registry 上的 `@pedyc/harness-core@1.0.0`、`@pedyc/harness-preset-generic@1.0.0`、
  `@pedyc/harness-preset-vue@1.0.0` 没有任何消费者，可以忽略。
- 本次发布以 [发布与版本规则](./docs/release.md) 的手工流程执行，未走
  `pnpm run release:publish`，因此没有触发该脚本的依赖顺序发布与部分失败保护。

## [1.0.0] - 2026-09-15

v1.0 是 Pedyc Harness 的第一个公开发布版本，把 Harness 从单一 Vue 项目脚本拆分为
「通用 Core + 技术栈 Preset + 项目配置 + 可插拔 Provider」。

### Added

- `@pedyc/harness-core`：不依赖 Vue 的 Runtime 原语，包含命令执行、锁文件探测、
  任务归一化、Schema 校验、路径策略、Provider 路由和四阶段编排。
- `pedyc-harness`：自包含 CLI，提供 `init`、`verify`、`doctor`、`diff`、`update` 和 `run`
  命令，并在包内携带 Schema 与 `task.example.json` 模板。
- `@pedyc/harness-preset-generic` 和 `@pedyc/harness-preset-vue`：初始化模板与策略预设。
- 项目级验证扩展点 `.harness/verify.mjs`：CLI 完成通用校验后，可以执行项目自定义的严格检查。
- `examples/` 下的 generic、vue、node 三个最小外部项目，以及 `pnpm run verify:examples`。
- `pnpm run release:check`：打包全部 workspace 包、检查 tarball 内容，再用真实 `npm install`
  装进一个临时 npm 项目，并通过 `node_modules/.bin/pedyc-harness` 跑通 `init`、双向 `verify`、
  `doctor`、`run --dry-run` 以及一次完整的四阶段闭环（四个门禁真实执行）。
- `pnpm run release:publish`：按依赖顺序发布四个包，发布前校验 npm 认证、registry、版本占用和
  `release:check`，避免不可逆的部分发布。

### Changed

- CLI 运行时从 `scripts/harness/` 迁入 `packages/cli/src/`。根目录脚本保留为兼容入口，
  行为与发布包一致。
- `run` 的所有分支改为返回退出码，便于 CLI、库调用和测试共用同一实现。
- Vue Preset 不再内置指向本仓库的 Claude Adapter 路径；生成的 `agents.json` 不含 Provider。
- `verify` 的项目专属检查从 `.github/harness/verify-config.mjs` 迁移到 `.harness/verify.mjs`。

### Fixed

- `run --dry-run` 现在完全跳过 Agent Provider 和验证门禁。此前即使指定 `--dry-run`，
  也会调用外部 Provider 并执行验证命令。

### Security

- 任何包都不会调用 `--dangerously-skip-permissions` 之类的绕过确认参数。
- `run` 默认受 `policy.json` 的 `protectedPaths` 和 `allowedProductPaths` 约束；
  dry-run 不写入任何产品文件。
