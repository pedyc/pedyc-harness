# Pedyc Harness 文档

本目录记录 Harness 的产品目标、通用架构、配置边界和扩展方式。文档与项目中的机器可读契约
（`.harness/`）保持同步，面向维护者和希望接入 Harness 的项目作者。

[项目目标](./项目目标.md) 是本目录的基准文档。其他文档的分层、配置和扩展方式都应与其对齐；
已经实现到哪一步、每个阶段的验收标准，见 [里程碑路线](./milestones.md)。

## 文档索引

- [项目目标](./项目目标.md)：产品形态、包拆分、提示词分层和架构原则的目标基准。
- [项目架构](./architecture.md)：运行时、配置和项目生成文件的职责边界。
- [Preset 设计](./preset-design.md)：generic、Vue 以及未来技术栈 Preset 的抽象。
- [Provider 设计](./provider-design.md)：Planner、Coder、Tester、Reviewer 与外部 Agent 的适配协议。
- [CLI 使用与生成规则](./cli.md)：安装、初始化、验证、运行和升级策略。
- [里程碑路线](./milestones.md)：迁移、拆包、Preset 和发布的阶段目标与验收标准。
- [SOP：搭建前端 Harness](./SOP-搭建前端Harness.md)：以 Vue 3 为例的落地步骤、证据链和常见坑点。
- [Harness 设计权衡](./Harness设计权衡.md)：按风险分级决定流程深度，以及 Token 投入的取舍。

## Workspace 包

当前 pnpm workspace 包含：

- `@pedyc/harness-core`（`packages/core`）：可复用的 Runtime 原语和 Node API。
- `pedyc-harness`（`packages/cli`）：CLI 发布包边界，提供 Preset Registry 和验证命令辅助。
- `@pedyc/harness-preset-generic`（`packages/preset-generic`）：通用契约与安全策略。
- `@pedyc/harness-preset-vue`（`packages/preset-vue`）：Vue 3 + TypeScript + Vite 约定。

根目录的 Vue 示例同时是集成测试宿主，`scripts/harness/` 保留运行器和 Provider Adapter。

CLI 目前仍处于过渡阶段：`packages/cli/src/bin.mjs` 会转发到根目录的
`scripts/harness/cli.mjs`，`package.json` 的 `bin` 也仍指向根目录入口。把 CLI 完全迁入
`packages/cli`、补齐包元数据并发布，属于 [里程碑路线](./milestones.md) 中 M5、M6 的范围。
