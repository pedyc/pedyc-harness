这正好触及 Preset 设计里一个非常关键的问题：

> **Preset 是第三方扩展，但 Harness 又必须保证它不会把治理系统搞坏。**

答案是：**不能只靠 `preset.json` 的 Schema 校验。需要建立一套 Preset Contract + Static Validation + Resolution Validation + Verification Validation + Compatibility Version 的完整机制。**

可以把它理解成：

```text
@aran/personal-harness-preset
            │
            ▼
       Preset Contract
            │
      ┌─────┴─────┐
      ▼           ▼
 Static Check   Dynamic Check
      │           │
      └─────┬─────┘
            ▼
       Compatibility
            │
            ▼
     Accepted / Rejected
```

而且我认为这应该成为 **pedyc-harness 的一等能力**，不是 Preset 文档里的一个附属功能。

---

# 1. 首先要区分“合法”与“有效”

这是最重要的概念。

假设：

```text
@aran/personal-harness-preset
```

包含：

```yaml
policies:
  - allow: src/**
  - deny: src/**
```

它的 `preset.json` 完全符合 JSON Schema。

所以：

```text
Schema Valid
```

但是它可能：

```text
Semantically Invalid
```

再比如：

```text
verification:
  command: pnpm motion:verify
```

Schema 也完全正确。

但实际运行：

```bash
pnpm motion:verify
```

直接：

```text
command not found
```

所以至少需要：

```text
Syntax Valid
    ↓
Schema Valid
    ↓
Semantic Valid
    ↓
Executable Valid
```

---

# 2. 我建议增加一个 Preset Validation Pipeline

整体架构可以变成：

```text
                  Preset Package
                        │
                        ▼
                 Manifest Loader
                        │
                        ▼
                 Schema Validation
                        │
                        ▼
               Static Validation
                        │
                        ▼
              Dependency Resolution
                        │
                        ▼
             Composition Validation
                        │
                        ▼
          Verification Capability Check
                        │
                        ▼
                Compatibility Check
                        │
                        ▼
                Validated Preset
                        │
                        ▼
              Effective Governance
```

也就是说：

> **PresetResolver 不应该直接把第三方 Preset 当成可信输入。**

---

# 3. 第一层：Preset Contract

首先，pedyc-harness 必须定义一个稳定的：

```text
Preset Contract
```

例如：

```json
{
  "schemaVersion": "1",
  "name": "@aran/personal-harness-preset",
  "type": "domain",
  "extends": [],
  "contracts": [],
  "policies": [],
  "verification": []
}
```

这里的 `schemaVersion` 非常重要。

因为以后：

```text
Preset Contract v1
Preset Contract v2
```

可能发生变化。

所以 Harness 必须知道：

```text
这个 Preset 是按照哪个 Harness Contract 写的？
```

例如：

```text
pedyc-harness 1.x
        │
        ├── supports Preset Contract v1
        │
        └── rejects v2
```

或者：

```text
supports:
  >=1 <3
```

---

# 4. 第二层：Schema Validation

这是最基础的一层。

例如：

```ts
interface PresetManifest {
  schemaVersion: string
  name: string
  type: PresetType
  extends?: string[]
  contracts?: string[]
  policies?: string[]
  rules?: string[]
  verification?: string[]
  guidance?: string[]
}
```

检查：

```text
字段是否合法
类型是否正确
路径是否存在
必填字段是否存在
是否出现未知字段
```

例如：

```json
{
  "name": 123
}
```

直接：

```text
INVALID
```

但是：

> **Schema Validation 只能解决“结构正确”，不能解决“规范正确”。**

---

# 5. 第三层：Semantic Validation

这是你提到的“规则互斥”的地方。

例如：

```text
Policy A
allow:
  src/**

Policy B
deny:
  src/components/**
```

这并不一定错误。

因为：

```text
allow src/**
deny src/components/**
```

可以定义出明确的：

```text
deny-wins
```

语义。

但如果：

```text
Rule A:
duration <= 300ms

Rule B:
duration >= 500ms
```

那么：

```text
duration ∈ [500, 300]
```

为空。

这就应该被检测出来：

```text
Contradictory Constraints
```

---

# 6. 因此需要 Constraint Analyzer

我建议以后增加：

```text
Preset Validator
      │
      └── Constraint Analyzer
```

例如：

```ts
export interface ConstraintAnalyzer {
  analyze(
    governance: EffectiveGovernance
  ): ConstraintAnalysis
}
```

结果：

```ts
interface ConstraintAnalysis {
  errors: ConstraintConflict[]
  warnings: ConstraintWarning[]
}
```

例如：

```json
{
  "type": "contradiction",
  "field": "motion.duration",
  "constraints": [
    "duration <= 300",
    "duration >= 500"
  ]
}
```

---

# 7. 但是“互斥”不能全部由 Harness 判断

这里还有一个非常重要的边界。

比如：

```text
Rule A:
button should use fade

Rule B:
button should use slide
```

这是否冲突？

Harness 未必知道。

因为可能：

```text
hover → fade
enter → slide
```

完全可以同时成立。

所以应该区分：

```text
Machine-semantic conflict
        ↓
Harness 可以判断

Domain-semantic conflict
        ↓
Domain Preset 自己声明
```

这意味着 Preset 最终可能需要声明：

```ts
constraints: {
  mutuallyExclusive: [...]
}
```

或者更高级：

```ts
conflicts: ConflictRule[]
```

Harness 提供机制，但**不试图理解所有领域知识**。

这非常符合你现在的 Core 边界设计。

---

# 8. 第四层：Dependency Validation

例如：

```text
personal-preset
    ↓
motion-preset
    ↓
web-preset
```

需要检查：

```text
Preset 是否存在？
版本是否兼容？
循环依赖？
重复依赖？
```

尤其是：

```text
A → B
A → C
B → D
C → D
```

这是合法 DAG。

但：

```text
A → B → C → A
```

必须拒绝。

这一部分你现在的 DAG Resolution 设计已经有基础了。

---

# 9. 第五层：Verification Validation

这恰恰是你问题中**最重要的一部分**。

例如：

```json
{
  "id": "motion-check",
  "command": "pnpm motion:verify"
}
```

Schema 没问题。

但是 Harness 必须知道：

> 这个 Verification 到底能不能运行？

这里我建议分成两个级别。

---

## Level 1：Capability Validation

先检查：

```text
Verification 定义是否合法
```

比如：

```text
command
workingDirectory
timeout
environment
inputs
outputs
```

是否符合 Harness Verification Contract。

---

## Level 2：Execution Validation

然后在：

```bash
harness doctor
```

或者：

```bash
harness preset validate
```

中真正执行：

```text
pnpm motion:verify
```

得到：

```text
exitCode
stdout
stderr
duration
```

例如：

```text
Verification: motion-check

Command:
pnpm motion:verify

Result:
✗ command not found

Status:
INVALID
```

---

# 10. 但是不要在安装 Preset 时自动执行任意代码

这是安全边界。

例如：

```text
npm install @aran/personal-harness-preset
```

然后 Harness 自动：

```text
执行 Preset 中所有 command
```

这是非常危险的。

第三方 Preset 可以写：

```bash
curl ...
```

甚至：

```bash
rm -rf ...
```

所以：

> **Preset Validation 不能等价于执行 Preset。**

应该明确分：

```text
Static Validation
      ↓
安全，可以自动

Dynamic Validation
      ↓
需要显式用户授权 / Sandbox
```

---

# 11. 因此可以设计三个验证命令

我甚至建议 CLI 最终形成：

```bash
harness preset lint
```

只做静态分析：

```text
Manifest
Schema
References
Dependency Graph
Constraint Conflicts
```

---

```bash
harness preset verify
```

做动态能力验证：

```text
Verification commands
Check definitions
Executable availability
Runtime compatibility
```

需要用户明确允许执行。

---

```bash
harness preset doctor
```

综合诊断：

```text
Preset
├── Contract ✓
├── Schema ✓
├── Dependencies ✓
├── Composition ✓
├── Constraints ⚠
├── Verification ✗
└── Compatibility ✓
```

---

# 12. 第六层：Compatibility

还需要解决一个很现实的问题：

```text
@aran/personal-harness-preset
```

可能是按照：

```text
pedyc-harness 1.2
```

设计的。

用户却使用：

```text
pedyc-harness 2.0
```

那么：

```text
Preset Contract
        ≠
Harness Contract
```

所以 Preset 必须声明：

```json
{
  "engine": {
    "name": "pedyc-harness",
    "range": "^1.2.0"
  }
}
```

或者：

```json
{
  "contract": {
    "version": "1"
  }
}
```

最终：

```text
Harness Version
        +
Preset Contract Version
        ↓
Compatibility Check
```

---

# 13. 最终可以定义 Preset Status

一个 Preset 不应该只有：

```text
valid / invalid
```

我更建议：

```text
unknown
↓
loaded
↓
schema-valid
↓
resolved
↓
validated
↓
verified
↓
compatible
```

最终：

```text
PresetStatus
```

例如：

```text
✓ Manifest
✓ Schema
✓ Dependencies
✓ Composition
✓ Constraints
✓ Verification Definition
✓ Verification Execution
✓ Compatibility
```

才进入：

```text
ACTIVE
```

---

# 14. 最关键的是：Validation 应该发生两次

这是我认为你这个项目以后非常重要的一点。

### 安装/解析阶段

```text
Preset
 ↓
Static Validation
 ↓
Resolution
 ↓
Composition Validation
```

保证：

> **这个 Preset 在结构和语义上可以进入治理系统。**

### Runtime 阶段

```text
Effective Governance
 ↓
Policy
 ↓
Agent
 ↓
Verification
```

保证：

> **这个 Preset 在当前项目环境中确实能够工作。**

因为：

```text
Preset 本身有效
```

不等于：

```text
Preset 在 Project A 中有效
```

例如：

```text
motion-preset
```

要求：

```bash
pnpm motion:verify
```

但是 Project A 根本没有这个 script。

那么：

```text
Preset Valid
```

但：

```text
Project Compatibility = Invalid
```

这两个概念一定要分开。

---

# 15. 我建议最终形成四层 Trust Model

这是对 pedyc-harness 很重要的架构抽象：

```text
                    Third-party Preset
                           │
                           ▼
                  ┌─────────────────┐
                  │ Contract Valid  │
                  └────────┬────────┘
                           ↓
                  ┌─────────────────┐
                  │ Semantically    │
                  │ Valid           │
                  └────────┬────────┘
                           ↓
                  ┌─────────────────┐
                  │ Environment     │
                  │ Compatible      │
                  └────────┬────────┘
                           ↓
                  ┌─────────────────┐
                  │ Runtime         │
                  │ Verified        │
                  └────────┬────────┘
                           ↓
                       Trusted
```

也就是说：

> **Harness 不应该“相信 Preset”，而应该逐层建立对 Preset 的信任。**

---

# 16. 这会反过来影响我们刚才写的两个 Preset 文档

刚才那两份里还缺一个非常重要的东西：

```text
Preset Validation
```

我建议下一版 `preset.md` 增加一个完整章节：

```text
Preset Validation & Trust
```

并把架构明确成：

```text
Preset Package
      ↓
Manifest Validation
      ↓
Static Validation
      ↓
Dependency Resolution
      ↓
Semantic Validation
      ↓
Environment Compatibility
      ↓
Verification Validation
      ↓
Effective Governance
```

而 `interface/preset.md` 则应该增加至少这些接口：

```ts
interface PresetValidator

interface PresetCompatibilityChecker

interface ConstraintAnalyzer

interface VerificationValidator

interface PresetValidationResult
```

这样你的 Preset 体系才真正闭环：

```text
                    ┌──────────────┐
                    │    Preset    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   Resolve    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   Validate   │
                    └──────┬───────┘
                           ↓
                ┌──────────┴──────────┐
                ↓                     ↓
          Static Validation    Dynamic Validation
                │                     │
                ↓                     ↓
          Semantic Rules       Verification
                │                     │
                └──────────┬──────────┘
                           ↓
                  Effective Governance
                           ↓
                         Agent
                           ↓
                    Independent Verification
                           ↓
                         Gate
```

**这其实比“Preset = 一组配置”高了一个层级。**

Preset 变成了一个**第三方治理规范包**，而 `pedyc-harness` 的职责之一，就是建立一个机制，让任意第三方规范包都必须经过明确的 **Contract → Validation → Compatibility → Verification** 流程，才能进入可信治理链。

这也是我认为 `@aran/personal-harness-preset` 这个例子非常有价值的原因：它迫使我们把 **“开放生态”和“治理可信度”** 这两个问题同时解决。

Deepen the preset trust model

* Design the preset validation lifecycle
* Define the validation interfaces
