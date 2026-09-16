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

当前 Preset 的核心接口：

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

Preset 本质上是一组：

```text
Policy Defaults
+
Verification Defaults
+
Project Templates
```

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

Preset 可以携带模板：

```text
templates/
├── AGENTS.md
├── policy.json
├── evaluation.json
└── …
```

这些模板用于：

```bash
pedyc-harness init
```

生成目标项目中的 Harness 文件。

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

当前 Registry 是 CLI 内置的静态表（`packages/cli/src/presets.ts`）。目标形态是由 npm 承担分发与
版本，Harness 只负责递归解析、合并和校验，见 [§13](#13-preset-分发npm-是分发层)。

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

> 以下内容描述目标形态，尚未实现。当前实现与目标的差距见 [§21](#21-当前实现与目标)。

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

Preset package 的结构：

```text
@acme/harness-preset/
├── package.json
├── preset.json
├── policies/
│   ├── security.json
│   ├── commands.json
│   └── scope.json
├── verification/
│   ├── typecheck.json
│   └── test.json
└── rules/
    └── frontend.md
```

`package.json`：

```json
{
  "name": "@acme/harness-preset",
  "version": "1.2.0",
  "type": "module",
  "files": ["preset.json", "policies", "verification", "rules"],
  "peerDependencies": {
    "pedyc-harness": "^1.0.0"
  }
}
```

`preset.json` 描述「这个 Preset 继承什么、提供什么」：

```json
{
  "$schema": "https://pedyc.dev/schema/preset.json",

  "name": "@acme/harness-preset",

  "extends": ["@pedyc/harness-preset-web"],

  "policy": "./policies/security.json",

  "verification": "./verification/typecheck.json",

  "rules": ["./rules/frontend.md"]
}
```

两点约定：

```text
extends 只写包名，不写版本
```

版本由 `package.json` 的依赖声明和 lockfile 决定，见 [§16](#16-版本交给-npm)。

```text
相对路径只指向包内文件
```

Preset 不允许引用安装它以外的项目路径，否则 Preset 就不再是可复用的发布物。

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

循环依赖必须被显式拒绝，而不是让调用栈溢出：

```ts
const visiting = new Set<string>()
const resolved = new Set<string>()

async function resolvePreset(name: string) {
  if (resolved.has(name)) {
    return
  }

  if (visiting.has(name)) {
    throw new CircularPresetError(name)
  }

  visiting.add(name)

  const preset = await loadPreset(name)

  for (const dependency of preset.extends ?? []) {
    await resolvePreset(dependency)
  }

  visiting.delete(name)
  resolved.add(name)

  result.push(preset)
}
```

错误信息必须包含完整环路：

```text
HarnessError: Circular preset dependency detected

A
→ B
→ C
→ A
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

Runtime 只接受 `EffectiveHarnessConfig`，不关心某个值来自哪个 Preset、哪一层配置。

但来源信息必须保留为 provenance 并写入 Run Record：审计需要回答「这次运行为什么用这条
Policy」。类型定义见 [核心接口设计](./核心接口设计.md)。

用户不需要理解多层 Preset：安装一个包，在 `harness.json` 中声明一次，其余由 Harness 自动解析。

---

### 21. 当前实现与目标

当前实现：

```text
packages/core/src/contracts/preset.ts   Preset 类型（TS 对象）
packages/cli/src/presets.ts             CLI 内置静态 Registry
packages/preset-generic, preset-vue     两个官方 Preset
harness init --preset <name>            复制模板文件到目标项目
```

目标形态：

```text
Preset = npm package + preset.json
harness.json = 项目治理入口（Manifest）
Preset Resolver = DAG 解析 + 循环检测 + 拓扑排序
Config Resolver = 按字段合并语义合成 EffectiveHarnessConfig
```

差距清单：

| 能力                       | 当前         | 目标               |
| -------------------------- | ------------ | ------------------ |
| Preset 发现                | CLI 内置表   | npm 解析           |
| Preset 继承                | 不支持       | `extends` + DAG    |
| 版本归属                   | package.json | package.json（不变） |
| 项目配置入口               | 无           | `.harness/harness.json` |
| 配置合并语义               | 未定义       | MergeStrategy 表   |
| EffectiveHarnessConfig     | 无           | Runtime 唯一输入   |

阶段目标与验收标准见 [里程碑路线](./milestones.md)。

---

### 22. 设计原则（补充）

11. Preset 是 npm package，Harness 不自建分发与 registry。
12. `extends` 只写包名，版本交给 `package.json` 与 lockfile。
13. Preset 依赖是 DAG，必须做去重、循环检测和拓扑排序。
14. 配置合并由字段级 Merge Strategy 定义，不是通用 deep merge。
15. 安全约束只能收紧，不能放宽；个人层级同样不能突破组织约束。
16. Runtime 只消费 `EffectiveHarnessConfig`，但必须保留 provenance 以支持审计。
