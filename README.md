# Pedyc-Harness：我的harness工程实践

> **Run AI agents under explicit contracts, policies, and verification gates.**
>
> 让 Agent 在契约、策略和独立验证的约束下可靠执行任务。

这是一个 **Agent 治理层**（Agent Harness）项目：它不实现 Agent 自身的推理能力，
Claude Code、Codex 这类 Coding Agent 是它接入并约束的执行组件。Harness 回答的是
「这次任务允许 Agent 干什么」和「干完之后凭什么算数」，因此核心资产是契约、策略、
独立验证、证据和审计，而不是模型能力。**Agent 越强，Harness 越重要。**

仓库同时包含一个 Vue 3 + TypeScript + Vite 产品演示项目，作为第一个集成宿主。
定位、设计原则、能力优先级和**明确不做**的方向见 [项目目标](./docs/项目目标.md)；
已经做到哪一步见 [里程碑路线](./docs/milestones.md)。

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
  - [x] 生成配置默认不启用任何 Provider（v1.0 起，`verify` 与 `run --dry-run` 无需 Provider）
  - [x] 可在 `.harness/agents.json` 增加 Copilot 或其他 Provider
- [x] 真实 Coder 闭环验证
  - [x] Planner、Coder、Tester、Reviewer 流程成功跑通
  - [x] `harness:verify` 通过
  - [x] `type-check` 通过
  - [x] `test:unit` 通过
  - [x] `build` 通过
- [x] CI Harness 门禁

## 待办清单

完整的工作项与验收标准见 [里程碑路线](./docs/milestones.md)，这里只保留当前进度，
避免同一份计划在多个文件里各自漂移。**明确不做**的方向见
[项目目标](./docs/项目目标.md) 第四节，不列在此处。

### 第二阶段：治理能力（M7–M11）

- [ ] M7 让策略真正可执行：`protectedPaths` 和 `forbiddenCommands` 当前只是声明性字段，
      无任何拦截效果
- [ ] M8 独立验证与证据链：每条门禁的退出码、耗时和输出摘要写入 `output.json`
- [ ] M9 执行轨迹与审计：事件流、阶段耗时、`runs list/show`、运行记录保留策略
- [ ] M10 审批门：高风险任务的可选人工节点
- [ ] M11 发布 v1.1.0

### 尚未排期

- [ ] 在允许 Claude CLI 执行后验证四阶段真实闭环成功
- [ ] 完整提示词分层：把 core + preset + AGENTS.md 显式注入每次请求

### 工程质量

- [ ] 增加越权修改、无修改任务和命令失败场景测试
- [ ] 增加符号链接、路径穿越和删除文件场景的安全测试
- [ ] 增加多任务、并发和长任务场景验证
- [ ] 增加 Playwright E2E 测试
- [ ] 增加 ESLint
- [ ] 增加 Prettier
- [x] 在 CI 中执行 Harness dry-run 和更多失败路径测试

## 目录职责

| 目录 | 用途 |
| --- | --- |
| `src/` | 产品演示代码，仅放 Vue 组件和页面 |
| `.github/` | GitHub Agent、Instructions、CI 和配置校验 |
| `.agents/skills/` | 可复用的任务技能 |
| `.harness/` | 输入/输出契约、策略、评估、Agent 配置和运行记录 |
| `packages/` | Core、CLI 和 Preset 的 workspace 发布包 |
| `scripts/harness/` | 发布包的兼容入口（薄封装）、Provider Adapter、样例与发布校验脚本 |
| `examples/` | 外部项目样例和兼容性验收项目 |
| `.claude/` | Claude Code 入口和权限相关配置 |
| `tests/` | 产品组件和 Harness 配置测试 |

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

发布包共有四个，全部为 `1.0.1`、同步发布：

| 包 | 用途 |
| --- | --- |
| `pedyc-harness` | CLI，内含 Preset Registry 和 Schema 模板，可独立安装 |
| `@pedyc/harness-core` | Runtime 原语，不依赖 Vue |
| `@pedyc/harness-preset-generic` | 通用契约与安全策略 |
| `@pedyc/harness-preset-vue` | Vue 3 + TypeScript + Vite 约定 |

CLI 不假设用户安装或登录了任何 Agent CLI：生成的 `agents.json` 不含 Provider，
`verify` 和 `run --dry-run` 无需 Provider 即可使用。

详细设计见 [`docs/`](./docs/README.md)，发布规则见 [发布与版本规则](./docs/release.md)。

本仓库使用 pnpm 管理依赖，目标项目仍兼容 npm、pnpm 和 yarn。Harness Runtime 会根据
锁文件选择验证命令对应的包管理器。

`examples/` 中的 `generic-project`、`vue-project` 和 `node-project` 用真实的最小项目验证
这一点，可执行 `npm run verify:examples` 复现。

## 常用命令

```powershell
# 配置完整性检查
npm run harness:verify

# 外部项目样例验收（init、verify、dry-run、doctor）
npm run verify:examples

# 发布前检查：打包四个包并在临时消费者项目中跑通 CLI
npm run release:check

# 单元测试
npm run test:unit

# 类型检查
npm run type-check

# 构建
npm run build

# 安全预览：不调用 Provider、不执行验证命令、不修改产品代码
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
npm run verify:examples
npm run release:check
npm run type-check
npm run test:unit
npm run build
```

核心原则（完整列表见 [项目目标](./docs/项目目标.md) 第二节）：

1. **不能把 Agent 的自我描述当作独立验证证据**——所有门禁由 Tester 独立执行并记录证据。
2. Agent 只能修改 `src/` 产品目录，这条由 `allowedProductPaths` 强制执行。
3. `.github/`、`.agents/`、`.harness/`、`.claude/` 和 `scripts/` 在 `policy.json` 中列为
   `protectedPaths`，但**当前尚未强制拦截**，属于 M7 的工作。
4. 所有必要验证命令通过后，Reviewer 才能批准任务。
5. 最终结果必须满足输出契约。
