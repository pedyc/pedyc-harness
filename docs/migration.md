# 从 Vue 示例迁移到通用 Harness

## 已完成的第一阶段

1. 运行器不再把自身目录作为唯一 root，支持 `--root`。
2. `package.json` 暴露 `pedyc-harness` bin 入口。
3. CLI 支持 `init`、`verify`、`run` 和 `doctor`。
4. 将 generic 与 Vue 的差异放入 Preset 初始化模板。
5. 将架构、Provider、Preset 和 CLI 设计记录在 `docs/`。

## 拆包第一阶段

当前仓库已启用 pnpm workspace，并建立两个包边界：

```text
packages/
├── core/   @pedyc/harness-core：Runtime 可复用的包管理器和命令原语
└── cli/    pedyc-harness：CLI 发布入口，当前兼容调用旧入口
```

根目录 Vue Demo 暂时保留作为集成宿主。`scripts/harness/package-manager.mjs` 通过
workspace 导出复用 Core，确保现有 Harness 流程与新包使用相同实现。Schema、Policy、
Provider 和完整运行编排已迁入 Core，根目录脚本继续作为兼容入口。

## 后续阶段

### 第二阶段：抽出独立 Core

Schema、Policy、Provider、文件边界和 Planner/Coder/Tester/Reviewer 编排已拆为可测试
的 Core 模块。根目录脚本仍是兼容入口，保持 `.harness/` 文件格式兼容。

### 第三阶段：完善模板同步

增加 `pedyc-harness diff` 和 `pedyc-harness update`。更新必须展示差异并保留项目对
配置的修改，不能静默覆盖。

### 第四阶段：增加 Preset 包

generic 和 Vue Preset 已拆为独立 workspace 包，并通过 CLI Preset Registry 接入。
后续 React、Node、Python 等 Preset 应通过同一配置和模板接口接入，不复制 Runtime。

## 兼容性原则

- 保留 `.harness` 的 JSON Schema 和结构化输出契约。
- 保留 Provider 的 stdin/stdout JSON 协议。
- 保留 `requiredChecks`、`protectedPaths` 和 `allowedProductPaths` 的显式策略。
- 任何默认行为变化都必须通过 Preset 或版本升级明确表达。
