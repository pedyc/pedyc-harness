# Policy 设计

> Policy 定义一次 Harness Run 中 Agent **允许做什么、不允许做什么**。

Policy 是 pedyc-harness 的核心治理机制之一。

它解决的不是：

> Agent 有什么能力？

而是：

> **这一次任务允许 Agent 使用哪些能力。**

---

# 一、Policy 的定位

Policy 位于：

```text
Task
 ↓
Contract
 ↓
Policy
 ↓
Agent
```

其中：

* Contract 描述任务要求
* Policy 描述执行边界
* Agent 负责执行
* Harness 负责最终判定

因此：

```text
Contract ≠ Policy
```

二者职责不同。

---

# 二、Policy 的核心职责

Policy 至少约束五类行为：

```text
1. 文件范围
2. 受保护文件
3. 命令范围
4. 禁止命令
5. 执行资源 / 次数
```

对应：

```ts
export interface HarnessPolicy {
  allowedPaths: string[]
  protectedPaths: string[]
  allowedCommands: CommandPolicy[]
  forbiddenCommands: string[]
  maxIterations: number
  requiredVerification: VerificationRequirement[]
}
```

---

# 三、文件范围

## allowedPaths

定义本次任务允许修改的文件范围：

```json
{
  "allowedPaths": [
    "src/",
    "tests/"
  ]
}
```

核心规则：

```text
Actual Change
      ↓
是否位于 allowedPaths？
      │
   ┌──┴──┐
   │     │
  Yes    No
   │     │
允许    Reject
```

---

## protectedPaths

定义无论任务范围如何，都不允许修改的路径：

```json
{
  "protectedPaths": [
    ".git/",
    ".harness/",
    ".github/",
    "scripts/"
  ]
}
```

优先级：

```text
protectedPaths
      ↓
最高优先级
```

即使某路径同时出现在：

```text
allowedPaths
```

也应该被拒绝。

因此：

```text
protectedPaths
>
allowedPaths
```

---

# 四、路径判定

最终路径判定应至少经过：

```text
Actual File Change
       ↓
Normalize Path
       ↓
Protected Path Check
       ↓
Allowed Path Check
       ↓
Decision
```

结果：

```ts
export type ScopeDecision =
  | "allowed"
  | "protected"
  | "outside-scope"
```

---

# 五、为什么必须检查实际变化

不能只依赖 Agent 返回：

```json
{
  "changes": [
    "src/foo.ts"
  ]
}
```

因为 Agent 可以：

* 漏报文件
* 错报文件
* 修改后恢复文件
* 通过命令产生额外文件
* 修改 Agent 自己没有声明的路径

因此：

> **Scope Enforcement 必须基于 Harness 观察到的实际变化。**

优先使用：

```text
Git Diff
Filesystem State
```

而不是：

```text
AgentResult.changes
```

Agent 声明可以作为辅助信息，但不能成为最终依据。

---

# 六、命令 Policy

文件范围之外，Harness 还需要约束 Agent 执行的命令。

```ts
export interface CommandPolicy {
  command: string
  allowed: boolean
}
```

例如：

```json
{
  "allowedCommands": [
    {
      "command": "npm run type-check",
      "allowed": true
    },
    {
      "command": "npm test",
      "allowed": true
    }
  ],
  "forbiddenCommands": [
    "rm -rf",
    "git push",
    "npm publish"
  ]
}
```

---

# 七、命令判定

命令执行前：

```text
Command
   ↓
Normalize / Parse
   ↓
Forbidden Check
   ↓
Allowed Check
   ↓
Execute / Reject
```

优先级：

```text
forbiddenCommands
        >
allowedCommands
```

即：

> 明确禁止的命令，即使存在于允许列表，也必须拒绝。

---

# 八、为什么命令 Policy 必须独立于文件 Policy

Agent 可以通过命令修改文件。

例如：

```bash
npm install
```

可能修改：

```text
package-lock.json
```

又或者：

```bash
git checkout ...
```

可能改变工作区状态。

因此：

```text
File Scope
```

无法完全代替：

```text
Command Policy
```

两者需要同时存在：

```text
             Agent
               │
        ┌──────┴──────┐
        ▼             ▼
   File Changes     Commands
        │             │
        ▼             ▼
  Scope Policy   Command Policy
        │             │
        └──────┬──────┘
               ▼
            Decision
```

---

# 九、Policy 与 TaskContract

Task Contract：

```text
我要完成什么？
```

Policy：

```text
允许我怎么完成？
```

例如：

```json
{
  "task": "修复用户登录页面的类型错误",
  "scope": {
    "allowedPaths": [
      "src/views/login/",
      "src/types/"
    ]
  }
}
```

Policy 可以进一步限制：

```json
{
  "allowedPaths": [
    "src/views/login/",
    "src/types/"
  ],
  "protectedPaths": [
    ".github/",
    ".harness/",
    "scripts/"
  ],
  "allowedCommands": [
    "npm run type-check",
    "npm test"
  ]
}
```

Task 决定目标。

Policy 决定边界。

---

# 十、Policy Enforcement 时机

Policy 不应该只检查最终结果。

至少存在三个检查点。

## 1. Before Execution

检查：

```text
Task
Policy
Working Directory
```

确保执行环境合法。

---

## 2. During Execution

如果 Harness 能够观察 Agent 发出的命令：

```text
Command
   ↓
Policy
   ↓
Allowed?
```

则可以直接拒绝非法命令。

如果当前 Provider 无法提供命令级拦截能力，则至少需要在执行后发现异常。

---

## 3. After Execution

必须检查：

```text
Actual Changes
```

包括：

* allowedPaths
* protectedPaths
* unexpected files

最终决定是否进入 Verification / Review。

---

# 十一、Policy Evaluation

建议将 Policy 判断设计成纯逻辑：

```ts
export interface PolicyEvaluator {
  evaluateCommand(
    command: string,
    policy: HarnessPolicy
  ): PolicyDecision

  evaluatePath(
    path: string,
    policy: HarnessPolicy
  ): PolicyDecision
}
```

结果：

```ts
export interface PolicyDecision {
  allowed: boolean
  reason: string
  rule?: string
}
```

例如：

```json
{
  "allowed": false,
  "reason": "Path is protected",
  "rule": "protectedPaths"
}
```

---

# 十二、Policy 不应该做什么

Policy 不负责：

* 判断代码质量
* 执行测试
* 判断测试是否通过
* Review 代码
* 生成 Agent Prompt
* 选择 Agent
* 选择模型

这些分别属于：

```text
Verification
Review
Provider
Preset
```

---

# 十三、Policy 的最小闭环

最小可用 Policy：

```text
Task
 ↓
Load Policy
 ↓
Execute Agent
 ↓
Inspect Actual Changes
 ↓
Evaluate Scope
 ↓
PASS / REJECT
```

第一阶段可以只做到：

```text
allowedPaths
+
protectedPaths
```

随后增加：

```text
allowedCommands
+
forbiddenCommands
```

最终形成完整 Policy Enforcement。

---

# 十四、当前实现与目标

当前项目已经具备部分 Policy 能力：

* `allowedProductPaths` 可以拦截文件改动
* `forbiddenCommands` 当前尚未真正参与执行判断
* `protectedPaths` 当前主要完成结构校验，尚未形成实际拦截

因此后续实现优先级：

```text
P0
├── protectedPaths enforcement
└── forbiddenCommands enforcement

P1
├── command policy evaluation
└── actual command observation

P2
└── 更完整的 execution policy
```

当前具体实现状态以代码与里程碑为准。原项目目标文档已经明确记录了上述落差。

策略合成（[§十五](#十五策略来源与优先级) ～ [§十七](#十七effectivepolicy)）同样属于设计目标：当前实现只加载
单一 `policy.json`，没有 Preset 继承、没有字段级合并语义、没有 provenance。因此不要把多层
Preset 的合成行为当成既有保证。

---

# 十五、策略来源与优先级

一次 Run 使用的 Policy 不是只来自 `.harness/policy.json`。完整来源是：

```text
Base Preset
     ↓
Community Preset
     ↓
Organization Preset
     ↓
Team Preset
     ↓
Project（.harness/harness.json + policy.json）
     ↓
Task Contract
```

但这些来源之间存在**两种不同的优先级顺序**，不能合并成一条链：

普通默认值按便利性排序，越高层越贴合项目：

```text
Project > Team > Organization > Community > Base
```

安全约束按不可放宽性排序，越低层越不可突破：

```text
Convenience defaults
        ↓
Project policy
        ↓
Organization policy
        ↓
Security invariants
```

也就是说：

> **个人或项目的配置可以改变默认值，但不能移除上层已经声明的安全约束。**

Preset 依赖图的解析方式见 [Preset 设计](./Preset设计.md)。

---

# 十六、Policy Composition

Policy 合成不等于 JSON merge。

```ts
deepMerge(base, project)
```

这种通用对象合并无法表达「哪些字段只能收紧」，因此每个字段都必须显式声明合并语义：

```ts
export type MergeStrategy =
  | "replace"
  | "merge"
  | "append"
  | "deny-wins"
  | "immutable"
```

字段级默认语义：

| 字段                                        | 语义              | 说明                             |
| ------------------------------------------- | ----------------- | -------------------------------- |
| `protectedPaths`                            | `append`          | 只能增加，不能删除已有项         |
| `forbiddenCommands`                         | `append` + `deny-wins` | 只要出现过禁止，任何层级不能解除 |
| `allowedPaths`                              | `replace`         | 项目通常需要声明自己的范围，但受 `protectedPaths` 与 `immutable` 约束 |
| `allowedCommands`                           | `merge`           | 按 command 合并，禁止项优先       |
| `requiredVerification` / `requiredChecks`   | `append`          | 只能增加检查项，不能减少         |
| `maxIterations` / `timeout` / `maxChangedFiles` | `replace`（取更严格值） | 资源上限只能收紧，不能放宽 |
| 安全不变量                                  | `immutable`       | 完全不可覆盖                     |

累积类字段的例子：

```text
Preset A      protectedPaths = [".env"]
Preset B      protectedPaths = [".github"]
        ↓
              [".env", ".github"]
```

禁止类字段的例子：

```text
个人 Preset   允许 git push
公司 Preset   禁止 git push
        ↓
             DENY
```

不可覆盖的例子：

```json
{
  "protectedPaths": [".harness"]
}
```

即使项目把 `.harness` 从自己的配置中删掉，`protectedPaths` 仍然命中，因此：

```text
protectedPaths
        >
allowedPaths
```

这条优先级不会因为配置来源不同而改变。

两个实现约束：

1. 合并语义必须由单一模块实现。Preset Resolver 只负责收集来源与顺序，不做语义判断。
2. 不能一部分规则写在 Resolver、一部分写在 Policy Engine，否则规则语义会漂移。

---

# 十七、EffectivePolicy

Policy 合成的输出是 `EffectivePolicy`：

```text
Preset
  +
Organization Preset
  +
Project Config
  +
Task Config
        ↓
   Config Resolver
        ↓
   EffectivePolicy
        ↓
   Harness Runtime
```

Runtime 只使用 `EffectivePolicy`，不关心某个字段来自哪一层。

但来源必须保留为 provenance，并随 Run Record 保存。否则无法回答：

```text
这条 protectedPaths 是谁声明的？
这次运行为什么被拒绝？
评审时看到的规则和当时执行的是否一致？
```

原则：

> **Runtime 不需要知道来源，但审计必须能够还原来源。**

类型定义见 [核心接口设计](./核心接口设计.md)，配置分层见 [核心架构](./核心架构.md)。

---

# 十八、核心原则

Policy 的核心不是：

> 限制 Agent，让 Agent 什么都不能做。

而是：

> **让 Agent 在一个明确、可判定、可审计的执行空间内工作。**

因此 Policy 的设计目标是：

```text
明确
+
可执行
+
可判定
+
可审计
```

而不是追求复杂的权限系统。
