# 迁移到 1.2.0

> 1.2.0 引入声明式配置层：`.harness/harness.json` 成为项目治理的声明入口，Preset 从代码包变成可继承的
> npm 数据包。
>
> **迁移是可选的。** 只有 `.harness/policy.json` 的既有项目在 1.2.0 上行为不变；本文给出想迁移时的
> 步骤，以及在每个步骤上会被什么卡住。

变更全貌见 [CHANGELOG](https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md)。版本判定
依据见 [发布与版本规则](./release.md) §11。

## 1. 这次变更对使用者的影响

| 变更 | 影响 |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `.harness/harness.json` 成为声明入口 | 新增;不存在时回落到约定路径,见第 4 节 |
| Preset 变成 npm 数据包(`preset.json` + `extends`) | 升级 Preset 是升级依赖,不再是逐文件合并 |
| `init` 不再把 Preset 的 `policy.json` / `agents.json` 复制进项目 | 项目里**没有**这两份文件是正常的 |
| 两个 Preset 包移除默认导出 | **Breaking**:`import preset from '@pedyc/harness-preset-vue'` 失效,见第 5 节 |
| 新增 `list-presets`;`doctor` 报告配置来源 | 新增,不影响既有用法 |
| 配置错误的退出码由 `1` 变成 `5` | **唯一无条件生效的行为变更**,见第 4 节 |

## 2. 先判断要不要迁移

| 你现在的项目 | 需要做什么 |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| 只有 `.harness/policy.json` / `agents.json`,没有用 Preset | **不必迁移**。升级包即可,行为不变 |
| `import preset from '@pedyc/harness-preset-*'` | **必须改**,默认导出已移除,见第 5 节 |
| 想让 Preset 提供默认治理,并且以后靠 `npm update` 升级治理 | 建议迁移,见第 3 节 |
| 想让多个 Preset 的治理**同时**生效 | 今天做不到:字段级合并是目标(M17)。见第 6 节 |

## 3. 迁移步骤

### 3.1 升级到 1.2.0

四个包同步发布,版本号相同:

```bash
npm install --save-dev pedyc-harness@1.2.0 @pedyc/harness-preset-vue@1.2.0
```

若项目本来就没有依赖 Preset 包,只升级 `pedyc-harness` 即可;下一步的 `init` 会装上缺失的 Preset。

### 3.2 生成清单与契约文件

```bash
npx pedyc-harness init --preset vue
```

`init` 是幂等的,**只写不存在的东西**:已有的 `policy.json`、`agents.json`、`AGENTS.md` 不会被覆盖
(内容不同的已存在文件会被保留并列出,只有 `--force` 才覆盖)。若目标 Preset 尚未安装,`init` 会用
探测到的包管理器以 `--save-dev` 装上它;`--no-install` 关掉这一步。

这一步之后 `.harness/` 里应当有:

```text
.harness/
├── harness.json                ← 新的声明入口
├── harness.schema.json         ← 清单契约
├── input.schema.json
├── output.schema.json
├── agent-response.schema.json
├── task.example.json
├── policy.json                 ← 你原有的,被保留
└── agents.json                 ← 你原有的,被保留
```

> 只在手写清单、没跑 `init` 时:项目有 `harness.json` 就**必须**同时有
> `.harness/harness.schema.json`,否则 `verify` 会以退出码 `5` 失败。补文件用
> `npx pedyc-harness update`(只写回缺失的契约文件)。

### 3.3 检查清单

`init` 写出的清单只声明包名:

```json
{
  "$schema": "https://pedyc.dev/schema/harness.json",
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"]
}
```

三点容易写错:

- 写**包名**,不是短名。短名只在命令行上展开(`--preset vue` → `@pedyc/harness-preset-vue`)。
- `extends` 是**预设之间**的字段,写在 Preset 包的 `preset.json` 里。项目清单里写 `extends` 会因
  未知字段被拒绝,项目侧用的是 `presets` 数组。
- 清单里的 `policy` / `agents` 路径相对 `.harness/` 解析,不得是绝对路径,也不得用 `..` 越出
  `.harness/`。

### 3.4 确认生效来源

```bash
npx pedyc-harness doctor
```

```text
Configuration sources:
  manifest	.harness/harness.json
  preset	@pedyc/harness-preset-vue/policy.json
  policy	.harness/policy.json
```

**读法很关键,也是这次迁移最容易误判的一点。** 上一份输出说明:Preset 被解析出来了,但
`policy` 那一行是你自己的 `.harness/policy.json`——它**整份压过** Preset 的 policy。
字段级合并是目标(M17),尚未实现。因此:

> 只要你保留自己的 `policy.json`,Preset 自带的 `requiredChecks`、`protectedPaths` 等
> **一个都不会生效**。要让 Preset 的治理生效,就得删掉项目自己的 `policy.json` 让它回落到
> Preset,或者把 Preset 的内容重述进你的 `policy.json`。

### 3.5 验证

```bash
npx pedyc-harness list-presets
npx pedyc-harness verify
npx pedyc-harness run --input .harness/task.example.json --dry-run --json
```

`list-presets` 标注每一项是 `declared` 还是 `inherited`:

```text
@pedyc/harness-preset-vue	declared
```

## 4. 不迁移时的行为

**什么都不用做。** 没有 `harness.json` 的项目在 1.2.0 上:

- 配置来源不变:继续读取 `.harness/policy.json` 与 `.harness/agents.json`;
- 字段语义不变,`run --dry-run --json` 的输出形状不变;
- `verify` 只在 `harness.json` 存在时才要求 `harness.schema.json`,早于清单的项目不会因为引入新文件
  而突然失败;
- 已经跑过 `init` 并且有自己 `policy.json` / `agents.json` 的项目按原样工作:项目文档优先于 Preset,
  因此行为不会被 Preset 改变。

**唯一无条件生效的变化是退出码**:配置缺失、非法或路径越界时,`run` 与 `verify` 返回 `5` 而不是 `1`。
按退出码判断的 CI 脚本需要相应调整。完整退出码表见 [CLI 契约](./interfaces/cli.md) §8。

## 5. 默认导出被移除(Breaking)

两个 Preset 包现在是纯数据包,没有 `src/`、`dist/`、类型声明与构建步骤,也不再依赖
`@pedyc/harness-core`。因此:

```ts
// 1.1.0 及更早:不再可用
import preset from '@pedyc/harness-preset-vue'
```

替代路径是「安装包 + 在清单里声明包名」:

```bash
npm install --save-dev @pedyc/harness-preset-vue
```

```json
{
  "version": 1,
  "presets": ["@pedyc/harness-preset-vue"]
}
```

升级 Preset 之后由 `npm update` 完成,不再需要 `update` 逐文件同步。同时
`@pedyc/harness-core/contracts` 不再导出 `Preset` 与 `PresetDetection`;替代类型是
`PresetManifest` 与 `ResolvedPreset`,见 [Core 契约](./interfaces/core.md)。

按 [发布与版本规则](./release.md) §11,删除公开导出默认属于 MAJOR;这两项命中该节的
**「未消费 API」例外**(被删导出没有文档化用法),因此 1.2.0 判为 MINOR。

## 6. 迁移之后仍然受限的部分

避免把目标形态当成现状:

| 能力 | 现状 |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| Preset 继承与解析 | ✅ `extends`、去重、依赖在前、环检测已实现 |
| 多份 policy 之间合成 | ❌ **整份覆盖**,不是字段合并(M17) |
| `protectedPaths` / `forbiddenCommands` 真正拦截 | ❌ 当前只校验字段格式,强制执行属 M7(1.3.0) |
| 结构化验证证据(退出码、耗时、输出摘要) | ❌ 属 M8(1.3.0) |
| `RunRecord` 与 provenance | ❌ 属 M9 / M17 |

沿革与依赖顺序见[里程碑路线](./milestones/milestones.md)。

## 7. 回退

迁移是可逆的,因为它是增量的:

1. 删除 `.harness/harness.json`(以及 `.harness/harness.schema.json`),配置来源立即回到
   `.harness/policy.json` 与 `agents.json`;
2. 保留 `pedyc-harness@1.2.0` 即可,不需要回滚包版本——**唯一的例外**是若你曾依赖 Preset 包的默认
   导出,那必须按第 5 节改用清单声明,回退到 1.1.0 才能恢复旧写法。

## 8. 相关文档

- [从零接入 Harness](./getting-started.md) — 新项目接入的完整走查
- [Preset 契约](./interfaces/preset.md) · [Core 契约](./interfaces/core.md)
- [CLI 契约](./interfaces/cli.md) — 命令、产物与退出码
- [Preset 架构](./architecture/preset.md) — 解析语义与目标形态
- [Release](./release.md) — 版本规则与发布闸门
- [文档导航](./README.md)
