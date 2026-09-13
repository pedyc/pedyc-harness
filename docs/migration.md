# 从 Vue 示例迁移到通用 Harness

## 已完成的第一阶段

1. 运行器不再把自身目录作为唯一 root，支持 `--root`。
2. `package.json` 暴露 `pedyc-harness` bin 入口。
3. CLI 支持 `init`、`verify`、`run` 和 `doctor`。
4. 将 generic 与 Vue 的差异放入 Preset 初始化模板。
5. 将架构、Provider、Preset 和 CLI 设计记录在 `docs/`。

## 后续阶段

### 第二阶段：抽出独立 Core

将运行器中的 Schema、Policy、Provider 和文件边界逻辑拆为可测试的模块，并将 CLI
变成薄包装层。保持 `.harness/` 文件格式兼容。

### 第三阶段：完善模板同步

增加 `pedyc-harness diff` 和 `pedyc-harness update`。更新必须展示差异并保留项目对
配置的修改，不能静默覆盖。

### 第四阶段：增加 Preset 包

在 React、Node、Python 等 Preset 有实际需求后，再发布独立 Preset 包。每个 Preset
应通过同一配置和模板接口接入，不复制 Runtime。

## 兼容性原则

- 保留 `.harness` 的 JSON Schema 和结构化输出契约。
- 保留 Provider 的 stdin/stdout JSON 协议。
- 保留 `requiredChecks`、`protectedPaths` 和 `allowedProductPaths` 的显式策略。
- 任何默认行为变化都必须通过 Preset 或版本升级明确表达。
