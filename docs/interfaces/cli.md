# CLI 契约

> `pedyc-harness` 暴露的命令、参数、写入的产物与退出码。
>
> 来源:`packages/cli/src/{bin,cli,run,presets}.ts`。

## 1. 包与入口

| 项 | 值 |
| -------- | ------------------------------------------------ |
| 包名 | `pedyc-harness` |
| `bin` | `dist/bin.js` |
| `exports` | `.` → `dist/index.js`;`./run` → `dist/run.js` |
| `files` | `dist`、`templates`、`README.md` |

`dist/cli.js` 同样是必需文件,但**不是** bin:它通过 `..` 定位包内的 `templates/`,只有在 `dist/`
这一层深度才能正确解析。因此发布物必须同时包含 `dist` 与 `templates`。

## 2. 命令

| 命令 | 参数 | 行为 |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `init` | `--preset <name>`、`--force`、`--no-install` | 写清单与契约文件;缺失的预设会被安装,见第 4 节 |
| `verify` | 无 | 配置闸门,见第 6 节 |
| `list-presets` | 无 | 列出项目跟随的预设及继承;无清单时提示并成功退出 |
| `diff` | 无 | 只打印契约文件状态,**不写任何文件** |
| `update` | `--force` | 写回 `missing`;`modified` 仅在 `--force` 时写回 |
| `doctor` | 无 | 环境信息 + **配置来源**,见第 7 节 |
| `run` | 见第 3 节 | 编排一次任务 |
| `help` | 无 | 打印用法,退出码 0 |

未知命令打印同一份用法并退出码 1;不带参数等同于 `help`。`diff` / `update` 的状态取值只有三种:
`missing`、`unchanged`、`modified`。

`--preset` 只对 `init` 有意义:`diff` 与 `update` 处理的是 CLI 自带的契约文件,与预设无关。

## 3. `run` 的参数

| 参数 | 默认值 | 说明 |
| ------------------ | ---------------------- | ---------------------------------------------- |
| `--input <path>` | `.harness/task.json` | 已归一化的任务 JSON |
| `--task <path>` | — | 人类任务文件,经 `readTaskFile` 归一化 |
| `--prompt <text>` | — | 直接把一段文字当作 task 与 goal |
| `--output <path>` | — | 把结果写到该文件 |
| `--root <dir>` | 当前目录 | 项目根 |
| `--dry-run` | 关 | 只做预览 |
| `--json` | 关 | 结果写入 stdout |
| `--semantic <mode>` | `enabled` | `disabled` 显式关闭语义层,并写入 `RunResult.semantic`;也接受 `--semantic=disabled` |

`--semantic=disabled` 不会让语义层「静默不跑」:运行记录里 `semantic.status` 为 `disabled`,
且列出因此被跳过的检查。除 `disabled` 以外的取值一律视为 `enabled`。

输入解析优先级:**`--task` > `--prompt` > `--input`**。`--task` 指向的文件不存在即失败;既无
`--task` 也无 `--prompt`、且 `--input` 不存在时同样失败。第一个不带 `-` 的参数也可作为 input 路径。

输出行为:给了 `--output` 就写文件;当 `--json` 存在或未给 `--output` 时,序列化结果同时写 stdout。

## 4. `init` 写入的文件

`init` 先解析目标预设(必要时安装),然后**只写不存在的东西**:

| 产物 | 来源 |
| ------------------------------------------- | ------------------------------------------ |
| `.harness/harness.json` | CLI 生成,声明所选预设的包名 |
| `AGENTS.md` | 预设的 `instruction` 文件 |
| `.harness/task.example.json` | CLI 内置模板 |
| `.harness/input.schema.json` | CLI 内置模板 |
| `.harness/output.schema.json` | CLI 内置模板 |
| `.harness/agent-response.schema.json` | CLI 内置模板 |
| `.harness/harness.schema.json` | CLI 内置模板 |

**`policy.json` 与 `agents.json` 不再被复制进项目。** 它们由解析器在运行时从预设读取;项目要覆盖
时自己在 `.harness/` 下放一份即可。清单也刻意不写 `policy` / `agents` 指针——文档留在约定路径上,
项目日后移动或删除它们只改一处,而不是两处。

`--preset` 接受 `generic`、`vue`,或任何含 `/` 的包名(如 `@acme/harness-preset-motion`)。已存在且
内容不同的文件会被保留并列出,`--force` 才覆盖;若已有清单声明了自己的预设,`init` 会明确告知本次
预设**未被应用**。

## 5. `run` 的产物

结果文档是 `RunResult`(见 [Core 契约 §4](./core.md)),匹配 `schemas/output.schema.json`。
运行产物写入 `.harness/runs/<runId>/`,文件清单见[验证契约 §5](./verification.md)。

`--dry-run` 不调用任何 Provider、不执行任何闸门、**不修改产品文件**;但它仍会写出
`.harness/runs/<runId>/` 下的运行产物(`input.json`、`policy.json`、`output.json`),并输出与正式
运行相同的四阶段记录,因此调用方可以用同一套输出契约消费它。

## 6. `verify` 做什么

1. 用配置层加载 `.harness/`(`harness.json` → 预设解析 → policy / agents);任何配置问题都会被
   **逐条打印**(不是只报第一条),并以退出码 5 结束;
2. schema 是否齐全且为合法 JSON:始终要求 `input`、`output`、`agent-response`;
   **当且仅当 `harness.json` 存在时**,额外要求 `harness.schema.json`——早于清单的项目因此保持
   原样校验,不会因为引入新文件而突然失败;
3. `policy.requiredChecks` 里的每个脚本名都存在于项目 `package.json` 的 `scripts` 中;缺失属于
   **配置问题**(无需运行即可发现),因此同样以退出码 5 结束;
4. 若存在 `.harness/verify.mjs`,以 `--root <项目根>` 调用并**透传其退出码**。

第 4 步的钩子只在 `verify` 命令中执行,`run` 流程不会调用它。

## 7. `doctor` 输出

固定 4 行环境信息,随后是**配置来源**列表:

```text
Project root: <绝对路径>
Configuration: found | missing (.harness)
Package manager: pnpm | yarn | npm
Node.js: v<版本>
Configuration sources:
  manifest	.harness/harness.json
  preset	@acme/harness-preset-motion/policy.json
  policy	.harness/policy.json
```

来源列表是 `doctor` 的重点:一次运行**实际会用到哪些值**原本不可见,而回退到内置默认值与刻意配置
在外观上完全一样。`active: false` 的条目会标注 `(declared, not yet consumed)`。配置无法加载时,
`doctor` 报告错误并以退出码 5 结束,而不是给出一份看起来健康的报告。

## 8. 退出码

| 码 | 含义 |
| ---- | ------------------------------------------------------------ |
| `0` | 成功 |
| `1` | 一般失败(未知命令、预设安装失败、`run` 未通过) |
| `5` | **配置问题**:清单/策略/agents/schema 无法加载或非法、`requiredChecks` 指向不存在的脚本 |

`verify` 的第 4 步会透传 `.harness/verify.mjs` 的退出码,因此项目自有钩子可以返回自己的码。
`run` 的退出码由 `runHarness` 给出(0 / 1 / 5)。

## 9. 相关文档

- [Core 契约](./core.md) · [Preset 契约](./preset.md) · [验证契约](./verification.md)
- [CLI 设计](../architecture/cli.md) · [Release](../release.md)
