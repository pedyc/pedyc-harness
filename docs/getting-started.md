# 从零接入 Harness

> 一次端到端走查:在一个已有项目里接入 pedyc-harness、声明治理配置、配一个 Provider,并跑完一次任务。
>
> **本文同时标注现状与目标。** 走查本身今天就能逐步执行;唯一的例外是「配置合成」——见第 5.1 节、
> 第 6 节与第 9 节的对照表,那里会说明它停在哪一步、以及为什么。

## 1. 前提

- Node.js `>=20`。
- 一个已有 `package.json` 的项目。本文以 Vue 3 + TypeScript + Vite 为例。
- `pedyc-harness` 与你要用的 Preset 包可被解析(已发布到 registry,或位于同一个 workspace)。

## 2. 接入:`init` 写入什么、不写什么

```bash
npm install --save-dev pedyc-harness
npx pedyc-harness init --preset vue
```

`init` 写入 7 个文件:

| 产物 | 来源 |
| ------------------------------------------- | ------------------------------------------ |
| `.harness/harness.json` | CLI 生成,只记录所选预设的**包名** |
| `AGENTS.md` | 预设的 `instruction` 文件 |
| `.harness/task.example.json` | CLI 内置模板 |
| `.harness/input.schema.json` | CLI 内置模板 |
| `.harness/output.schema.json` | CLI 内置模板 |
| `.harness/agent-response.schema.json` | CLI 内置模板 |
| `.harness/harness.schema.json` | CLI 内置模板 |

**它刻意不写 `policy.json` 与 `agents.json`。** 这两份文档留在 Preset 包里,由解析器在运行时读取;
项目要覆盖时自己放一份。这样升级预设只是一次依赖升级,而不是一次需要手工合并的 diff。

`init` 是幂等的:已存在的文件只要内容不同就保留并列出,只有 `--force` 才覆盖。`--preset` 的目标包
若尚未安装,`init` 会用探测到的包管理器装上它(`--no-install` 关掉这一步)。

详见 [CLI 契约](./interfaces/cli.md)。

## 3. 选一个基础 Preset

`init` 生成的清单:

```json
{
  "$schema": "https://pedyc.dev/schema/harness.json",
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"]
}
```

清单里的名字是**包名**。CLI 里没有预设表:一个裸词按约定展开为 `@pedyc/harness-preset-<词>`
(`vue` → `@pedyc/harness-preset-vue`),任何含 `/` 的值原样使用。因此团队与第三方预设只要装好就能用,
不需要往本包里注册什么。

```bash
npx pedyc-harness list-presets
# @pedyc/harness-preset-vue	declared
```

## 4. 在项目内声明自己的治理配置

三种写法,按优先级从高到低:

```jsonc
// a. 清单内联
{
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"],
  "policy": { "maxIterations": 2, "allowedProductPaths": ["src/", "tests/"] }
}
```

```jsonc
// b. 清单指向 .harness/ 内的文件(路径不得越出 .harness/)
{
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"],
  "policy": "policies/team.json"
}
```

```jsonc
// c. 约定路径:直接放 .harness/policy.json
```

### 优先级是「整份文档取舍」,不是字段合并

这是接入时最容易误判的一点。当前的解析规则是**选出哪一份文档生效**,四级依次尝试:

| 顺序 | 来源 | 说明 |
| ---- | ---------------------------------- | ------------------------------------------------------ |
| 1 | 清单里的 `policy` | 相对 `.harness/` 的路径,或内联文档 |
| 2 | `.harness/policy.json` | 项目的约定文件,压过所有预设 |
| 3 | 预设的 `policy` | 取**最后一个**声明了它的预设(解析结果依赖在前,故更具体的胜出) |
| 4 | 内置默认值 | 以上都没有时 |

`agents.json` 走完全相同的四级规则。

**因此:一旦你提供了自己的 `policy`,预设的 policy 会被整份忽略,而不是被叠加。** 以 vue 预设为例,
它自带四个闸门与 `src/` 边界:

```json
{
  "maxIterations": 3,
  "protectedPaths": [".github/", ".claude/", ".agents/", ".harness/", "scripts/"],
  "requiredChecks": ["harness:verify", "type-check", "test:unit", "build"],
  "forbiddenCommands": ["git reset --hard", "git checkout --", "npm publish"],
  "allowedAgentCommands": [],
  "allowedProductPaths": ["src/"],
  "agentTimeoutMs": 300000
}
```

你要在自己的 policy 里**重述**这些内容,否则四个闸门就没了。字段级合并不在当前实现里,它是
**目标(M17)**,见第 9 节。

另外,`Policy` 有四个字段在运行时**必须存在**,只写 `allowedProductPaths` 会被拒绝:
`allowedProductPaths`、`maxIterations`、`protectedPaths`、`requiredChecks`。完整字段表见
[Policy 契约](./interfaces/policy.md)。

## 5. 组合 / 继承第三方 Preset

```json
{
  "version": 1,
  "presets": ["@acme/harness-preset-motion", "@pedyc/harness-preset-vue"]
}
```

第三方预设自己的 `preset.json` 还可以继续继承:

```json
{
  "name": "@acme/harness-preset-motion",
  "extends": ["@acme/harness-preset-base"],
  "policy": "policy.json",
  "agents": "agents.json",
  "instruction": "AGENTS.md"
}
```

`extends` 只写包名,版本由 `package.json` 与 lockfile 承担。解析器递归加载、按包去重、检测循环并给出
完整环路,返回**依赖在前**的列表——所以「靠后的预设更具体」,而 `list-presets` 会标注每一项是
`declared` 还是 `inherited`:

```bash
npx pedyc-harness list-presets
# @acme/harness-preset-base	inherited
# @acme/harness-preset-motion	declared	extends: @acme/harness-preset-base
# @pedyc/harness-preset-vue	declared
```

**「组合」目前只做到「都解析出来」。** 多份 policy 之间不会合并:只有最后一个声明了 `policy` 的预设
会被采用。要让多个预设的治理同时生效,今天只能把内容写进项目自己的 policy。

### 5.1 两个 Preset 一起用时会发生什么

这是最容易误解的一步,值得走一遍。项目里同时声明两个领域预设:

```json
{
  "version": 1,
  "presets": ["@acme/harness-preset-motion", "@acme/harness-preset-minimal-design"]
}
```

它们各自声明的东西(概念形态):

```text
motion-preset                 minimal-design-preset
├── rules                     ├── rules
│   ├── animation-duration    │   ├── no-unnecessary-abstraction
│   │   kind=constraint       │   │   kind=constraint
│   │   150ms–400ms           │   └── prefer-design-tokens
│   └── prefer-transform      │       kind=preference
│       kind=preference       └── verification
└── verification                  └── unnecessary-abstraction(语义)
    └── animation-duration(结构)
```

**今天**:两个包都能被解析出来,但只有最后一个声明 `policy` 的预设生效,另一份被整份忽略;两者的
rules 与 verification 谁都不执行,`1s` 的动画时长也不会有人检查。

> **目标(M17、M8)** 目标形态把它们**编译**成一份生效治理,而不是挑一份文档:

```text
motion-preset + minimal-design-preset
        ↓ Preset Resolver(编译)
EffectiveGovernance
├── rules         两者并存;constraint 取交集,preference 追加
│                 ├── motion.animation-duration  <= 400ms(error)
│                 └── design.no-unnecessary-abstraction(error)
├── verification  两者都执行(union)
├── instructions  只取最后一个声明者(见 §5.2)
├── provenance    每条值来自哪个包与版本
└── conflicts     两个 Preset 对同一属性给出不同约束时,记录最终取值与理由
```

冲突不会静默解决:`constraint` 之间取交集,同 kind 按配置层级(`Task > Project > Team >
Organization > Global`),仍未定则**记入 `conflicts` 并取更严格者**。规则种类与合并语义见
[ADR-007](./decisions/ADR-007-rule-kinds-and-constraints.md)。

### 5.2 一次带多 Preset 的 Run(目标形态)

以 `npx pedyc-harness run --prompt "给按钮加一个淡入动效"` 为例:

```text
① intake      验收标准缺失 → 今天会直接失败并要求你补充(见第 10 节),不会猜
② resolve     两个 Preset → EffectiveGovernance(含 conflicts 与 provenance)
③ execute     Agent 修改 CSS:animation: fade-in 1s ease
④ verify      命令验证(type-check / test / build)
              + 结构验证(CSS 分析器给出 duration = 1s,规则比较 1s <= 400ms → 不满足)
⑤ scope       改动是否落在 allowedProductPaths 之内
⑥ review      Findings 按 severity → action 处置;越界一票否决
⑦ record      RunResult(结论)+ RunRecord(证据、范围、终止原因、provenance)
```

三条容易误解的边界:

- **实时拦截只对 Harness 自己启动的进程有效。** Agent 进程内部的写入只能事后从快照差异中发现,
  不存在"边写边 DENY"(见 [Runtime 架构](./architecture/runtime.md))。
- **「语义」只指需要模型的那一类验证。** 用 AST 读出 `1s` 属于**结构验证**,不需要 LLM。
- **多个 Preset 的 instruction 不合并。** instruction 只在 `init` 时播种项目的 `AGENTS.md` 一次,
  此后归项目所有;多个预设都提供时取最后一个。

## 6. 看生效了什么

`doctor` 会列出**配置来源**,这是判断「我的配置到底生效了没有」最直接的办法:

```bash
npx pedyc-harness doctor
```

```text
Project root: /path/to/project
Configuration: found
Package manager: npm
Node.js: v22.0.0
Configuration sources:
  manifest	.harness/harness.json
  policy	.harness/policy.json
  preset	@acme/harness-preset-motion
  preset	@pedyc/harness-preset-vue
```

读法与一处易错点:

- `policy` 那一行才是「谁提供了 policy」。上面这份输出说明项目自己的 `.harness/policy.json` 生效,
  两个预设的 policy 都**没有**被采用。
- `preset` 行表示「这次解析出了这些预设」,与它们的 policy 是否被采用是两件事。
- 带 `(declared, not yet consumed)` 的条目表示清单声明了、但还没有运行时消费它——目前 `verification`
  与 `rules` 就是这种情况。

**这里就是那条边界。** 今天能回答的是「哪份文档生效、为什么」;还不能回答「两个来源都声明了同一字段时
谁赢」,因为字段级合并属于 **M17**,尚未实现。

## 7. 配一个 Provider

`init` 之后**还不能直接跑**:`run` 需要一个真实的 Agent Provider,而默认的 `agents.json` 里
`coder`/`tester`/`reviewer` 指向的是占位符 `custom`,运行时会被拒绝。

先在项目里创建一个只做回声的适配器——它不修改任何文件,用来验证接线:

```js
// scripts/echo-adapter.mjs
const responses = {
  planner: { details: 'accepted', implementationPlan: ['Inspect the project.', 'Apply the change under src/.', 'Run the configured gates.'] },
  coder: { details: 'no file changes', changedFiles: [] },
  tester: { details: 'gates approved', approved: true, evidence: [{ command: 'configured gates', result: 'pass', details: 'All configured checks passed.' }] },
  reviewer: { details: 'approved', approved: true },
}
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  const request = JSON.parse(raw || '{}')
  process.stdout.write(JSON.stringify(responses[request.phase] ?? { details: 'unknown phase' }))
})
```

然后把它接进 `.harness/agents.json`(这份是项目级文档,会压过预设自带的那份):

```json
{
  "providers": { "echo": { "command": "node", "args": ["scripts/echo-adapter.mjs"] } },
  "planner": { "mode": "internal" },
  "coder": { "mode": "external", "provider": "echo" },
  "tester": { "mode": "external", "provider": "echo" },
  "reviewer": { "mode": "external", "provider": "echo" }
}
```

协议只有一条:stdin 收一个 JSON,stdout 回一个 JSON,诊断走 stderr,退出码 `0` 表示成功。判别字段是
`phase`。真实 Provider 在这里调用 Claude Code、Codex 或其他 Agent——本文这段回声适配器正是
`release:check` 用来验证发布物的那一个。

> `planner` 保持 `internal` 是刻意的:内置阶段直接通过,不需要 Provider。

详见 [Provider 契约](./interfaces/provider.md)。

## 8. 跑一次

先预览。`--dry-run` 不调用任何 Provider、不执行任何闸门、不修改产品文件:

```bash
npx pedyc-harness run --input .harness/task.example.json --dry-run --json
```

确认无误后正式运行:

```bash
npx pedyc-harness run --input .harness/task.example.json
```

也可以直接给一句话:

```bash
npx pedyc-harness run --prompt "给按钮加一个淡入动效"
```

一次运行固定走四个阶段:

```text
配置层解析 .harness/            ← 失败即退出码 5,不进入执行
        ↓
planner → coder → tester → reviewer
        ↓
.harness/runs/<runId>/{input,policy,iteration-<n>-verification,output}.json
```

其中 Tester 阶段的判定是两个独立条件的合取:**Harness 自己执行的闸门全部通过**,**且**外部 tester 认可
证据。Reviewer 阶段还会做范围检查——即使 Agent 批准,只要有文件落在 `allowedProductPaths` 之外就不
通过。见[验证契约](./interfaces/verification.md)与[系统架构](./architecture/system.md)。

> 项目侧还需要一件事:预设的 `requiredChecks` 是 `["harness:verify","type-check","test:unit","build"]`,
> 这些**必须作为脚本存在于你的 `package.json`** 中,否则 `verify` 与 `run` 会以退出码 `5` 拒绝启动。
> `harness:verify` 这个脚本的内容就是 `pedyc-harness verify`。

## 9. 现状与目标对照

| 走查步骤 | 现状 | 目标 |
| ---------------------------------------------- | ------------------------------------------------ | -------------------------- |
| Project 接入 Harness(`init` /schema/AGENTS.md) | ✅ 已实现 | — |
| 选择基础 Preset(约定式包名 + 安装) | ✅ 已实现 | Package Registry |
| 在项目内声明自己的治理配置 | ✅ 已实现,但**整份覆盖**预设 | 字段级合并 |
| 组合 / 继承第三方 Preset | ✅ 解析已实现(`extends` + 去重 + 环检测) | 解析结果参与合成 |
| 多 Preset 同时生效 | ⚠️ **只有最后一个声明 policy 的预设生效** | M17:按规则种类合并 + `conflicts` |
| 解析出 Effective Policy | ⚠️ **只做到「选出哪份文档生效」+ 来源报告** | **M17:字段级合并、deny-wins、provenance** |
| Agent 执行(四阶段 + Provider 协议) | ✅ 已实现 | — |
| Verification(Harness 自执行闸门 + tester 认可) | ✅ 已实现(结果层) | M8:退出码/stdout/耗时/时间戳 |
| 结构验证(AST 上的约束,如动画时长) | ❌ 无(验证只有包脚本一种形态) | M8:分析器产出事实 + 规则比较(ADR-007) |
| Gate(范围检查) | ✅ 已实现 | M9/M10:Trace/Audit 与人工审批 |

阶段划分与依赖顺序见[里程碑路线](./milestones/milestones.md)。

## 10. 常见失败与其含义

| 现象 | 含义 |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| 退出码 `5` + `Harness schema is missing: …` | 契约文件不全,重跑 `init` 或 `update` |
| 退出码 `5` + `references missing npm scripts: …` | 政策要求的闸门脚本不在 `package.json` 里(见第 8 节末尾) |
| 退出码 `5` + `preset_not_installed` | 清单声明的预设包没装 |
| 退出码 `5` + `preset_cyclic` | 预设继承成环,错误信息会给出完整环路 |
| `intake requires clarification` | 任务缺目标或验收标准;补上信息后重跑,而不是改配置 |
| Reviewer 报 `Out-of-scope files changed` | 改动落在 `allowedProductPaths` 之外 |
| `provider 'custom' is not configured` | 还在用占位符,按第 7 节换成真实 Provider |

## 11. 相关文档

- [CLI 契约](./interfaces/cli.md) — 命令、参数、产物与退出码
- [Core 契约](./interfaces/core.md) — 配置层契约与 16 个配置错误码
- [Preset 契约](./interfaces/preset.md) · [Policy 契约](./interfaces/policy.md)
- [Provider 契约](./interfaces/provider.md) · [验证契约](./interfaces/verification.md)
- [系统架构](./architecture/system.md) · [Preset 架构](./architecture/preset.md)
- [文档导航](./README.md) · [文档规范](./CONVENTIONS.md)
