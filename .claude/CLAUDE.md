# Agent Harness Rules

请先读取根目录 `AGENTS.md`。本项目的 `src/` 只用于 Vue 产品演示。
Agent 规则、技能、契约和验证入口分别位于：

- `AGENTS.md`：仓库级规则和指令层级
- `.github/instructions/`：通用工作规则
- `.github/agents/`：Planner、Coder、Tester、Reviewer 角色
- `.github/workflows/`：持续集成验证
- `.vscode/task.json`：本地验证任务
- `.agents/skills/`：按任务加载的可复用技能
- `.harness/`：输入、输出、策略和评估契约
- `.claude/`：Claude Code 的补充入口和权限配置

复杂任务必须遵循 Planner → Coder → Tester → Reviewer，并通过：

```bash
pnpm run harness:verify
pnpm run type-check
pnpm run build
```

安全预览编排器：

```bash
pnpm run harness:run -- --input .harness/task.example.json --dry-run --json
```

非 dry-run 模式需要在 `.harness/agents.json` 配置 Coder 外部适配器。
当前默认 Coder 适配器是 `scripts/harness/claude-adapter.mjs`，要求本机已安装并登录 Claude Code。
