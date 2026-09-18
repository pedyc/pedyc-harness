# Changelog

本文件记录 Pedyc Harness 的对外变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

所有 workspace 包共享同一个版本号，同步发布。升级规则见 [发布与版本规则](./docs/release.md)。


## [Unreleased]

> 目标版本 **1.3.0**（治理执行：M7 + M8）。本节目前只包含 M7（策略可执行）。发布时按
> [发布与版本规则](./docs/release.md) 改为 `## [1.3.0] - <日期>`。

### Added

- **`forbiddenCommands` 真正生效。** 匹配对象是 `command + args` 经规范化后的 token 序列，
  采用**有序 token 序列包含**语义：`npm publish` 会拦下 `npm publish --tag beta` 与
  `sudo npm publish`，但不会拦下 `npm publish-notes`。可执行名取 basename 并去掉
  `.cmd`/`.exe`/`.bat`。第一版不支持正则与任意子串匹配，也不解析引号内的 shell 字符串
  （`sh -c "npm publish"` 不命中）——这是记录的边界，不是遗漏。
- **`protectedPaths` 真正生效。** 命中受保护路径的改动会被拒绝，并单独报告为
  `Protected files changed: …`，与 `allowedProductPaths` 的越界区分开。
- **验证命令也过策略。** `requiredChecks` 的每条命令在执行前经过同一个 Policy Evaluator，
  被拒绝的闸门不会被启动。
- `onViolation: fail | report`（默认 `fail`）。
- `agentTimeoutMs` 到期会终止该次 Provider 调用并记录 `timeout`；Ctrl+C 会被记录为
  `cancelled`（CLI 把 SIGINT 接到取消管线上）。
- `maxChangedFiles`：限制单次 Coder 迭代的改动文件数。
- `RunResult` 新增 `violations`（本次运行产生的策略判定）与可选的 `termination`
  （`completed` / `timeout` / `max_iterations` / `policy_violation` / `agent_error` /
  `cancelled`）。
- 新增 `schemas/policy.schema.json`：`.harness/policy.json` 的正式 Schema，随
  `@pedyc/harness-core` 一起发布。

### Changed

- **`policy.json` 的字段收敛为四类职责**（scope / command constraints / execution constraints /
  enforcement），分组只是文档大纲，文档保持扁平。规则处置表（`rules`、`severityActions`）**没有**
  随之发布：在第一个 rule 实现存在之前，它唯一合法的值是空对象，等于发布一个「声明了但没人读」的
  字段。它推迟到 M8，与第一个 checker 同批落地。见
  [ADR-008](./docs/decisions/ADR-008-policy-scope-and-deferred-rule-disposition.md)。
- `.harness/harness.json` **不接受 `rules` 字段**：规则配置没有 manifest 级归属。该字段此前标注为
  「无运行时消费」，因此没有项目依赖它。
- `forbiddenCommands`、`allowedAgentCommands`、`onViolation`、`agentTimeoutMs`、
  `maxChangedFiles` 现在做形状校验：非法值在配置阶段失败，而不是静默不生效。
- `RunResult.termination` 在循环未运行时（dry-run、配置 / intake / schema 失败）不写。
- 命令执行在 Windows 上停止进程时改为终止整棵进程树：只终止 shell 会让工作继续运行，并持有
  输出管道使其永不关闭。

### Breaking Changes

- **声明了 `protectedPaths`、`forbiddenCommands` 或 `agentTimeoutMs` 的项目，行为会变。**
  这些字段此前只被 schema 接受、没有任何执行力；现在它们真的拦。按
  [发布与版本规则](./docs/release.md) §11，这属于「CLI 行为导致旧用法失效」。

  唯一需要的动作：**如果你依赖的是「声明了但不管用」的旧行为，在 `policy.json` 里加上
  `"onViolation": "report"`。** 它把违规降级为记录，不再让运行失败。请注意它**不**解除对
  危险副作用的控制——被禁止的命令在任何模式下都不会被启动，只是不再据此把运行判失败。

  `onViolation: report` 的存在是本次按 MINOR 判定的前提（release.md §11）；实际语义级别由
  发布里程碑 M14 决定。


## [1.2.0] - 2026-09-17

声明式配置层：`.harness/harness.json` 成为项目治理的声明入口，Preset 从代码包变成可继承的 npm
数据包，CLI 不再内置任何静态 Preset 表。既有项目**无需改动**即可升级；迁移是可选的，步骤与
不迁移时的行为见[迁移到 1.2.0](./docs/migrating-to-1.2.0.md)。

本次发布包含两项删除公开导出的变更，按[发布与版本规则](./docs/release.md) §11 的**「未消费 API」
例外**判为 **MINOR**，依据见下方 `Breaking` 一节。

### Added

- `.harness/harness.json`（Harness Manifest）与 `schemas/harness.schema.json`。项目因此有了一个明确的
  配置入口，而不是把治理定义散落在多个隐式位置。`harness.json` 由 `@pedyc/harness-core` 自带的
  schema 副本校验，项目无法放宽自己的 Manifest 所受的约束。见
  [M15](./docs/milestones/milestones.md#m15配置基础与-runtime-模块边界config-foundation)。
- `@pedyc/harness-core/config` 子路径与 `loadHarnessConfig`：定位、读取并校验配置的唯一入口。
  配置错误在执行前返回结构化错误（`code` / `file` / `field` / `message`），而不是在运行中途失败。
- `@pedyc/harness-core` 根导出新增配置层 API：`loadHarnessConfig`、`readManifest`、`defaultPolicy`、
  `defaultAgents`、`policyProblems`、`agentProblems`、`formatConfigError` 与相关类型。
- `pedyc-harness doctor` 输出实际生效的配置来源，包括回退到 `built-in defaults` 的情况。
- `Preset` 契约新增 `packageName`；`init` 写入 Manifest 的是包名而不是短名。
- `schemas/preset.schema.json`（Preset Manifest 契约）与 `preset.json`，Preset 由此成为
  可发布的 npm package。见 [M16](./docs/milestones/milestones.md#m16preset-system)。
- Preset 继承：`extends` 声明父级包名，解析为 DAG。同一个 Preset 无论被多少条链引用都只加载
  一次，依赖排在使用它的 Preset 之前，循环依赖报出完整环路而不是让调用栈溢出。
- `pedyc-harness list-presets`：列出项目实际解析到的 Preset 包，标注 `declared` / `inherited`
  与各自的 `extends`。它走运行时的同一套解析，未安装的 Preset 在这里就是错误。
- `@pedyc/harness-core` 新增 `resolvePresets`、`presetPackageName`、`presetFile`、
  `presetDocument` 与 `PresetManifest` / `ResolvedPreset` 类型。
- `init --preset` 在 Preset 尚未安装时按检测到的包管理器安装它；`--no-install` 关闭该行为。
  只写 Manifest 不装包会让下一次运行在配置阶段失败。
- `schemas/preset.schema.json` 新增可选字段 `entry`：Preset 的代码入口。解析器会校验它留在包内且
  文件存在，但**没有任何运行时加载它**——带 `entry` 的 Preset 属于
  [ADR-003](./docs/decisions/ADR-003-preset-as-code.md) 定义的 M21 目标形态。变更前声明 `entry`
  的清单会因未知字段被拒绝。

### Changed

- **可能需要关注的退出码变更**：配置错误现在返回 `5`（[CLI 契约](./docs/interfaces/cli.md) §8），
  而不再是 `1`。`pedyc-harness run` 与 `verify` 在配置缺失、非法或路径越界时都会返回 `5`。项目自有的
  `.harness/verify.mjs` 退出码仍然原样透传。
- `@pedyc/harness-core` 源码目录由 `contracts/` + `core/` + `adapters/` 收敛为
  `contracts/` + `config/` + `runtime/`。`exports` 子路径名全部保留，其中 `./schema` 现在指向
  `dist/config/schema.js`，导出名不变并新增 `compileSchema` / `readSchema`。
- `run` 的配置来源选择统一走 `loadHarnessConfig`：Manifest 声明 → 约定位置
  `.harness/policy.json` / `.harness/agents.json` → Preset → 内置默认值。没有 `harness.json`
  的项目行为与之前一致，`policy.json` 与 `agents.json` 仍然被读取。
- **`init` 不再把 Preset 的内容复制进项目。** 它只写 `.harness/harness.json` 与契约文件，
  `AGENTS.md` 在缺失时用 Preset 的 `instruction` 播种。`policy.json` / `agents.json` 留在
  Preset 包里由 Resolver 读取，升级 Preset 因此是升级依赖，而不是逐文件合并。
- `diff` / `update` 的对象收窄为契约文件（`.harness/*.schema.json`、`task.example.json`），
  不再接受 `--preset`：`harness.json` 与 `AGENTS.md` 由 `init` 写过一次后归项目所有。
- Preset 的短名由 CLI 展开（`vue` → `@pedyc/harness-preset-vue`），含 `/` 的名字原样当作包名。
  这条纯函数取代了 CLI 内置的静态 Preset 表，团队 Preset 不再需要在本仓库注册。
- 两个官方 Preset 的映射改为按 npm 解析，不再依赖 CLI 硬编码表。

### Breaking

- **`@pedyc/harness-preset-generic` 与 `@pedyc/harness-preset-vue` 移除了默认导出。**
  两个包现在是纯数据包：只有 `preset.json`、`policy.json`、`agents.json`、`AGENTS.md`，
  不再包含 `src/`、`dist/`、类型声明与构建步骤，也不再依赖 `@pedyc/harness-core`。
  按[发布与版本规则](./docs/release.md) §11，删除公开 API 默认属于 MAJOR；本次按同一节的
  **「未消费 API」例外**判为 **MINOR**——这条默认导出没有文档化用法（Preset 的用法一直是
  在 `harness.json` 里写包名），替代路径是「安装包 + 声明包名」。

  迁移方式：把 `import preset from '@pedyc/harness-preset-vue'` 换成安装包并在
  `.harness/harness.json` 中声明包名——

  ```json
  {
    "presets": ["@pedyc/harness-preset-vue"]
  }
  ```

  然后执行 `npx pedyc-harness init`（或在已有 Manifest 的 `.harness/` 下直接读取）。升级 Preset
  由 `npm update` 完成，不再需要 `update` 逐文件同步。

- `@pedyc/harness-core/contracts` 不再导出 `Preset` 与 `PresetDetection`。它们描述的是内存中的
  Preset 对象，而 M16 之后 Preset 不再是一个模块；替代类型是 `PresetManifest` 与
  `ResolvedPreset`。

### Compatibility

- 没有 `harness.json` 的既有项目无需改动：配置来源、字段语义与 `run --dry-run --json` 的输出形状
  都没有变化。
- `harness.json` 的路径字段相对 `.harness/` 解析，且不允许绝对路径或 `..` 越出 `.harness/`。
- 只有 `harness.json` 的最小项目可以完成 `verify` 与 `run --dry-run`。
- 已经 `init` 过并且 `.harness/policy.json`、`.harness/agents.json` 存在的项目按原样工作：
  项目自己的文档优先于 Preset，因此旧项目不会被 Preset 的策略改变行为。

按[发布与版本规则](./docs/release.md) §11，一次发布取四个包中变更的最高语义级别。本次 `Breaking`
里的两项都命中该节的**「未消费 API」例外**（被删导出没有文档化用法，替代路径见上），因此判为
**MINOR**：本版本为 **1.2.0**，四个包同步提升。

从「只有 `policy.json`」的项目迁移到 `harness.json` 是可选的，完整步骤与不迁移时的行为见
[迁移到 1.2.0](./docs/migrating-to-1.2.0.md)。


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
