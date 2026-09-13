# Pedyc Harness 文档

本目录记录 Harness 的通用架构、配置边界和扩展方式。文档与项目中的机器可读契约
（`.harness/`）保持同步，面向维护者和希望接入 Harness 的项目作者。

## 文档索引

- [项目架构](./architecture.md)：运行时、配置和项目生成文件的职责边界。
- [Provider 设计](./provider-design.md)：Planner、Coder、Tester、Reviewer 与外部 Agent 的适配协议。
- [Preset 设计](./preset-design.md)：generic、Vue 以及未来技术栈 Preset 的抽象。
- [CLI 使用与生成规则](./cli.md)：安装、初始化、验证、运行和升级策略。
- [迁移路线](./migration.md)：从当前 Vue 示例迁移到通用 Harness 的阶段计划。
