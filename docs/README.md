# Pedyc Harness 文档

本目录记录 Harness 的产品目标、通用架构、配置边界和扩展方式。文档与项目中的机器可读契约
（`.harness/`）保持同步，面向维护者和希望接入 Harness 的项目作者。

[项目目标](./项目目标.md) 是本目录的基准文档，先回答「这个项目是什么、按什么原则做、先做什么、
明确不做什么」。其他文档的分层、配置和扩展方式都应与其对齐；已经实现到哪一步、每个阶段的
验收标准，见 [里程碑路线](./milestones.md)。

文档中标为「设想」或「待 Mxx」的内容尚未实现。区分已实现与设计意图很重要：本目录曾多处
按目标形态描述行为，导致读代码时会发现文档承诺了实际不存在的约束。

## 文档索引

- [项目目标](./项目目标.md)：**基准文档**。定位（Agent 的控制平面）、设计原则、能力优先级与
  现状、明确不做的方向，以及包拆分和 CLI 形态等实现设计。
- [项目架构](./architecture.md)：运行时、配置和项目生成文件的职责边界。
- [Preset 设计](./preset-design.md)：generic、Vue 以及未来技术栈 Preset 的抽象。
- [Provider 设计](./provider-design.md)：Planner、Coder、Tester、Reviewer 与外部 Agent 的适配协议。
- [CLI 使用与生成规则](./cli.md)：安装、初始化、验证、运行和升级策略。
- [发布与版本规则](./release.md)：发布单元、SemVer 策略、发布前检查清单、Provider 安全边界。
- [里程碑路线](./milestones.md)：迁移、拆包、Preset 和发布的阶段目标与验收标准。
- [SOP：搭建前端 Harness](./SOP-搭建前端Harness.md)：以 Vue 3 为例的落地步骤、证据链和常见坑点。
- [Harness 设计权衡](./Harness设计权衡.md)：按风险分级决定流程深度，以及 Token 投入的取舍。

## Workspace 包

当前 pnpm workspace 包含：

- `@pedyc/harness-core`（`packages/core`）：可复用的 Runtime 原语和 Node API。
- `pedyc-harness`（`packages/cli`）：CLI 发布包边界，提供 Preset Registry 和验证命令辅助。
- `@pedyc/harness-preset-generic`（`packages/preset-generic`）：通用契约与安全策略。
- `@pedyc/harness-preset-vue`（`packages/preset-vue`）：Vue 3 + TypeScript + Vite 约定。

根目录是 pnpm workspace 的集成宿主，`tests/` 保存 Harness 集成测试，`scripts/harness/` 保留
兼容入口、Provider Adapter 和样例、发布校验脚本。
`examples/` 提供三个最小外部项目，用于验证 Harness 不依赖 Vue 目录和命令；运行
`pnpm run verify:examples` 可以复现验收结果。

CLI 已经是自包含的发布包：`packages/cli/src/` 内含运行时、Preset Registry 和 Schema 模板，
不引用仓库内路径。根目录 `scripts/harness/cli.mjs`、`scripts/harness/run.mjs` 只是指向
`pedyc-harness` 的薄封装，保证仓库内命令与发布包行为一致。`pnpm run release:check`
负责验证打包与安装，规则见 [发布与版本规则](./release.md)。
