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
| ---------- | --------------------------------------------- | ------------------------------------------------------ |
| `init` | `--preset <name>`、`--force` | 幂等写入模板;已存在且内容不同则跳过,除非 `--force` |
| `diff` | `--preset <name>` | 只打印状态,**不写任何文件** |
| `update` | `--preset <name>`、`--force` | 写回 `missing`;`modified` 仅在 `--force` 时写回 |
| `verify` | 无 | 配置闸门,见第 6 节 |
| `doctor` | 无 | 打印 4 行环境信息 |
| `run` | 见第 3 节 | 编排一次任务 |
| `help` | 无 | 打印用法,退出码 0 |

未知命令打印同一份用法并退出码 1;不带参数等同于 `help`。

`diff` / `update` 的状态取值只有三种:`missing`、`unchanged`、`modified`。

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

输入解析优先级:**`--task` > `--prompt` > `--input`**。`--task` 指向的文件不存在即失败;既无
`--task` 也无 `--prompt`、且 `--input` 不存在时同样失败。第一个不带 `-` 的参数也可作为 input 路径。

输出行为:给了 `--output` 就写文件;当 `--json` 存在或未给 `--output` 时,序列化结果同时写 stdout。

## 4. `init` 写入的文件

| 产物 | 来源 |
| ------------------------------------------- | ---------------------- |
| `.harness/policy.json` | Preset 的 `policy` |
| `.harness/agents.json` | Preset 的 `agents` |
| `AGENTS.md` | Preset 的 `instruction` |
| `.harness/task.example.json` | CLI 内置模板 |
| `.harness/input.schema.json` | CLI 内置模板 |
| `.harness/output.schema.json` | CLI 内置模板 |
| `.harness/agent-response.schema.json` | CLI 内置模板 |

`--preset` 只能是 `generic` 或 `vue`;其他取值报错并列出可用项。见 [Preset 契约](./preset.md)。

## 5. `run` 的产物

结果文档是 `RunResult`(见 [Core 契约 §3](./core.md)),匹配 `schemas/output.schema.json`。
运行产物写入 `.harness/runs/<runId>/`,文件清单见[验证契约 §5](./verification.md)。

`--dry-run` 不调用任何 Provider、不执行任何闸门、**不修改产品文件**;但它仍会写出
`.harness/runs/<runId>/` 下的运行产物(`input.json`、`policy.json`、`output.json`),并输出与正式
运行相同的四阶段记录,因此调用方可以用同一套输出契约消费它。

## 6. `verify` 做什么

依次检查,任一步失败即返回非零:

1. `.harness/policy.json` 与 `.harness/agents.json` 是否存在;
2. 三个 schema 文件是否存在,且全部 JSON 可解析;
3. `validatePolicy` 是否通过(要求见 [Policy 契约 §2](./policy.md));
4. `agents.providers` 中每个 provider 都有 `command` 与 `args`;
5. 四个阶段的 `mode` 均为 `internal` 或 `external`;
6. `requiredChecks` 里的每个脚本名都存在于目标项目 `package.json` 的 `scripts` 中;
7. 若存在 `.harness/verify.mjs`,以 `--root <项目根>` 调用并**透传其退出码**。

第 7 步的钩子只在 `verify` 命令中执行,`run` 流程不会调用它。

## 7. `doctor` 输出

固定 4 行,不做任何检查或断言:

```text
Project root: <绝对路径>
Configuration: found | missing (.harness)
Package manager: pnpm | yarn | npm
Node.js: v<版本>
```

## 8. 退出码

**只有 `0` 与 `1`。** 没有区分"策略拒绝""验证失败""输入非法"等情形的错误码分类。

## 9. 相关文档

- [Core 契约](./core.md) · [Preset 契约](./preset.md) · [验证契约](./verification.md)
- [CLI 设计](../architecture/cli.md) · [Release](../release.md)
