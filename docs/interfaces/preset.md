# Preset Interface

> Preset 的类型、加载、注册与最终配置契约。

## 1. HarnessPreset

```ts
export type HarnessPreset = {
  name: string

  extends?: PresetRef[]

  allowedProductPaths?: string[]
  protectedPaths?: string[]

  requiredChecks?: CheckDefinition[]

  instructionTemplates?: string[]
  agentTemplates?: string[]
  skillTemplates?: string[]
}
```

Preset 只描述能力与默认配置，不负责 Runtime orchestration。

---

## 2. PresetRef

```ts
export type PresetRef =
  | string
  | {
      name: string
    }
```

`extends` 使用 package name 标识 Preset。

版本不由 Preset Reference 管理，而由 npm：

```text
package.json
+
lockfile
```

负责。

---

## 3. Preset Manifest

`preset.json` 描述 Preset package：

```ts
export interface PresetManifest {
  name: string
  extends?: string[]

  policy?: string
  verification?: string
  rules?: string[]
}
```

相对路径只能引用当前 Preset package 内的资源。

---

## 4. Preset Registry

```ts
export interface PresetRegistry {
  resolve(name: string): Promise<HarnessPreset>

  has(name: string): boolean
}
```

Registry 负责发现和加载 Preset。

它不负责：

* Preset 合并
* Policy Evaluation
* Execution
* Verification

---

## 5. Preset Resolver

```ts
export interface PresetResolver {
  resolve(
    roots: readonly PresetRef[]
  ): Promise<ResolvedPresets>
}
```

```ts
export interface ResolvedPresets {
  presets: readonly HarnessPreset[]
  order: readonly string[]
}
```

`order` 表示依赖优先的解析顺序。

---

## 6. Config Resolver

Preset Resolution 与 Config Resolution 是两个职责。

```ts
export interface ConfigResolver {
  resolve(
    presets: readonly HarnessPreset[],
    project?: ProjectConfig,
    task?: TaskConfig
  ): EffectiveHarnessConfig
}
```

流程：

```text
Preset Resolver
      ↓
Resolved Presets
      ↓
Config Resolver
      ↓
EffectiveHarnessConfig
```

---

## 7. Merge Strategy

配置字段必须声明合并语义：

```ts
export type MergeStrategy =
  | 'replace'
  | 'append'
  | 'merge'
  | 'deny-wins'
  | 'immutable'
```

Resolver 不应该使用无差别的 `deepMerge`。

---

## 8. EffectiveHarnessConfig

Runtime 的唯一配置入口：

```ts
export interface EffectiveHarnessConfig {
  readonly policies: readonly Policy[]
  readonly checks: readonly CheckDefinition[]
  readonly allowedPaths: readonly string[]
  readonly protectedPaths: readonly string[]

  readonly instructions: readonly string[]
  readonly agentTemplates: readonly string[]
  readonly skillTemplates: readonly string[]

  readonly provenance: ConfigProvenance
}
```

Runtime 不需要知道配置来自哪个 Preset。

---

## 9. Config Provenance

为了支持审计，需要保留配置来源：

```ts
export interface ConfigProvenance {
  readonly sources: readonly ConfigSource[]
}
```

```ts
export interface ConfigSource {
  readonly field: string
  readonly value: unknown
  readonly source: string
}
```

例如：

```text
protectedPaths
    ↓
@company/harness-preset
    ↓
security.json
```

---

## 10. Preset Errors

Preset Resolver 至少需要区分：

```ts
export class PresetNotFoundError extends Error {}

export class InvalidPresetError extends Error {}

export class CircularPresetError extends Error {}
```

循环依赖错误应包含完整路径：

```text
A → B → C → A
```

---

## 11. Interface Boundaries

Preset Interface 可以依赖：

```text
Policy
Verification
Config
Template
```

但不应该直接依赖：

```text
Provider implementation
CLI implementation
Execution engine
具体技术栈
```

Preset 是配置与能力描述层。

---

## 12. 相关文档

* [Preset Architecture](../architecture/preset.md)
* [Graph Algorithm](../architecture/algorithms/01-graph.md)
* [Config Resolution](../architecture/algorithms/02-config-resolution.md)
* [Policy Interface](./policy.md)
* [Core Interface](./core.md)
