# 项目架构

## 目标

Harness 是 Agent 的**控制平面**：它约束一次任务被允许做什么，并判定做完之后是否算数。
它不实现具体业务，也不实现 Agent 自身的推理能力。这一定位见
[项目目标](./项目目标.md) 第一节。

控制流：

```text
Task Contract        .harness/input.schema.json + 任务载荷
   ↓
Policy               .harness/policy.json：允许改什么、允许跑什么、超时、审批
   ↓
Agent Runtime        Claude Code / Codex / 其他，经 Provider 接入，可替换
   ↓
Changes              实际文件改动（diff），不是 Agent 的声明
   ↓
Validation           门禁由 Harness 执行，证据由 Harness 记录
   ↓
Gate                 Policy 复核 + Reviewer 判定 + 可选人工审批
   ↓
Result / Audit       output.json、events.json、.harness/runs/
```

Planner → Coder → Tester → Reviewer 这套阶段编排，是上述控制流当前的实现方式，
而不是项目的目的本身。阶段共享任务输入、策略和结构化输出契约。

## 模块分层

```text
CLI
└── Runtime
    ├── Intake and JSON Schema validation
    ├── Policy and scope enforcement
    ├── Agent orchestration
    ├── Independent verification
    ├── Diff inspection
    └── Run records and structured output

Project configuration
├── .harness/*.json
├── AGENTS.md
└── package.json verification scripts

Preset
└── generic, vue, react, node, python, or a project-owned preset
```

## 包边界

仓库使用 pnpm workspace 管理可发布包：

- `packages/core`：`@pedyc/harness-core`，提供 Runtime 可复用的 Node API。
- `packages/cli`：`pedyc-harness`，自包含 CLI 发布包，内含运行时、Preset Registry、通用校验
  和 Schema 模板，不引用仓库内路径。
- `packages/preset-generic`：`@pedyc/harness-preset-generic`，通用契约和安全策略。
- `packages/preset-vue`：`@pedyc/harness-preset-vue`，Vue 3 + TypeScript + Vite 约定。
- 根目录：Vue 示例和集成测试宿主；`scripts/harness/cli.mjs` 与 `scripts/harness/run.mjs` 是指向
  发布包的薄封装，`claude-adapter.mjs` 是可选的本地 Adapter 示例。
- `examples/`：不参与 workspace 安装的独立最小项目，用于验证 Harness 不依赖 Vue 目录和命令；
  由 `pnpm run verify:examples` 执行 `init`、`verify`、`run --dry-run` 和 `doctor` 验收。

## 提示词分层

规则不应整体硬编码在 npm 包里。运行时把四部分组合后交给 Provider：

```text
core instructions      # 契约、阶段流程、安全策略，所有项目通用
+ preset instructions  # 技术栈约定，例如 Vue 3 <script setup lang="ts">
+ project instructions # 项目自身规则，来自项目中的 AGENTS.md
+ task payload         # 本次任务输入
```

Preset 负责生成技术栈相关的默认值，项目可以在生成后修改并纳入版本控制。这样支持一个新
项目或技术栈时，不需要复制整套 Harness 编排逻辑。

**当前状态**：上述四段式拼接在代码中并不存在。`init` 会生成 `AGENTS.md`，但请求里不包含它，
实际依赖被接入的 Agent CLI 自行按工作目录读取。本节属于设计意图，不是已实现行为；
把它变成实现是 M12 之后的工作。

## 运行时边界

`run` 使用 `--root` 或当前工作目录作为目标项目根目录，不依赖 Harness 包自身的安装目录。
运行记录写入目标项目的 `.harness/runs/`。配置、提示词和策略在目标项目中生成并提交，
因此 CI 可以审查每次规则变更。

`verify` 同样面向目标项目：先校验 `.harness/` 的通用契约，再在存在
`.harness/verify.mjs` 时执行项目自定义的严格检查。仓库自身的完整检查（文件清单、
`src/` 边界、Agent frontmatter）就放在这个钩子里，因此 CLI 不需要知道任何项目特有文件。

## 安全边界

标注「已生效」的是 v1.0 中经代码核查确认会拦截的行为；标注「待 M7」的目前只是声明性字段，
Harness 不会因此拒绝任何操作。

- `allowedProductPaths` 限定 Coder 可以修改的产品目录，越界改动会被报告。**已生效。**
- `requiredChecks` 是 Tester 必须独立执行的验证门禁，不采信 Coder 自述。**已生效。**
- Provider 命令由 `agents.json` 声明，并可由 `allowedAgentCommands` 限制。**已生效。**
- npm CLI 初始化默认不覆盖已有文件，显式使用 `--force` 才允许覆盖。**已生效。**
- `protectedPaths` 禁止 Agent 修改 Harness、CI 和规则目录。**待 M7**：当前只被校验为数组，
  不参与任何拦截。
- `forbiddenCommands` 禁止执行危险命令。**待 M7**：当前无任何代码读取该字段。
- 人工审批节点。**待 M10**：当前不存在审批环节。

## 配置与代码的职责

通用流程应留在 Runtime；技术栈约束应放入 Preset；项目特有命令和目录应放入
`.harness/policy.json`。不要将项目编排逻辑放入 `src/`。

[项目目标](./项目目标.md) 第十节设想的 `.harness/config.json` 合并配置尚未实现；当前仍使用
按职责拆分的多个 JSON 文件，便于版本管理和安全审查。
