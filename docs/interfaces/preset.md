# Preset 契约

> Preset 是**数据,不是代码**:它是一个 npm 包,用 `preset.json` 声明自己继承什么、提供了哪些文档。
> 包内没有任何东西会被执行。
>
> 来源:`packages/core/src/contracts/preset.ts`、`packages/core/src/config/presets.ts`、
> `packages/cli/src/presets.ts`。

## 1. 类型

```ts
interface PresetManifest {
  name: string                  // 必须等于所在包的包名
  extends?: string[]            // 包名,不含版本
  policy?: string               // 包内相对路径
  agents?: string               // 包内相对路径
  instruction?: string          // 包内相对路径,init 用它播种 AGENTS.md
  verification?: string         // 声明保留;暂无运行时消费
  rules?: string[]              // 声明保留;暂无运行时消费
}

interface ResolvedPreset {
  packageName: string           // 来自哪个 npm 包
  name: string                  // 清单里的名字,等于 packageName
  directory: string             // 包目录的绝对路径
  extends: string[]             // 直接依赖,声明顺序,已去重
  manifest: PresetManifest      // 校验过的 preset.json
}
```

`name` 必须等于解析它的那个包,否则 `extends` 会有歧义,循环报告也会指向一个读者找不到的包。
所有相对路径只能指向**本包之内**,不得越出包目录。

`verification` 与 `rules` 是当前仅有的两个「声明了但无人消费」的字段。相比之下旧模型有四个死字段
(`detection`、`defaultProductPaths`、`verificationScripts`、`skills`)——那一组类型已不存在。

## 2. 解析

```ts
resolvePresets(root: string, requested: string[]): PresetsResult
presetPackageName(requested: string): string
```

- `presetPackageName` 按**约定**展开:`vue` → `@pedyc/harness-preset-vue`;任何含 `/` 的值本身
  就是包名。**CLI 里没有预设表**——一张表意味着每出现一个新预设都要重新发布 CLI。
- `resolvePresets` 递归加载 `extends`,去重、检测循环,返回**依赖在前**的 `ResolvedPreset[]`:
  靠后的条目总是比它继承的更具体。继承关系只在解析结果里可见——项目能从 `harness.json` 看到自己
  声明了哪些包,但只有解析器知道它们拉进了什么。

解析失败返回结构化的 `HarnessConfigError[]`,相关错误码见 [Core 契约](./core.md):
`preset_not_installed`、`preset_manifest_unreadable`、`preset_manifest_invalid_json`、
`preset_manifest_invalid`、`preset_cyclic`、`preset_path_outside_package`。

## 3. Preset 包长什么样

两个官方预设的实际清单:

| 项 | 值 |
| ------------ | ---------------------------------------------------------------- |
| `exports` | `./preset.json` |
| `files` | `preset.json`、`policy.json`、`agents.json`、`AGENTS.md`、`README.md` |
| `scripts` | 无 |
| 依赖 | 无(含 `peerDependencies`) |
| `src/`、`dist/` | 无 |

没有 `build` 脚本,因此 `pnpm -r run build` 不构建它们;`release:check` 也断言预设包不携带
`src/` 或 `dist/`——一个仍然发布代码的预设会成为「什么是该预设」的第二份、且静默权威的定义。

`policy.json` / `agents.json` 由**解析器**在运行时读取;`instruction` 指向的 markdown 由 `init`
读取并写入目标项目的 `AGENTS.md`(取最后一个提供了 instruction 的预设)。**预设的内容不会被复制
进目标项目**,这正是升级时不会覆盖项目自身修改的原因。

## 4. CLI 如何使用 Preset

```bash
pedyc-harness init --preset vue               # 展开为 @pedyc/harness-preset-vue
pedyc-harness init --preset @acme/harness-preset-motion
pedyc-harness init --preset vue --no-install  # 包已就位时跳过安装
```

`init` 先解析目标预设;若失败且原因**仅仅是包未安装**,则用探测到的包管理器安装它
(`npm install --save-dev` / `yarn add --dev` / `pnpm add --save-dev`),然后重新解析。也就是说
`init` 只安装真正缺失的东西——重复执行 `init`、以及示例与测试里的场景都不会触网。

`list-presets` 用**同一次解析**列出项目跟随的预设及各自的继承,并标注 `declared`(来自
`harness.json`)或 `inherited`,顺序即解析器应用的顺序。列表因此不会与实际加载的内容漂移。

## 5. 配置合并尚未实现

> **目标(M17)** 把多个来源合成为 `EffectiveHarnessConfig`、字段级合并语义
> (见 [Preset 设计](../architecture/preset.md) 的合并策略表)、以及安全约束的 deny-wins——
> **均未实现**。

当前解析出的是一个**有序的预设列表**,不是合并后的配置。`ResolvedPreset[]` 依赖在前,「更具体者
胜出」目前只体现在 `instruction` 的选取上(取最后一个),尚未推广到 policy 与 agents 的字段级合并。

## 6. 相关文档

- [Core 契约](./core.md) — `HarnessManifest`、`ConfigSource`、配置错误码
- [CLI 契约](./cli.md) — `init` / `list-presets` / `verify` 的行为
- [Policy 契约](./policy.md) · [Provider 契约](./provider.md)
- [Preset 设计](../architecture/preset.md) · [里程碑路线](../milestones/milestones.md)
