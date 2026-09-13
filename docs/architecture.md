# 项目架构

## 目标

Harness 的职责是约束一次任务的执行闭环，而不是实现具体业务。闭环由
Planner → Coder → Tester → Reviewer 组成，所有阶段共享任务输入、策略和结构化输出契约。

## 分层

```text
CLI
└── Runtime
    ├── Intake and JSON Schema validation
    ├── Agent orchestration
    ├── Policy and path boundary checks
    ├── Verification command execution
    └── Run records and structured output

Project configuration
├── .harness/*.json
├── AGENTS.md and provider instructions
└── package.json verification scripts

Preset
└── generic, vue, react, node, python, or a project-owned preset
```

## 包边界

仓库使用 pnpm workspace 管理可发布包：

- `packages/core`：`@pedyc/harness-core`，提供 Runtime 可复用的 Node API。
- `packages/cli`：`pedyc-harness`，提供 CLI 发布入口并依赖 Core。
- 根目录：Vue 示例和集成测试宿主，短期保留兼容脚本。

## 运行时边界

`scripts/harness/run.mjs` 使用 `--root` 或当前工作目录作为目标项目根目录，不依赖
Harness 包自身的安装目录。运行记录写入目标项目的 `.harness/runs/`。配置、提示词和
策略在目标项目中生成并提交，因此 CI 可以审查每次规则变更。

## 安全边界

- `protectedPaths` 禁止 Agent 修改 Harness、CI 和规则目录。
- `allowedProductPaths` 限定 Coder 可以修改的产品目录。
- `requiredChecks` 是 Tester 必须独立执行的验证门禁。
- Provider 命令由 `agents.json` 声明，并可由 `allowedAgentCommands` 限制。
- npm CLI 初始化默认不覆盖已有文件，显式使用 `--force` 才允许覆盖入口说明文件。

## 配置与代码的职责

通用流程应留在 Runtime；技术栈约束应放入 Preset；项目特有命令和目录应放入
`.harness/policy.json`。不要将项目编排逻辑放入 `src/`。
