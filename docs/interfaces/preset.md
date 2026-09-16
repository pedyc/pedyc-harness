# Preset 契约

> `Preset` 是 `pedyc-harness init` 写入目标项目的配置来源,也是技术栈差异的唯一载体。
>
> 来源:`packages/core/src/contracts/preset.ts`、`packages/cli/src/presets.ts`。

## 1. 类型

```ts
interface PresetDetection {
  requiredFiles: string[]
  requiredDependencies: string[]
}

interface Preset {
  name: string
  detection: PresetDetection
  defaultProductPaths: string[]
  verificationScripts: string[]
  skills: string[]
  policy: Policy
  agents: AgentsConfig
  instruction: string
}
```

## 2. 字段是否真的被读取

这是使用本契约时最容易出错的地方——八个字段里**只有四个被任何代码消费**:

| 字段 | 是否被读取 | 作用 |
| ---------------------- | ---------- | ------------------------------------------------ |
| `name` | ✅ | `init/diff/update --preset <name>` 的表键 |
| `policy` | ✅ | 原样写成 `.harness/policy.json` |
| `agents` | ✅ | 原样写成 `.harness/agents.json` |
| `instruction` | ✅ | 原样写成 `AGENTS.md` |
| `detection` | ❌ | 声明了 `requiredFiles`/`requiredDependencies`,无人读取 |
| `defaultProductPaths` | ❌ | 同上 |
| `verificationScripts` | ❌ | 同上(闸门实际来自 `policy.requiredChecks`) |
| `skills` | ❌ | 同上,且没有对应的落盘机制 |

四个死字段意味着:改动它们不会产生任何效果。若要依赖其中任何一项,必须先让它被消费。

## 3. 落盘结果

`init` 把 Preset 展开成目标项目里的文件:

| 产物 | 来源 |
| ------------------------------------------- | ------------------------------ |
| `.harness/policy.json` | `preset.policy` |
| `.harness/agents.json` | `preset.agents` |
| `AGENTS.md` | `preset.instruction` |
| `.harness/task.example.json` | CLI 内置模板,**与 Preset 无关** |
| `.harness/input.schema.json` | CLI 内置模板 |
| `.harness/output.schema.json` | CLI 内置模板 |
| `.harness/agent-response.schema.json` | CLI 内置模板 |

`schema` 与 `task.example.json` 来自 `packages/cli/templates/`,任何 Preset 都得到同一份。

## 4. Preset 如何被解析

`packages/cli/src/presets.ts` 是一张**两个表项的静态 `Map`**:

```ts
const presets = new Map([
  [genericPreset.name, genericPreset],
  [vuePreset.name, vuePreset],
])
```

因此当前:

- 只有 `generic` 与 `vue` 可选,`--preset` 传其他值会报错并列出可用项;
- 没有 npm 发现机制、没有 `extends`、没有依赖图、没有环检测、没有配置合并;
- 第三方无法通过发布 npm 包新增 Preset,必须改这张表。

## 5. 目标形态

> **目标(M16)** Preset 将成为独立的 npm package,提供 `preset.json` 清单、`extends` 继承、
> DAG 解析(去重 + 环检测 + 拓扑排序)与字段级合并语义,最终合成为 Effective Governance 交给
> Runtime。当前以上均**未实现**。

完整设计与合并语义见[Preset 设计](../architecture/preset.md),阶段与依赖顺序见
[里程碑路线](../milestones/milestones.md)。

## 6. 相关文档

- [Core 契约](./core.md) · [Policy 契约](./policy.md) · [Provider 契约](./provider.md)
- [Preset 设计](../architecture/preset.md) · [CLI 契约](./cli.md)
