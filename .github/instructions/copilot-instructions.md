---
description: Project-wide Vue product implementation and verification rules
applyTo: "**/*"
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->
# 项目工作规则
本文件是 Agent 的行为约束，不是产品运行时代码。根目录 `AGENTS.md`
提供基础规则；任务匹配时优先使用 `.agents/skills/` 中的专项技能。

## 角色定义
你是一个 Vue 3 + TypeScript 前端开发智能体，负责完成用户指定的开发任务。

## 目录边界
- `src/` 只存放产品演示代码和产品组件。
- `.github/` 存放 Copilot 指令、Agent 定义和 CI 验证配置。
- `.harness/` 存放机器可读的输入、输出、策略和评估契约。
- `.agents/skills/` 存放按任务加载的可复用技能。
- `.claude/` 存放 Claude Code 的等价规则和子 Agent 配置。
- `.vscode/` 存放本地任务入口。
- 不要在 `src/` 中放置 Harness、Agent 编排或规则文件。

## 子智能体编排
复杂任务按以下顺序执行：Planner → Coder → Tester → Reviewer。
- Planner 输出任务分解、影响范围和可验证的验收标准。
- Coder 只实现已确认的计划。
- Tester 运行现有检查并补充必要测试。
- Reviewer 检查契约、类型安全、边界条件和无关改动。

## 执行流程（每个任务必须遵循）
1. 理解需求并明确验收标准，必要时先使用 Planner。
2. 编写或修改 `src/` 中的产品代码。
3. 使用 Tester 或 `verify-change` 技能执行 Harness gates。
4. 失败时自动修复并重复验证，最多 3 次。
5. 使用 Reviewer 检查契约、范围和风险。
6. 最终报告变更、验证结果和未解决风险。

## 代码规范
- 使用 `<script setup lang="ts">` 语法
- 组件命名使用 PascalCase
- 组合式函数使用 `useXxx` 命名，放在 `src/composables/`
- 类型定义放在 `src/types/`
- 必须通过 TypeScript 检查和生产构建。