# Preset Architecture

> Preset 是项目类型相关的 Harness 默认能力集合。Preset 不属于 Core，也不应该让 Core 感知具体技术栈。

## 1. 职责

Preset 为不同项目提供：

* Policy Defaults
* Verification Defaults
* Project Templates
* 技术栈相关规则

例如：

```text
Generic
Vue
React
Node
Python
...
```

这些差异不应该进入 Core。

```text
Core
  ↓
通用 Harness 能力

Preset
  ↓
项目类型知识
```

---

## 2. Preset 模型

Preset 本质上是一组默认能力：

```text
Preset
├── Policy Defaults
├── Verification Defaults
└── Project Templates
```

典型内容：

```text
allowedPaths
protectedPaths
requiredChecks
instructionTemplates
agentTemplates
skillTemplates
```

Preset 提供默认值，而不是不可修改的全局规则。

---

## 3. Generic 与技术栈 Preset

### Generic

提供与具体技术栈无关的最小默认能力：

* 通用目录策略
* 通用安全规则
* 基础验证模板
* 基础 Agent 指令

### Vue

面向：

```text
Vue 3
TypeScript
Vite
```

可以提供：

* Vue 项目目录规则
* TypeScript 检查
* Vite 构建检查
* Vue-specific Agent Instructions

这些能力属于 Preset，不属于 Core。

---

## 4. Preset 与 Core

错误：

```ts
if (project.type === "vue") {
  // ...
}
```

Core 不应该感知：

```text
Vue
React
Vite
Webpack
```

正确模型：

```text
Vue Preset
    ↓
Preset Resolution
    ↓
EffectiveHarnessConfig
    ↓
Core
```

Core 只处理通用能力：

```text
Policy
Contract
Execution
Verification
Diff
Review
```

---

## 5. Preset 分发

Preset 采用 npm package 作为分发层。

```text
npm
 ↓
分发、版本、依赖

Harness
 ↓
解析、加载、合并、校验
```

例如：

```text
@pedyc/harness-preset-generic
@pedyc/harness-preset-vue
@acme/harness-preset
@alice/harness-preset-react
```

官方、企业和个人 Preset 对 Runtime 都是合法 Preset，没有额外的分发模型。

---

## 6. Preset Package

典型结构：

```text
@acme/harness-preset/
├── package.json
├── preset.json
├── policies/
├── verification/
└── rules/
```

`preset.json` 描述：

```json
{
  "name": "@acme/harness-preset",
  "extends": [
    "@pedyc/harness-preset-web"
  ],
  "policy": "./policies/security.json",
  "verification": "./verification/typecheck.json",
  "rules": [
    "./rules/frontend.md"
  ]
}
```

约定：

* `extends` 只写包名
* 版本由 `package.json` 与 lockfile 管理
* 相对路径只能指向 Preset package 内的文件

---

## 7. Preset Dependency Graph

Preset 支持多层继承，因此内部模型是 DAG，而不是简单的树。

```text
base
 ├── web
 │    └── vue
 └── security
       └── acme
```

允许：

```text
A → B
A → C
B → D
C → D
```

但禁止：

```text
A → B → C → A
```

Resolver 必须：

1. 递归加载
2. 去重
3. 检测循环
4. 生成拓扑顺序

每个 Preset 在一次解析过程中只加载一次。

---

## 8. Preset Resolution

解析过程：

```text
Root Presets
     ↓
Preset Resolver
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
```

依赖必须先于使用它的 Preset。

例如：

```text
base
web
security
acme
vue
project
```

---

## 9. 配置层级

目标层级：

```text
Global
   ↓
Organization
   ↓
Team
   ↓
Project
   ↓
Task
```

最终形成：

```text
Global defaults
      +
Organization rules
      +
Team rules
      +
Project rules
      +
Task rules
      ↓
EffectiveHarnessConfig
```

---

## 10. 配置合成

Preset 不能简单使用：

```ts
deepMerge(a, b)
```

不同字段需要不同 Merge Strategy：

```text
replace
append
merge
deny-wins
immutable
```

例如：

| Strategy    | 语义         | 示例              |
| ----------- | ------------ | ----------------- |
| `replace`   | 高优先级替换 | 普通默认配置      |
| `append`    | 追加且去重   | protectedPaths    |
| `merge`     | 按 key 合并  | agents            |
| `deny-wins` | 禁止项优先   | forbiddenCommands |
| `immutable` | 不允许覆盖   | 安全不变量        |

普通默认值：

```text
Task > Project > Team > Organization > Global
```

安全约束：

```text
低层安全约束
     ↓
高层只能收紧
不能放宽
```

---

## 11. Preset 与 Policy Constraint

需要区分：

```text
Preset Defaults
    ↓
可以继承、覆盖

Security Constraints
    ↓
只能追加、收紧
```

例如：

```text
个人 Preset：允许 git push
公司 Policy：禁止 git push

最终：
DENY
```

因此安全约束不能通过普通 Preset Override 被解除。

---

## 12. Runtime 边界

Runtime 最终只消费：

```text
EffectiveHarnessConfig
```

Runtime 不应该关心：

```text
某个配置来自哪个 Preset
某个 Preset 来自哪个 npm package
```

但配置来源必须保留 provenance，用于审计：

```text
Effective Config
      +
Provenance
      ↓
Run Record
```

这样可以回答：

> 这次运行为什么使用这条 Policy？

---

## 13. Init 与 Update

### Init

必须满足：

> **幂等 + 默认不覆盖**

```text
不存在       → 创建
存在且相同   → 跳过
存在且不同   → 保留并提示
--force      → 显式覆盖
```

### Update

未来用于：

```text
Preset Version
      ↓
Project Configuration
      ↓
Migration
```

Update 必须避免静默覆盖用户修改，因此需要：

* Template Version
* Migration
* Conflict Detection

---

## 14. 当前实现与目标

当前：

```text
packages/core/src/contracts/preset.ts
packages/cli/src/presets.ts
packages/preset-generic
packages/preset-vue
harness init --preset <name>
```

目标：

```text
Preset = npm package + preset.json

harness.json
    ↓
Preset Resolver
    ↓
DAG + Cycle Detection + Topological Sort
    ↓
Config Resolver
    ↓
EffectiveHarnessConfig
```

| 能力             | 当前       | 目标                  |
| ---------------- | ---------- | --------------------- |
| Preset 发现      | CLI 静态表 | npm                   |
| Preset 继承      | 不支持     | `extends` + DAG       |
| 配置入口         | 无         | `harness.json`        |
| 合并语义         | 未定义     | 字段级 Merge Strategy |
| Effective Config | 无         | Runtime 唯一输入      |

---

## 15. 设计原则

1. Preset 提供默认能力。
2. Preset 不进入 Core。
3. 技术栈判断不污染 Core。
4. Template 属于 Preset。
5. Preset 是 npm package。
6. Preset 依赖是 DAG。
7. Resolver 必须去重并检测循环。
8. 配置合并由字段级策略定义。
9. 安全约束只能收紧，不能放宽。
10. Runtime 只消费 `EffectiveHarnessConfig`。
11. Runtime 必须保留配置 provenance。
12. Preset 不负责 Runtime orchestration。
13. Preset 不负责最终 Verification。
14. Preset 不等于 Project Configuration。

---

## 16. 相关文档

* [Preset Interface](../interfaces/preset.md)
* [Graph Algorithm](./algorithms/01-graph.md)
* [Config Resolution](./algorithms/02-config-resolution.md)
* [Policy Architecture](./policy.md)
* [Core Architecture](./core.md)
