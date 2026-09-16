## Preset 设计

> Preset 是项目类型相关的 Harness 默认能力集合。
>
> Preset 不属于 Core，也不应该让 Core 感知具体技术栈。

---

### 1. 设计目标

不同项目具有不同的：

- 文件范围
- 保护目录
- 检查命令
- Agent 指令模板
- Skill 模板
- 项目初始化文件

例如：

```text
Generic
Vue
React
Node
Python
…
````

这些差异不应该进入 Core。

因此：

```text
Core
  ↓
通用 Harness 能力

Preset
  ↓
项目类型知识
```

---

### 2. HarnessPreset

早期设计里的 Preset 是一个内存中的 TypeScript 对象：

```ts
type HarnessPreset = {
  name: string

  allowedProductPaths: string[]

  protectedPaths: string[]

  requiredChecks: CheckDefinition[]

  instructionTemplates: string[]

  agentTemplates: string[]

  skillTemplates: string[]
}
```

M16 之后这条路线被放弃：Preset 不再是模块，而是一份数据（`preset.json`）加若干文档。
`Preset` / `PresetDetection` 契约已从 `packages/core/src/contracts/preset.ts` 移除，取而代之的是：

```ts
interface PresetManifest {
  name: string          // npm 包名，必须与被解析到的包一致
  extends?: string[]    // 只写包名，不写版本
  policy?: string       // 包内相对路径
  agents?: string
  instruction?: string
  verification?: string // 已声明，运行时尚无消费者
  rules?: string[]      // 已声明，运行时尚无消费者
}

interface ResolvedPreset {
  packageName: string   // 正在被解析的包名（可能是短名展开而来）
  name: string          // preset.json 里声明的名字
  directory: string     // 包的安装目录
  extends: string[]     // 展开成包名后的直接父级
  manifest: PresetManifest
}
```

`packageName` 与 `manifest.name` 是两个不同的东西：前者是解析入口，后者是包对自己的声明，
两者必须相等——不一致会在解析时报 `preset_manifest_invalid`，因为 `extends` 和所有错误信息
都按包名寻址。

Preset 本质上是一组：

```text
Policy Defaults
+
Verification Defaults
+
Project Templates
```

只是这三样都以文件形式放在包内，由 Resolver 按需读取，而不是由 TypeScript 导出。

---

### 3. Generic Preset

Generic Preset 提供与具体技术栈无关的默认能力。

例如：

```text
通用目录策略
通用安全规则
基础验证模板
基础 Agent 指令
```

目标是：

> 即使项目没有明确技术栈，也能够获得最小可用 Harness 配置。

---

### 4. Vue Preset

Vue Preset 面向：

```text
Vue 3
TypeScript
Vite
```

可以提供：

```text
Vue 项目目录规则
TypeScript 检查
Vite 构建检查
Vue-specific Agent instructions
```

例如：

```text
src/
components/
composables/
```

以及：

```bash
npm run typecheck
npm run build
```

但这些规则属于 Preset，不属于 Core。

---

### 5. Preset 与 Core 的边界

错误：

```ts
if (project.type === "vue") {
  …
}
```

出现在 Core。

正确：

```text
Vue Preset
    ↓
生成 HarnessPolicy
    ↓
Core
```

Core 只处理：

```text
Policy
Contract
Execution
Verification
Diff
Review
```

不处理：

```text
Vue
React
Vite
Webpack
```

---

### 6. Preset 与项目配置

Preset 提供默认值。

项目可以覆盖这些默认值。

可以理解为：

```text
Preset Defaults
      ↓
Project Configuration
      ↓
Task-specific Configuration
```

优先级应保持明确。

原则：

> Preset 是默认能力，不是不可修改的全局规则。

但「可覆盖」只适用于默认值类配置。安全类约束只能收紧，不能放宽，具体合并语义见
[§17](#17-配置合成语义) 与 [§18](#18-preset-与-policy-constraint)。

---

### 7. Templates

Preset 携带文档：

```text
preset.json
policy.json
agents.json
AGENTS.md
```

需要区分：

```text
npm package 中的模板
```

和：

```text
用户项目中实际生成的文件
```

Preset package 属于发布物。

`.harness/`、`AGENTS.md` 等属于目标项目。

M16 之前 `init` 会把 Preset 的 `policy.json` / `agents.json` 复制进目标项目，于是同一份治理
有两个副本，升级 Preset 变成一次需要人工合并的 diff。现在这两个文件留在包里由 Resolver 读取，
只有契约文件（`.harness/*.schema.json`、`.harness/task.example.json`）和 Manifest 会写进项目，
`AGENTS.md` 在缺失时由 Preset 的 `instruction` 播种。

---

### 8. Init 行为

初始化应该满足：

> **幂等 + 默认不覆盖。**

第一次：

```bash
pedyc-harness init
```

生成：

```text
.harness/
AGENTS.md
…
```

再次执行：

```bash
pedyc-harness init
```

不应该无条件覆盖用户修改。

因此需要明确：

```text
不存在 → 创建
存在且相同 → 跳过
存在且不同 → 保留并提示
```

如果用户明确要求：

```bash
--force
```

才允许覆盖。

M16 起 `init` 在同一个前提下多做一件事：若声明的 Preset 还不可解析，就按检测到的包管理器安装它
（`--no-install` 可关掉）。Preset 是依赖，光写 Manifest 而不装包只会让下一次运行在配置阶段失败。
Manifest 已存在且声明了自己的 Preset 时，`init` 会保留它并明确说出来，而不是让调用方以为新的
`--preset` 生效了。

---

### 9. Update

Preset 更新与 Init 不完全相同。

未来可以支持：

```bash
pedyc-harness update
```

用于：

```text
Preset version
    ↓
Project generated configuration
```

的迁移。

但 Update 必须避免：

> 用新模板静默覆盖用户已经修改的项目配置。

因此未来需要考虑：

```text
template version
migration
conflict detection
```

M16 起 `update` 的语义随之收窄：它只同步契约文件，不再有「把 Preset 的内容迁移进项目」这一步，
因为 Preset 的内容从未被复制进项目。Preset 升级就是依赖升级，`policy.json` 与 `agents.json`
的读取路径不含项目副本，也就不存在被新模板覆盖的风险。

---

### 10. Preset Registry

CLI 可以维护 Preset Registry：

```ts
interface PresetRegistry {
  resolve(name: string): HarnessPreset
}
```

例如：

```text
generic → @pedyc/harness-preset-generic
vue     → @pedyc/harness-preset-vue
```

CLI 负责发现 Preset。

Core 不应该知道：

```text
generic
vue
```

这些名字。

M16 之前 Registry 是 CLI 内置的静态表（`packages/cli/src/presets.ts`），新增 Preset 要改这个仓库
的源码。现在只剩一条命名约定：

```text
不含 / 的名字 → @pedyc/harness-preset-<name>
含 / 的名字   → 原样当作包名
```

这条约定属于 CLI，不属于 Core：`presetPackageName` 是一个纯函数，Core 的 `resolvePresets`
只接受包名。因此 `@acme/web` 这类团队 Preset 不需要在本仓库注册任何东西，也不需要 Core 认识
`generic` 或 `vue`，见 [§13](#13-preset-分发npm-是分发层)。`list-presets` 打印的是实际解析到的
包及其继承关系，而不是任何一张表。

---

### 11. 当前 Preset

当前项目已经拆分为独立 package：

```text
@pedyc/harness-preset-generic
@pedyc/harness-preset-vue
```

这种拆分的目的不是增加 package 数量，而是保持：

```text
Core
    ↓
技术栈无关

Preset
    ↓
技术栈相关
```

两个包都是**纯数据包**：只有 `preset.json`、`policy.json`、`agents.json`、`AGENTS.md`，
没有 `src/`、没有 `dist/`、没有 `build` 脚本，也没有对 `@pedyc/harness-core` 的依赖。
`exports` 只暴露 `./preset.json`，这也是 Resolver 定位一个 Preset 的方式。

---

### 12. 设计原则

1. Preset 提供默认能力。
2. Preset 不进入 Core。
3. 技术栈判断不应该污染 Core。
4. Template 属于 Preset。
5. Init 默认不覆盖。
6. Force 才允许显式覆盖。
7. Preset 可以演进，但必须保护用户修改。
8. Preset 不负责 Runtime orchestration。
9. Preset 不负责最终 Verification。
10. Preset 不等于 Project Configuration。

---

## 进阶设计：npm 化 Preset 与配置合成

> M16 已实现分发、解析与继承（[§13](#13-preset-分发npm-是分发层)–[§16](#16-版本交给-npm)、
> [§20](#20-解析管线) 的 Preset Resolver 一段）。**配置合成仍是目标形态**：字段级合并、
> provenance 与 `EffectiveHarnessConfig` 属于 M17，见 [§21](#21-当前实现与目标)。

---

### 13. Preset 分发：npm 是分发层

Preset 生态的关键判断是：

> **不要自己发明一套 Preset 上传 / 下载机制。**

正确分工：

```text
npm
  ↓
分发、版本、依赖

Harness
  ↓
解析、递归加载、合并、校验
```

因此 Preset 本身就是普通 npm package：

```text
@pedyc/harness-preset-generic
@pedyc/harness-preset-vue
@acme/harness-preset
@acme/harness-preset-frontend
@alice/harness-preset-react
```

对 Runtime 来说，官方 Preset、公司 Preset、个人 Preset 没有区别：

> 它只需要知道「这是一个合法的 Harness Preset」。

它不需要知道这个人是谁、这个组织是谁、是不是官方发布的。

收益是立即可得的：

```text
public package
private package
GitHub Package Registry
企业自建 npm registry
```

企业场景尤其重要：私有 Preset 复用现有私有 registry 即可，不需要 Harness 提供一个额外的
凭证体系和托管服务。

---

### 14. preset.json

Preset package 的结构（两个官方 Preset 的实际形状）：

```text
@pedyc/harness-preset-vue/
├── package.json
├── preset.json
├── policy.json
├── agents.json
├── AGENTS.md
└── README.md
```

文档可以按任意目录组织——`policies/`、`verification/`、`rules/` 都只是路径——但路径必须在包内。

`package.json`：

```json
{
  "name": "@pedyc/harness-preset-vue",
  "version": "1.2.0",
  "files": ["preset.json", "policy.json", "agents.json", "AGENTS.md", "README.md"],
  "exports": {
    "./preset.json": "./preset.json"
  }
}
```

没有 `type`、没有 `main`、没有 `dependencies`：包不导出模块，只导出文档。`exports` 里的
`./preset.json` 是 Resolver 的入口，也是唯一需要存在的子路径。

`preset.json` 描述「这个 Preset 继承什么、提供什么」：

```json
{
  "$schema": "https://pedyc.dev/schema/preset.json",

  "name": "@pedyc/harness-preset-vue",

  "extends": [],

  "policy": "policy.json",

  "agents": "agents.json",

  "instruction": "AGENTS.md"
}
```

字段（`schemas/preset.schema.json` 是唯一来源，且 `additionalProperties: false`）：

| 字段           | 含义                                              | 运行时消费者           |
| -------------- | ------------------------------------------------- | ---------------------- |
| `name`         | 包名，必须与被解析到的包一致                      | Resolver 校验           |
| `extends`      | 直接父级包名，只写包名不写版本                    | Resolver                |
| `policy`       | 包内 Policy 文档路径                              | Config Loader           |
| `agents`       | 包内 Agent 配置文档路径                           | Config Loader           |
| `instruction`  | 用于播种目标项目 `AGENTS.md` 的 Markdown 路径      | `init`                  |
| `verification` | 已声明，运行时尚无消费者                          | 无（前向兼容）          |
| `rules`        | 已声明，运行时尚无消费者                          | 无（前向兼容）          |

两点约定：

```text
extends 只写包名，不写版本
```

版本由 `package.json` 的依赖声明和 lockfile 决定，见 [§16](#16-版本交给-npm)。

```text
相对路径只指向包内文件
```

Preset 不允许引用安装它以外的项目路径，否则 Preset 就不再是可复用的发布物。这条约定由
Resolver 强制：绝对路径、`..` 与 `.` 都会报 `preset_path_outside_package`，指向包内不存在的
文件则报 `config_file_missing`。

Preset 自己也可以继承 Preset，这就解决了「多层 Preset 如何加载」。

---

### 15. Preset 依赖图：DAG 而不是树

单个 Preset 只有一个父级时看起来像树：

```text
                 @pedyc/harness-base
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
       @pedyc/harness-web     @pedyc/harness-node
              │
              ↓
      @pedyc/harness-vue
              │
              ↓
       @acme/harness-frontend
              │
              ↓
          Project
```

但共享基础 Preset 后必然出现菱形：

```text
                base
              /      \
             ↓        ↓
           web       security
             \        /
              ↓      ↓
              acme
                ↓
             project
```

因此内部模型不是：

```text
Preset → Child Preset
```

而是：

```text
Preset Dependency Graph（DAG）
```

加载算法是递归 DFS + 去重 + 循环检测：

```text
Project
 ├── acme
 │    ├── web
 │    │    └── base
 │    └── security
 │         └── base
 └── vue
      └── web
```

解析顺序：

```text
load(project)
    ↓
load(acme)
    ↓
load(web)
    ↓
load(base)
    ↓
load(security)
    ↓
base 已加载 → skip
    ↓
load(vue)
    ↓
web 已加载 → skip
```

最终拓扑顺序（依赖在前）：

```text
base
web
security
acme
vue
project
```

每个 Preset 在一条解析链中只加载一次。

循环依赖必须被显式拒绝，而不是让调用栈溢出。`packages/core/src/config/presets.ts` 的实现是
深度优先后序遍历，三个性质由同一段代码给出：`done` 让一个 Preset 无论被多少条链到达都只加载
一次（去重），后序入队让依赖排在使用者之前（拓扑排序），而 `stack` 里再次遇到同一个包就是环：

```ts
const done = new Map<string, ResolvedPreset>()
const order: ResolvedPreset[] = []
const stack: string[] = []

const visit = (packageName: string, requiredBy?: string): HarnessConfigError[] => {
  if (done.has(packageName)) return []

  const entered = stack.indexOf(packageName)
  if (entered >= 0) {
    const loop = [...stack.slice(entered), packageName].join(' → ')
    return [configError('preset_cyclic', packageName, `Cyclic preset dependency: ${loop}.`)]
  }

  const located = locate(root, resolveFrom, packageName, requiredBy)
  if ('errors' in located) return located.errors

  stack.push(packageName)

  for (const parent of located.value.manifest.extends ?? []) {
    const errors = visit(presetPackageName(parent), packageName)
    if (errors.length > 0) return errors
  }

  stack.pop()
  const preset: ResolvedPreset = { /* … */ }
  done.set(packageName, preset)
  order.push(preset)
  return []
}
```

`done` 只在子树全部解析成功后才写入，所以环不会被误判成「已加载」；`stack` 是数组而不是集合，
是为了在报错时用 `slice(entered)` 切出环路本身：

```text
Cyclic preset dependency: @acme/a → @acme/b → @acme/c → @acme/a.
A preset cannot inherit from itself, directly or through another preset.
```

---

### 16. 版本：交给 npm

`harness.json` 不记录 Preset 版本：

```json
{
  "presets": [{ "name": "@acme/harness-preset", "version": "1.2.0" }]
}
```

而是：

```json
{
  "presets": ["@acme/harness-preset"]
}
```

原因：

```text
package.json
package-lock.json
harness.json
```

三处版本信息必然漂移。

因此：

```text
harness.json
     ↓
npm install
     ↓
node_modules
     ↓
Preset Resolver
```

```text
node_modules/
├── @pedyc/
│   ├── harness
│   └── harness-preset-web
└── @acme/
    └── harness-preset
```

版本冲突、peer 依赖、嵌套安装全部复用 npm 的解析机制，Harness 不再实现一个版本解析器。
这与 [发布与版本规则](./release.md) 中「workspace 内四包同步版本」是两件事：前者约束官方
发布单元，后者只是 npm 消费者侧的依赖解析。

---

### 17. 配置合成语义

配置系统不能只实现：

```ts
deepMerge(a, b)
```

因为 `protectedPaths` 可以安全地取并集，而 `allowedPaths` 是否允许被覆盖必须被显式定义，
更危险的是：

```json
{
  "protectedPaths": [".harness"]
}
```

项目配置能不能把它去掉？答案必须是：

> **不能。**

所以每个字段都必须声明自己的合并语义：

```ts
export type MergeStrategy =
  | "replace"
  | "merge"
  | "append"
  | "deny-wins"
  | "immutable"
```

各类字段的默认语义：

| 语义        | 含义                             | 典型字段                                        |
| ----------- | -------------------------------- | ----------------------------------------------- |
| `replace`   | 高优先级整体替换                 | `allowedPaths` 的默认值、`verification` 默认命令 |
| `append`    | 追加、去重、不能删除已有项       | `protectedPaths`、`forbiddenCommands`、`rules`  |
| `merge`     | 按 key 递归合并                  | `agents`、结构化配置对象                        |
| `deny-wins` | 只要出现过禁止，任何层级不能解除 | 命令与路径的禁止项                              |
| `immutable` | 完全不可覆盖                     | 安全不变量（见 [§18](#18-preset-与-policy-constraint)） |

一条总原则：

```text
低优先级的安全约束
        ↓
高优先级只能收紧，不能放宽
```

普通默认值则相反，遵循：

```text
Project > Team > Organization > Community > Base
```

合并语义必须由单一模块实现，不能一部分在 Preset Resolver、一部分在 Policy Engine，否则规则
语义会漂移。

示例：

```text
@pedyc/harness-preset-web   protectedPaths = [".env"]
@acme/harness-preset        protectedPaths = ["infra", ".github"]
project                     protectedPaths = ["production"]
```

Effective Policy：

```json
{
  "protectedPaths": [".env", ".github", "infra", "production"]
}
```

而不是项目覆盖公司。

---

### 18. Preset 与 Policy Constraint

需要把两个概念拆开：

```text
Preset
  ↓
提供默认能力
Policy / Verification / Agent / Rules
可以被继承，也可以被覆盖

Policy Constraint
  ↓
提供不可突破的约束
禁止访问生产环境
禁止修改 .env
禁止执行 rm -rf
必须人工审批
不能被普通 Preset override
```

因此存在两套不同的合并语义：

```text
Preset
  ↓
Preset
  ↓
Project
```

与：

```text
Security Constraint
  ↓
Security Constraint
  ↓
Security Constraint
```

后者只能追加和收紧。个人层级的 Preset 同样不能突破组织或项目的安全约束：

```text
个人 Preset：允许 git push
公司 Preset：禁止 git push
        ↓
      DENY
```

所以配置层级不是简单的：

```text
lower → higher override
```

而是：

```text
Convenience defaults
        ↓
Project policy
        ↓
Organization policy
        ↓
Security invariants
```

---

### 19. 层级：Global → Organization → Team → Project → Task

目标优先级层级：

```text
Global（个人）
   ↓
Organization
   ↓
Team
   ↓
Project
   ↓
Task
```

对应到包名与目录：

```text
@pedyc/harness-preset-web
        ↓
@company/harness-preset
        ↓
@company/harness-preset-frontend
        ↓
project/.harness/
        ↓
task.json
```

```json
{
  "extends": [
    "@pedyc/harness-preset-web",
    "@company/harness-preset",
    "@company/harness-preset-frontend"
  ]
}
```

最终合成：

```text
基础安全规则
        +
公司安全规则
        +
前端团队规则
        +
项目特殊规则
        +
当前任务规则
        ↓
EffectiveHarnessConfig
```

个人层可以落在本地目录（例如 `~/.pedyc/harness/presets/`）或自己的 npm 包，但同样受
[§18](#18-preset-与-policy-constraint) 的约束：**个人层级不能放宽组织或项目的安全约束。**

---

### 20. 解析管线

Preset Resolver 与 Config Resolver 是两个不同的职责：

```text
                harness.json
                     │
                     ↓
              Root Presets
                     │
                     ↓
             Preset Resolver
                     │
          ┌──────────┴──────────┐
          ↓                     ↓
     npm package          local preset
          │                     │
          └──────────┬──────────┘
                     ↓
              Dependency Graph
                     ↓
              Cycle Detection
                     ↓
              Topological Sort
                     ↓
              Preset Validation
                     ↓
             Config Resolver
                     ↓
            EffectiveHarnessConfig
                     ↓
              Harness Runtime
```

M16 落地的是上半段：`resolvePresets` 负责 Dependency Graph、Cycle Detection、Topological Sort
与 Preset Validation，`locate` 负责从 npm 解析包。管线里只剩 **npm package** 一条路径，
`local preset` 尚未实现（M18 的团队 Preset 仍走 npm，本地目录不在计划内）。

下半段属于 M17。当前 `Config Loader` 做的是**来源选择**而不是字段合并：按
Manifest 声明 → 项目约定位置 → Preset（拓扑序最后一个）→ 内置默认值取一份完整文档，
不混合两个来源的字段。因此 Runtime 现在消费的还是 `LoadedHarnessConfig`，
`EffectiveHarnessConfig` 要到 M17 才出现。

Runtime 只接受 `EffectiveHarnessConfig`，不关心某个值来自哪个 Preset、哪一层配置。

但来源信息必须保留为 provenance 并写入 Run Record：审计需要回答「这次运行为什么用这条
Policy」。类型定义见 [核心接口设计](./核心接口设计.md)。

用户不需要理解多层 Preset：安装一个包，在 `harness.json` 中声明一次，其余由 Harness 自动解析。

---

### 21. 当前实现与目标

当前实现（M16 之后）：

```text
schemas/preset.schema.json              Preset Manifest 契约（唯一副本，随 core 发布）
packages/core/src/contracts/preset.ts   PresetManifest / ResolvedPreset（纯类型）
packages/core/src/config/presets.ts     resolvePresets：npm 定位 + DAG 解析 + 环检测 + 拓扑排序
packages/core/src/config/loader.ts      来源选择：Manifest → 项目约定位置 → Preset → 默认值
packages/cli/src/presets.ts             presetPackageName 短名展开 + 安装 + 读取 instruction
packages/preset-generic, preset-vue     两个官方 Preset（纯数据包）
harness init --preset <name>            写 Manifest 与契约文件；Preset 不可解析时安装它
harness list-presets                    列出实际解析到的包、来源与继承关系
```

目标形态：

```text
Preset = npm package + preset.json
harness.json = 项目治理入口（Manifest）
Preset Resolver = DAG 解析 + 循环检测 + 拓扑排序
Config Resolver = 按字段合并语义合成 EffectiveHarnessConfig
```

差距清单：

| 能力                   | M16 之后                                  | 目标                        |
| ---------------------- | ----------------------------------------- | --------------------------- |
| Preset 发现            | npm 解析（`require.resolve` + `exports`） | npm 解析（不变）            |
| Preset 继承            | `extends` + DAG，含去重、环检测、拓扑排序 | 不变                        |
| 版本归属               | package.json                              | package.json（不变）        |
| 项目配置入口           | `.harness/harness.json`                   | 不变                        |
| Preset 与项目优先级    | 整份文档取值，项目优先于 Preset           | 字段级 MergeStrategy        |
| 配置合并语义           | 未定义                                    | MergeStrategy 表            |
| EffectiveHarnessConfig | 无                                        | Runtime 唯一输入            |
| 来源可追溯             | `doctor` 报告来源；无逐字段 provenance    | provenance 写入 Run Record  |
| 安全约束不可放宽       | 未实现（项目可以覆盖 Preset 的任何字段）  | Constraint 合并语义（M19）  |
| Preset 发现与搜索      | 无（只有短名约定）                        | `search` 等生态能力（M20）  |
| 本地 Preset            | 不支持                                    | 未在计划内                  |

最后一行不是欠账：Preset 的三个来源（官方 / 组织 / 团队）在 M16 的实现里是同一个机制，
区别只在包名和 registry。本地目录会引入第二条解析路径和一套不同的信任模型，需要时再单独定义。

阶段目标与验收标准见 [里程碑路线](./milestones.md)。

---

### 22. 设计原则（补充）

11. Preset 是 npm package，Harness 不自建分发与 registry。
12. `extends` 只写包名，版本交给 `package.json` 与 lockfile。
13. Preset 依赖是 DAG，必须做去重、循环检测和拓扑排序。
14. 配置合并由字段级 Merge Strategy 定义，不是通用 deep merge。
15. 安全约束只能收紧，不能放宽；个人层级同样不能突破组织约束。
16. Runtime 只消费 `EffectiveHarnessConfig`，但必须保留 provenance 以支持审计。
