# Policy 契约

> `.harness/policy.json` 的形状,以及三个真正执行它的函数。
>
> 来源:`packages/core/src/contracts/policy.ts`、`packages/core/src/config/policy.ts`、`packages/core/src/runtime/policy-engine.ts`。

## 1. 类型

```ts
type AgentMode = 'internal' | 'external'
type AgentRole = 'planner' | 'coder' | 'tester' | 'reviewer'

interface CommandPolicy {
  allowedAgentCommands?: string[]
}

interface Policy extends CommandPolicy {
  allowedProductPaths: string[]
  maxIterations?: number
  protectedPaths?: string[]
  requiredChecks?: string[]
  forbiddenCommands?: string[]
  agentTimeoutMs?: number
}
```

## 2. 字段与真实约束

类型上的可选性与运行时的实际要求**不一致**,下表是实际行为:

| 字段 | 类型上必需 | `validatePolicy` 的要求 | 是否被强制执行 |
| ------------------------ | ---------- | ------------------------ | ---------------------------------------------------------- |
| `allowedProductPaths` | ✅ | 非空数组 | ✅ `findOutOfScopeChanges`,前缀匹配 |
| `maxIterations` | ❌ | **正整数**(缺失即拒绝) | ✅ `executor` 用它钳制 Coder 重试上限 |
| `protectedPaths` | ❌ | **必须是数组**(缺失即拒绝) | ❌ 只校验形状,从不与改动比对 |
| `requiredChecks` | ❌ | **必须是数组**(缺失即拒绝) | ✅ 逐个作为验证闸门执行 |
| `forbiddenCommands` | ❌ | 不校验 | ❌ 未被任何代码读取 |
| `agentTimeoutMs` | ❌ | 不校验 | ❌ 未被读取(`runCommand` 没有超时) |
| `allowedAgentCommands` | ❌ | 不校验 | ✅ `isCommandAllowed` |

**要点:`maxIterations`、`protectedPaths`、`requiredChecks` 在类型上可选,但不写就会被
`validatePolicy` 拒绝。** 只有 `allowedProductPaths`、`maxIterations`、`protectedPaths`、
`requiredChecks` 四项齐全的文档才能通过校验。

`protectedPaths`、`forbiddenCommands`、`agentTimeoutMs` 目前是**已声明但未强制执行**的字段:
写在配置里不会产生效果。

## 3. 三个函数

```ts
validatePolicy(policy: unknown): string | null
findOutOfScopeChanges(files: string[], policy: Policy): string[]
isCommandAllowed(command: string, policy: CommandPolicy): boolean
```

- **`validatePolicy`** —— 校验从磁盘读到的文档。输入是 `unknown`(不受信任的 JSON),返回第一个
  问题的描述,或 `null`。返回 `null` 的调用方可以把它当作 `Policy` 使用。
- **`findOutOfScopeChanges`** —— 返回 Coder 改过、但 Policy 不允许的文件名。
- **`isCommandAllowed`** —— 允许列表为空或未定义表示"不限制"。

## 4. 语义细节

`findOutOfScopeChanges` 使用**前缀匹配**,不是 glob:

```ts
files.filter((file) => !policy.allowedProductPaths.some((p) => file.startsWith(p)))
```

因此 `allowedProductPaths: ["src/"]` 会允许 `src/anything`,也会允许前缀相同的
`src-other/file.ts`。路径必须以 `/` 结尾才能表达"目录之内"。

## 5. 目标形态

> **目标(M19)** 规则化的 Policy(条件与效果)、多 Policy 优先级与冲突解决、deny-wins 合并、
> 不可被普通 Override 解除的安全约束——以上均**未实现**。当前 Policy 是一个扁平的设置对象,
> 不存在规则列表,也不存在决策对象。

见[架构:Preset 与 Policy](../architecture/preset.md)与[里程碑路线](../milestones/milestones.md)。

## 6. 相关文档

- [Core 契约](./core.md) · [Provider 契约](./provider.md) · [验证契约](./verification.md)
- [Preset 契约](./preset.md) · [Policy 设计](../architecture/policy.md)
