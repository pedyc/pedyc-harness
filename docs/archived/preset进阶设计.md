> **本文是设计讨论的输入材料，不是规范。**
>
> 结论已经并入 [项目目标](../项目目标.md)、[系统架构](../architecture/system.md)、
> [Preset 设计](../architecture/preset.md)、[Policy 设计](../architecture/policy.md) 与
> [核心接口设计](../interfaces/README.md)。两者不一致时，以设计文档为准。

---

这个问题其实会直接决定 `pedyc-harness` 后面的生态怎么长。我建议**不要自己发明一套 Preset 上传/下载机制**，而是把 Preset 做成标准 npm package，并让 Harness 自己负责“解析、递归加载、合并、校验”。

核心思路：

> **npm 负责分发 Preset，Harness 负责解析 Preset 依赖关系。**

这样个人、公司、你本人上传的 Preset，在 Runtime 看来没有区别。

---

## 1. 最终用户体验应该是什么样

例如你官方提供：

```bash
npx pedyc-harness init --preset vue
```

它实际加载：

```text
@pedyc/harness-preset-vue
```

而用户自己发布：

```text
@alice/harness-preset-react
```

公司发布：

```text
@acme/harness-preset
```

项目就可以：

```bash
npx pedyc-harness init \
  --preset @acme/harness-preset
```

或者：

```bash
npx pedyc-harness init \
  --preset @alice/harness-preset-react
```

甚至：

```bash
npx pedyc-harness init \
  --preset @acme/harness-preset
  --preset @pedyc/harness-preset-vue
```

最终：

```text
.harness/
└── harness.json
```

```json
{
  "$schema": "https://pedyc.dev/schema/harness.json",
  "version": 1,
  "presets": [
    "@pedyc/harness-preset-vue",
    "@acme/harness-preset"
  ]
}
```

这里有一个重要变化：

**`init --preset` 不应该把 Preset 的内容复制进项目。**

它应该只是把依赖写入 `harness.json`。

---

# 2. Preset 本身就是 npm package

例如：

```text
@acme/harness-preset
```

package：

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
  "files": [
    "preset.json",
    "policies",
    "verification",
    "rules"
  ],
  "peerDependencies": {
    "pedyc-harness": "^1.0.0"
  }
}
```

`preset.json`：

```json
{
  "$schema": "https://pedyc.dev/schema/preset.json",

  "name": "@acme/harness-preset",

  "version": "1",

  "extends": [
    "@pedyc/harness-preset-web"
  ],

  "policy": "./policies/security.json",

  "verification": "./verification/typecheck.json"
}
```

于是 Preset 自己也可以继承 Preset。

这就解决了你说的：

> 多层 Preset 应该怎样加载？

---

# 3. Preset 应该形成一棵 DAG，而不是简单的树

例如：

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

但实际上还可能：

```text
                base
              /      \
             ↓        ↓
           web       security
             \        /
              \      /
               ↓    ↓
              acme
                ↓
             project
```

所以内部不要把它当：

```text
Preset → Child Preset
```

而应该当成：

```text
Preset Dependency Graph
```

也就是 DAG。

---

# 4. 加载算法应该是递归 DFS + 去重 + 循环检测

比如：

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

解析的时候：

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

最终：

```text
base
web
security
acme
vue
project
```

每个 Preset 只加载一次。

---

# 5. 一定要做循环依赖检测

例如：

```text
A
 ↓
B
 ↓
C
 ↓
A
```

必须直接报错：

```text
HarnessError: Circular preset dependency detected

A
→ B
→ C
→ A
```

而不是：

```text
Maximum call stack exceeded
```

所以内部可以维护：

```ts
const visiting = new Set<string>()
const resolved = new Set<string>()
```

典型逻辑：

```ts
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

---

# 6. 但这里有一个非常重要的问题：版本

比如：

```text
@acme/harness-preset
        ↓
@pedyc/harness-web
```

`@acme` 可能要求：

```text
@pedyc/harness-web ^2.0.0
```

而项目直接使用：

```text
@pedyc/harness-web ^1.0.0
```

这时候必须解决版本冲突。

我建议**直接利用 npm 的依赖解析机制**，不要自己重新造一个版本解析器。

也就是说：

```text
harness.json
     ↓
npm install
     ↓
node_modules
     ↓
Preset Resolver
```

例如：

```text
node_modules/
├── @pedyc/
│   ├── harness
│   └── harness-preset-web
│
└── @acme/
    └── harness-preset
```

Harness 只负责：

> 找到已经安装的 Preset，并读取 `preset.json`。

---

# 7. 所以 `init --preset` 最好实际上执行两个动作

用户：

```bash
npx pedyc-harness init --preset @acme/harness-preset
```

内部：

```text
                  init
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
修改 harness.json        安装 npm package
        │                     │
        └──────────┬──────────┘
                   ↓
            npm install
                   ↓
             preset ready
```

最终：

```json
{
  "presets": [
    "@acme/harness-preset"
  ]
}
```

并且：

```json
{
  "devDependencies": {
    "pedyc-harness": "^1.0.0",
    "@acme/harness-preset": "^1.2.0"
  }
}
```

---

# 8. 这样个人上传 Preset 就非常简单

假设我做了：

```text
@pedyc/harness-preset-react
```

你做了：

```text
@alice/harness-preset-my-style
```

公司：

```text
@company/harness-preset-frontend
```

都可以：

```bash
npm publish
```

然后任何项目：

```bash
npm install -D @alice/harness-preset-my-style
```

```json
{
  "presets": [
    "@alice/harness-preset-my-style"
  ]
}
```

Harness 不需要知道：

```text
这个人是谁
这个组织是谁
是不是你发布的
```

它只需要知道：

```text
这是一个合法的 Harness Preset
```

---

# 9. 但你可能会问：那为什么还需要 `pedyc-harness init --preset`？

因为它可以提供非常好的 DX。

例如：

```bash
npx pedyc-harness init --preset @acme/harness-preset
```

自动：

```text
✔ Found package manager: npm

✔ Installing @acme/harness-preset

✔ Validating preset

✔ Resolving dependencies

✔ Creating .harness/harness.json

✔ Preset loaded successfully
```

而手动方式：

```bash
npm install -D @acme/harness-preset
```

也应该支持。

所以：

```text
CLI
   ↓
DX layer

npm
   ↓
distribution layer

Core
   ↓
runtime layer
```

三者职责非常清晰。

---

# 10. 我甚至建议 `harness.json` 不要保存版本号

比如不要：

```json
{
  "presets": [
    {
      "name": "@acme/harness-preset",
      "version": "1.2.0"
    }
  ]
}
```

而是：

```json
{
  "presets": [
    "@acme/harness-preset"
  ]
}
```

版本交给：

```text
package.json
package-lock.json
```

管理。

否则你会出现：

```text
package.json
harness.json
package-lock.json
```

三处版本信息。

没必要。

---

# 11. 那么多层 Preset 的优先级怎么办？

这里我建议你不要简单规定：

```text
越后加载 → 优先级越高
```

因为这会导致安全问题。

应该把配置拆成不同类型。

例如：

### 普通默认值

```text
Project > Company > Community > Base
```

可以覆盖。

### 安全限制

```text
Base
  ↓
Company
  ↓
Project
```

只能收紧，不能放宽。

例如：

```json
{
  "policy": {
    "protectedPaths": [
      ".env"
    ]
  }
}
```

公司：

```json
{
  "policy": {
    "protectedPaths": [
      ".env",
      ".github",
      "infra"
    ]
  }
}
```

项目不能把：

```text
.env
```

删掉。

这实际上就是：

> **Policy composition ≠ JSON merge**

这一点建议你在架构层面现在就定下来。

---

# 12. 我建议把 Preset 分成两个概念

这是我认为你项目下一阶段特别值得设计的地方。

### Preset

提供默认能力：

```text
Policy
Verification
Agent configuration
Rules
```

可以被继承。

### Policy Constraint

提供不可突破的约束：

```text
禁止访问生产环境
禁止修改 .env
禁止执行 rm -rf
必须人工审批
```

它不能被普通 Preset override。

于是：

```text
Preset
    ↓
Preset
    ↓
Project
```

和：

```text
Security Constraint
    ↓
Security Constraint
    ↓
Security Constraint
```

是两套不同的合并语义。

---

# 13. 一个完整例子

假设：

```text
@pedyc/harness-preset-web
```

定义：

```json
{
  "policy": {
    "protectedPaths": [
      ".env"
    ]
  }
}
```

公司：

```text
@acme/harness-preset
```

定义：

```json
{
  "extends": [
    "@pedyc/harness-preset-web"
  ],

  "policy": {
    "protectedPaths": [
      "infra",
      ".github"
    ]
  }
}
```

项目：

```text
my-app
```

```json
{
  "presets": [
    "@acme/harness-preset"
  ],

  "policy": {
    "protectedPaths": [
      "production"
    ]
  }
}
```

最终 Effective Policy：

```json
{
  "protectedPaths": [
    ".env",
    ".github",
    "infra",
    "production"
  ]
}
```

而不是：

```text
项目配置覆盖公司配置
```

---

# 14. 最终加载流程

我建议 Core 最终做成：

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
                     │
                     ↓
              Cycle Detection
                     │
                     ↓
              Topological Sort
                     │
                     ↓
              Preset Validation
                     │
                     ↓
             Policy Composition
                     │
                     ↓
             Effective Policy
                     │
                     ↓
              Harness Runtime
```

这个架构我觉得很适合你的项目。

---

# 15. 最重要的是：用户甚至不需要知道“多层 Preset”

用户只需要：

```bash
npm install -D @acme/harness-preset
```

然后：

```json
{
  "presets": [
    "@acme/harness-preset"
  ]
}
```

至于：

```text
@acme
 ↓
@pedyc/web
 ↓
@pedyc/base
 ↓
@pedyc/security
```

全部由 Harness 自动解析。

这就是好的抽象。

---

## 我会给 `pedyc-harness` 定这样的职责边界

| 层              | 职责                                       |
| --------------- | ------------------------------------------ |
| npm             | Preset 分发、版本、依赖                    |
| `package.json`  | 声明安装哪些 Preset                        |
| `harness.json`  | 声明项目启用哪些 Preset                    |
| `preset.json`   | 描述 Preset 自己继承什么、提供什么         |
| Preset Resolver | 递归加载依赖                               |
| Config Resolver | 合并配置                                   |
| Policy Engine   | 决定哪些配置可以覆盖                       |
| Harness Runtime | 执行最终 Policy                            |
| CLI             | 给用户提供友好的 init/install/inspect 命令 |

这样一来，你的生态会自然形成：

```text
                  npm
                   │
          ┌────────┴────────┐
          ↓                 ↓
     官方 Preset         用户 Preset
          │                 │
          └────────┬────────┘
                   ↓
              Project
                   ↓
            Effective Policy
                   ↓
             AI Agent
```

**而不是让 `pedyc-harness` 自己承担“Preset 商店/上传平台/版本管理器”的职责。**

我尤其建议下一步先把 **`preset.json` schema + Preset dependency resolution + merge/override 规则** 定下来。这三个东西一旦定下来，后面的 npm 发布、团队 Preset、个人 Preset 基本都会顺着长出来。
