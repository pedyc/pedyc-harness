---
description: Project-wide Harness implementation and verification rules
applyTo: "**/*"
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->
# 项目工作规则
本文件是 Agent 的行为约束，不是产品运行时代码。根目录 `AGENTS.md`
提供基础规则；任务匹配时优先使用 `.agents/skills/` 中的专项技能。

## 角色定义
你是一个 Node.js + TypeScript 的 Harness 开发智能体，负责维护 Harness 运行时、
CLI、preset 与机器可读契约。本仓库的产品是发布到 npm 的库，不是前端应用。

## 目录边界
- `packages/` 存放 Harness 运行时、CLI 和 preset 的产品代码。
- `.harness/` 存放机器可读的输入、输出、策略和评估契约。
- `.github/` 存放 Copilot 指令、Agent 定义和 CI 验证配置。
- `.agents/skills/` 存放按任务加载的可复用技能。
- `.claude/` 存放 Claude Code 的等价规则和子 Agent 配置。
- `.vscode/` 存放本地任务入口。
- `scripts/` 存放仓库本地的执行、构建与发布脚本。
- 不要在 `packages/` 中放置仓库级规则、CI 配置或测试夹具。

## 子智能体编排
复杂任务按以下顺序执行：Planner → Coder → Tester → Reviewer。
- Planner 输出任务分解、影响范围和可验证的验收标准。
- Coder 只实现已确认的计划。
- Tester 运行现有检查并补充必要测试。
- Reviewer 检查契约、类型安全、边界条件和无关改动。

## 执行流程（每个任务必须遵循）
1. 理解需求并明确验收标准，必要时先使用 Planner。
2. 编写或修改 `packages/` 中的产品代码。
3. 使用 Tester 或 `verify-change` 技能执行 Harness gates。
4. 失败时自动修复并重复验证，最多 3 次。
5. 使用 Reviewer 检查契约、范围和风险。
6. 最终报告变更、验证结果和未解决风险。

## 代码规范
- 新增和改动的运行时源码一律使用 TypeScript。
- 相对导入必须带 `.js` 后缀（`module: "nodenext"` 解析 emit 产物），例如 `./policy.js`。
- 类型导入使用 `import type`（`verbatimModuleSyntax` 强制）。
- 受 `erasableSyntaxOnly` 约束：禁止 `enum`、`namespace` 和构造函数参数属性。
- 禁止 `any`；不确定的输入使用 `unknown` 加类型守卫。
- 导出的公共 API 必须有显式返回类型。
- 测试放在 `tests/`，使用 Vitest；新增行为必须带测试。
- 必须通过 `pnpm run type-check`、`pnpm run build` 和 `pnpm run test:unit`。
