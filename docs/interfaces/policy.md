# Policy Interface

> Policy 的代码契约与扩展接口。

## 1. Core Interface

```ts
export interface Policy<TContext = PolicyContext, TResult = PolicyResult> {
  readonly id: string
  readonly priority?: number

  evaluate(
    context: TContext
  ): TResult | Promise<TResult>
}
```

Policy Interface 只定义：

* Identity
* Priority
* Evaluation

不包含 Execution 或 Provider 逻辑。

---

## 2. Policy Context

```ts
export interface PolicyContext {
  readonly preset?: PresetRef
  readonly config: ResolvedConfig
  readonly execution?: ExecutionContext
  readonly metadata?: Record<string, unknown>
}
```

Context 是 Policy Evaluation 的输入。

Policy 不应该直接依赖具体 Provider 实现。

---

## 3. Policy Result

```ts
export type PolicyResult =
  | {
      readonly effect: 'allow'
      readonly reason?: string
    }
  | {
      readonly effect: 'deny'
      readonly reason: string
    }
```

Result 表达 Policy 的决策结果，而不是实际执行结果。

---

## 4. Policy Evaluation

多个 Policy 的求值由 Evaluation 层负责：

```ts
export interface PolicyEvaluator {
  evaluate(
    policies: readonly Policy[],
    context: PolicyContext
  ): Promise<PolicyDecision>
}
```

```ts
export interface PolicyDecision {
  readonly effect: 'allow' | 'deny'
  readonly matched: readonly string[]
  readonly reasons: readonly string[]
}
```

`Policy` 负责单个规则的判断。

`PolicyEvaluator` 负责多个 Policy 的组合与冲突处理。

---

## 5. Policy Reference

Preset 不直接嵌入 Policy 实现，而通过引用关联：

```ts
export interface PolicyRef {
  readonly id: string
  readonly version?: string
}
```

这样可以保持：

```text
Preset
  ↓
PolicyRef
  ↓
Policy Registry
  ↓
Policy
```

---

## 6. Policy Registry

```ts
export interface PolicyRegistry {
  get(id: string): Policy | undefined

  register(policy: Policy): void

  has(id: string): boolean
}
```

Registry 负责 Policy 的发现与管理，不负责 Evaluation。

---

## 7. 错误模型

Policy Evaluation 错误与 Policy Deny 应保持区别：

```text
Policy Result
├── allow
└── deny

Evaluation Error
└── evaluation failed
```

例如：

* `deny`：规则正常求值，结果是不允许
* `error`：规则无法正常求值

这两个状态不能混为一谈。

---

## 8. 依赖边界

Policy Interface 可以依赖：

```text
PolicyContext
ResolvedConfig
ExecutionContext
```

但不应直接依赖：

```text
Provider implementation
CLI
Verification implementation
具体 Execution engine
```

保持 Policy 的独立性。

---

## 9. 相关文档

* [Policy Architecture](../architecture/policy.md)
* [Policy Evaluation](../architecture/algorithms/03-policy-evaluation.md)
* [Preset Interface](./preset.md)
* [Core Interface](./core.md)
