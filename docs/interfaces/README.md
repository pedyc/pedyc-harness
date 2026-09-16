# 接口总览

> 本目录记录 pedyc-harness **真实导出**的类型与函数契约。每个文件对应 `packages/` 中一组模块。
>
> 这里只写契约(类型、签名、语义)。系统结构见[架构](../architecture/README.md),设计动机见
> [决策](../decisions/README.md)。契约与源码不一致时,以源码为准。

## 模块对应关系

| 文档 | 对应实现 | 内容 |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------ |
| [core](./core.md) | `packages/core/src/{index,contracts,core,adapters}` | `@pedyc/harness-core` 的导出面与核心契约 |
| [preset](./preset.md) | `contracts/preset.ts`、`packages/cli/src/presets.ts` | `Preset` 与 `PresetDetection` |
| [policy](./policy.md) | `contracts/policy.ts`、`core/policy-engine.ts` | `Policy` 与三个执行函数 |
| [provider](./provider.md) | `contracts/agent.ts`、`adapters/provider-runner.ts` | Agent 调用协议(stdin/stdout) |
| [verification](./verification.md) | `contracts/validation.ts`、`core/approval-gate.ts` | 验证结果与阶段通过条件 |
| [cli](./cli.md) | `packages/cli/src/*` | 命令、参数、运行产物与退出码 |

## 一条跨模块规则

> **Agent 的自我描述不是独立验证证据。**

外部 Agent 返回的 `AgentPayload.approved` 只有在两件事同时成立时才被采信:Harness 自己执行的闸门
全部通过,且改动落在 `allowedProductPaths` 之内。判定在 `core/approval-gate.ts`,见
[verification](./verification.md)。

## 阅读约定

- 现在时陈述表示**已实现**;标注**目标**的内容尚未实现。
- 类型形状直接取自源码,并注明对应文件。
- 书写与检查规则见[文档规范](../CONVENTIONS.md)。
