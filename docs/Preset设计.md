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
