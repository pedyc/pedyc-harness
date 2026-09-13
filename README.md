# Pedyc-Harness：我的harness工程实践

这是一个 Vue 3 + TypeScript + Vite 的 Agent Harness 示例项目，目标是让 LLM
能够按照输入契约、执行策略和质量门禁，自主完成“计划 → 实现 → 验证 → 审查”的任务闭环。

## 当前完成情况

### 已完成

- [x] Vue 3 + TypeScript + Vite 产品演示项目骨架
- [x] `UserInfo.vue` 示例组件
  - [x] `<script setup lang="ts">`
  - [x] 类型化 Props
  - [x] 姓名、头像、角色展示
  - [x] 组件单元测试
- [x] 分层 Agent 配置
  - [x] Planner
  - [x] Coder
  - [x] Tester
  - [x] Reviewer
- [x] 根级和目录级 `AGENTS.md` 规则
- [x] `.github/` 中的 Agent、Instructions 和 CI 配置
- [x] `.agents/skills/` 可复用任务技能
- [x] Harness 输入契约
- [x] 三层输入入口
  - [x] 自然语言或简化任务输入
  - [x] Intake 完整性检查
  - [x] 标准化机器任务契约
- [x] Harness 输出契约
- [x] Agent 响应契约
- [x] JSON Schema 运行时校验（Ajv 2020-12）
- [x] Harness 策略配置
  - [x] 最大迭代次数
  - [x] 产品目录白名单
  - [x] 受保护目录
  - [x] 必须执行的验证命令
  - [x] 禁止命令
- [x] 自动执行器
  - [x] Planner → Coder → Tester → Reviewer
  - [x] 失败重试
  - [x] 文件变更检测
  - [x] 越权目录变更检查
  - [x] dry-run 模式
  - [x] 结构化 JSON 输出
  - [x] 运行记录保存到 `.harness/runs/`
- [x] Claude Code CLI Adapter
  - [x] Windows `claude.cmd` 启动兼容
  - [x] 通过 stdin 传递任务 JSON
  - [x] Claude 结构化 JSON 响应解析
  - [x] Coder 使用 `acceptEdits`
  - [x] 只读阶段使用 `plan`
  - [x] 限制允许的工具和工作目录
  - [x] 未启用 `--dangerously-skip-permissions`
- [x] 多 Provider Adapter 配置抽象
  - [x] Agent 角色通过 `provider` 路由到具体 Adapter
  - [x] Claude CLI 作为默认 Provider
  - [x] 可在 `.harness/agents.json` 增加 Copilot 或其他 Provider
- [x] 真实 Coder 闭环验证
  - [x] Planner、Coder、Tester、Reviewer 流程成功跑通
  - [x] `harness:verify` 通过
  - [x] `type-check` 通过
  - [x] `test:unit` 通过
  - [x] `build` 通过
- [x] CI Harness 门禁

## 待办清单

### 优先级 P0：提高闭环可信度

- [x] 将 Planner 接入真实 Claude Adapter，而不是使用内置 fallback
- [x] 将 Tester 接入真实 Claude Adapter
- [x] 将 Reviewer 接入真实 Claude Adapter
- [x] Tester 独立执行并记录命令结果，不信任 Coder 自报的验证结果
- [x] 为 Planner、Tester、Reviewer 增加阶段专用响应校验
- [x] Reviewer 强制返回结构化 `approved`、问题列表和验收证据
- [x] 增加输入失败场景测试，验证结构化失败输出
- [ ] 在允许 Claude CLI 执行后验证四阶段真实闭环成功

### 优先级 P1：实时执行和可观测性

- [ ] 将阶段开始、结束、命令执行和错误实时输出到终端
- [ ] 转发验证命令的 stdout/stderr 摘要
- [ ] 显示每个 Agent 阶段的耗时
- [ ] 增加命令级超时和取消机制
- [ ] 增加运行记录索引和更易读的汇总报告
- [ ] 增加运行记录清理策略

### 优先级 P1：安全和策略治理

- [ ] 将 `allowedAgentCommands` 配置为明确的非空白名单
- [ ] 对 Agent 的命令参数进行更严格的校验
- [ ] 增加符号链接、路径穿越和删除文件场景的安全测试
- [ ] 对 Claude 返回的文件修改声明与实际 diff 做一致性检查
- [ ] 增加敏感信息扫描

### 优先级 P2：测试和工程质量

- [ ] 增加 Playwright E2E 测试
- [ ] 增加越权修改、无修改任务和命令失败场景测试
- [ ] 增加 ESLint
- [ ] 增加 Prettier
- [ ] 在 CI 中执行 Harness dry-run 和更多失败路径测试
- [ ] 增加多任务、并发和长任务场景验证

### 优先级 P2：多 Agent 和扩展能力

- [ ] 支持按任务选择不同 Agent Adapter
- [ ] 支持多个 Coder 子 Agent 的分工和结果合并
- [ ] 支持人工审批节点作为可选策略
- [ ] 支持任务取消后恢复
- [ ] 支持 Anthropic API 等非 CLI Adapter

## 目录职责

| 目录 | 用途 |
| --- | --- |
| `src/` | 产品演示代码，仅放 Vue 组件和页面 |
| `.github/` | GitHub Agent、Instructions、CI 和配置校验 |
| `.agents/skills/` | 可复用的任务技能 |
| `.harness/` | 输入/输出契约、策略、评估、Agent 配置和运行记录 |

## 通用化与 npm CLI

本项目现在同时提供可复用的 CLI 入口。安装到其他项目后，可以使用：

```bash
npm install --save-dev pedyc-harness
npx pedyc-harness init --preset generic
npx pedyc-harness verify
npx pedyc-harness run --input .harness/task.json --dry-run --json
```

`generic` Preset 只生成通用契约和安全策略；`vue` Preset 额外生成 Vue 约束。运行时通过
`--root` 将 Harness 指向目标项目，Provider 和项目规则仍保存在目标项目中并纳入版本控制。
详细设计见 [`docs/`](D:/Workspace/pedyc/pedyc-harness/docs)。

本仓库使用 pnpm 管理依赖，目标项目仍兼容 npm、pnpm 和 yarn。Harness Runtime 会根据
锁文件选择验证命令对应的包管理器。
| `scripts/harness/` | Harness 编排器和 Provider Adapter |
| `.claude/` | Claude Code 入口和权限相关配置 |
| `tests/` | 产品组件和 Harness 配置测试 |

## 常用命令

```powershell
# 配置完整性检查
npm run harness:verify

# 单元测试
npm run test:unit

# 类型检查
npm run type-check

# 构建
npm run build

# 安全预览，不修改产品代码
node scripts/harness/run.mjs --input .harness/task.example.json --dry-run --json

# 运行真实 Harness
node scripts/harness/run.mjs --input .harness/task.example.json --json

# 使用简化任务契约
node scripts/harness/run.mjs --task .harness/task.example.json --json

# 使用自然语言试探输入；信息不足时返回需要补充的问题
node scripts/harness/run.mjs --prompt "创建一个用户卡片组件" --json
```

建议直接使用 `node scripts/harness/run.mjs` 传递参数；当前 npm 11 对
`npm run ... -- --input ...` 的参数转发在部分 Windows 环境中不稳定。

运行前需要确认 Claude Code CLI 已安装并认证：

```powershell
claude --version
claude auth status
```

## 查看运行结果

最终结果会打印为 JSON，并保存到：

```text
.harness/runs/<运行编号>/output.json
```

同一运行目录还包含：

- `input.json`：本次任务输入
- `policy.json`：本次使用的策略快照
- `iteration-<n>-verification.json`：每轮验证结果

当前版本会输出最终结果和阶段结果；Claude 的中间思考内容不会展示。实时阶段日志和命令输出转发列在待办清单中。

## 多 Provider 配置

Agent 角色不再直接绑定命令，而是引用 `.harness/agents.json` 中的 Provider：

```json
{
  "providers": {
    "claude": {
      "command": "node",
      "args": ["scripts/harness/claude-adapter.mjs"]
    }
  },
  "coder": {
    "mode": "external",
    "provider": "claude"
  }
}
```

后续接入 Copilot 时，只需增加一个 Provider，例如：

```json
{
  "providers": {
    "copilot": {
      "command": "node",
      "args": ["scripts/harness/copilot-adapter.mjs"]
    }
  }
}
```

Provider Adapter 必须遵守统一接口：从 stdin 接收一个 Harness JSON 请求，向 stdout
输出一个 Agent JSON 响应，并通过退出码报告启动或执行失败。

## 三层输入模型

```text
自然语言输入 / 简化任务文件
  ↓
Intake：检查关键信息并提出问题
  ↓
标准化 input.schema.json
  ↓
Planner → Coder → Tester → Reviewer
```

开发者通常只需要描述任务、目标、范围、特殊约束和验收标准。项目规则、
默认验证命令、最大迭代次数和 Provider 配置由 Harness 自动补全。

当前 CLI 在缺少关键信息时返回 `harness:intake` 结构化失败结果；
后续可将该结果接入 VS Code Chat 或交互式前端，实现暂停后问答和恢复执行。

## Skill 调用方式

默认由 LLM 根据自然语言任务匹配 `.agents/skills/` 中的 Skill，开发者不需要手动输入 Skill 名称。
开发者可以显式指定 Skill 作为覆盖，例如“使用 `implement-vue-component` Skill”，
但 Harness 仍应检查该 Skill 是否存在并遵守项目规则。Skill 负责补充任务方法，
不替代输入契约、权限策略或最终验证。

## 质量门禁

产品或 Harness 配置发生变化后，至少执行：

```powershell
npm run harness:verify
npm run type-check
npm run test:unit
npm run build
```

核心原则：

1. Agent 只能修改 `src/` 产品目录。
2. `.github/`、`.agents/`、`.harness/`、`.claude/` 和 `scripts/` 默认受保护。
3. 最终结果必须满足输出契约。
4. 所有必要验证命令通过后，Reviewer 才能批准任务。
5. 不能把 Agent 的自我描述当作独立验证证据。
