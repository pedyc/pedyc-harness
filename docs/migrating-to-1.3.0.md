# 迁移到 1.3.0

> 1.3.0 让治理真正生效：`protectedPaths` / `forbiddenCommands` 从「声明但不管用」变成「真的拦」，
> 验证结果从「执行过」变成「可复核」（结构化证据、信任等级、Findings 与处置层）。
>
> **需要动作的项目是少数**，但**至少有一项无条件生效的行为变更**：没有任何证据时运行不再可能通过。
> 本文逐项说明谁会受影响、怎么改，以及哪里不需要改。

变更全貌见 [CHANGELOG](https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md)。版本判定
依据见 [发布与版本规则](./release.md) §11。能力契约见
[里程碑 M14](./milestones/M14.md)。

## 1. 这次变更对使用者的影响

| 变更 | 影响 |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `protectedPaths` / `forbiddenCommands` / `agentTimeoutMs` 真的生效 | **行为变化**：此前只被接受、不产生效果，见第 2 节 |
| 没有任何可判定的证据时 Reviewer 不得批准 | **无条件生效**：`requiredChecks` 为空的项目不再能通过，见第 3 节 |
| `iteration-<n>-verification.json` 与 `RunResult.evidence` 变结构化 | 兼容性扩展：文件名不变，字段变多，见第 5 节 |
| Reviewer 可以返回 `findings` 而不只是 `approved` | 兼容性扩展：`approved` 仍被接受，见第 4 节 |
| `policy.json` 新增 `rules` / `severityActions` / `maxSemanticCalls` | 新增，不写就没有 |
| `harness.json` 与 Preset 的 `verification` 字段开始被读取 | 此前声明它等于没写；内容非法现在会让配置失败，见第 4 节 |
| `run --semantic=disabled` | 新增开关 |
| 配置错误的退出码仍是 `5` | 与 1.2.0 相同 |

## 2. 声明式策略现在会拦：加 `onViolation: report` 作为退路

如果你的 `policy.json` 里已经写了这些字段，而你需要的是**旧行为**（声明了但不管用）：

```json
{
  "onViolation": "report"
}
```

它把违规降级为记录，不再让运行失败。两点必须清楚：

- 它**不**解除对危险副作用的控制：被 `forbiddenCommands` 命中的命令在任何模式下都不会被启动，
  只是不再据此把运行判失败；
- 它**不**适用于「没有证据不得批准」这条（见第 3 节）。

需要按目录逐项检查的地方：

| 字段 | 新的实际行为 |
| ---------------------- | ------------------------------------------------------------ |
| `protectedPaths` | 改动命中受保护路径即拒绝，并单独报告 `Protected files changed: …` |
| `allowedProductPaths` | 与之前一致：前缀匹配，不在集合内即越界 |
| `forbiddenCommands` | 在进程创建**之前**按 token 序列拒绝；被拒命令没有副作用 |
| `allowedAgentCommands` | 精确成员名；空表表示不限制 |
| `agentTimeoutMs` | 到期终止该次 Provider 调用，终止原因记为 `timeout` |
| `maxChangedFiles` | 单次 Coder 迭代的改动文件数上限 |

## 3. 至少需要一条闸门（无条件生效）

1.3.0 起，**没有任何可判定的 Evidence 时 Reviewer 不得批准**。这意味着：

```json
{ "requiredChecks": [] }
```

不再能让运行通过——它会以 `agent_error` 结束，并在 `issues` 里写明缺少证据。修法：

```json
{ "requiredChecks": ["build", "type-check", "test:unit"] }
```

`requiredChecks` 的每个名字都必须是目标项目 `package.json` 里真实存在的脚本，`verify` 会提前断言。

## 4. 可选的新能力

### 4.1 `policy.rules` 与 `severityActions`（只能收紧）

```json
{
  "rules": {
    "change.claimed-file-missing": { "severity": "error" }
  },
  "severityActions": { "warning": "reject" }
}
```

- key 必须是**已声明的 rule id**（内置规则表，或 `verification` 文档里声明的检查）；
  写一个没人声明的 id 会让配置失败，而不是被静默忽略。
- 只能把 `warning` 提升为 `error`、把 `review` 改为 `reject`；反向操作会被拒绝。

### 4.2 `verification` 文档：声明式约束与语义检查

`.harness/harness.json` 的 `verification` 字段（或 `.harness/verification.json`）此前声明了也没人读，
现在它是检查声明文档：

```json
{
  "checks": [
    {
      "id": "team.animation-duration",
      "kind": "constraint",
      "verification": "structural",
      "severity": "warning",
      "analyzer": "css.duration",
      "constraint": { "target": "css", "property": "animation-duration", "operator": "<=", "value": "400ms" }
    },
    {
      "id": "team.no-oversized-animation",
      "kind": "verification",
      "verification": "semantic",
      "severity": "warning",
      "prompt": "prompts/animation.md",
      "trigger": { "kind": "rules", "rules": ["team.animation-duration"] }
    }
  ]
}
```

不写这个文档的项目不受影响。写了但内容非法的项目会在配置阶段失败（退出码 `5`），并指出文档与字段。

### 4.3 `agents.json` 的 `source` 与 Reviewer 的 Findings

- 每个 role 可以声明 `source`，用于回答「Reviewer 是否与 Coder 同源」。这只是**声明与审计**，
  不是强制：所有阶段共用一个 provider 仍然是合法配置。
- Reviewer 可以返回 `findings` 而不是 `approved`。缺省的 `approved` 视为「无异议」，
  显式 `approved: false` 仍然拒绝。

## 5. 不需要改的部分

| 你可能担心的地方 | 实际情况 |
| --------------------------------------- | ------------------------------------------------------------ |
| `RunResult.verification` | **保留**，是 `Evidence` 的投影；既有消费者不用改 |
| 自己调用 `runOrchestrator` 的代码 | `runVerification` 仍接受 `VerificationCheck[]`，会被升级为证据 |
| `iteration-<n>-verification.json` 的文件名 | 不变，内容从旧投影变成结构化证据数组 |
| dry-run 的输出 | 仍是四阶段、`status: passed`；不产生证据，也不写 `scope` / `semantic` |
| Reviewer 只返回 `approved: true` 的 adapter | 继续可用（兼容字段） |
| 语义检查 | 不声明就不调用；`--semantic=disabled` 会显式记录禁用状态 |

## 6. 复现方式

在一个仓库之外的临时项目里：

```bash
npm install --save-dev pedyc-harness@1.3.0 @pedyc/harness-preset-vue@1.3.0
npx pedyc-harness init --preset vue
npx pedyc-harness verify
npx pedyc-harness run --dry-run --json
```

| 能力 | 复现方式 |
| ------------------ | ------------------------------------------------------------ |
| 受保护路径真的被拦 | 改动命中 `protectedPaths` 的文件后运行：`run` 失败并指出该文件 |
| 禁止命令真的被拒 | 让 Provider 或验证命令命中 `forbiddenCommands`：拒绝发生在执行之前，且无副作用 |
| 声明变强制有退路 | `onViolation: report` 保持只报告行为 |
| 证据可复核 | 每轮 `iteration-<n>-verification.json` 含命令、退出码、耗时与输出摘要 |
| 判定结构化 | Reviewer 返回 Findings，按 `severity → action` 处置；越界一票否决 |

## 7. 相关文档

- [CHANGELOG](https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md)
- [Policy 契约](./interfaces/policy.md) — 字段表与 `rules` / `severityActions`
- [验证契约](./interfaces/verification.md) — Evidence、Finding、检查声明与语义检查
- [治理流水线](./architecture/governance.md) — 三层链路与失败模式
- [里程碑 M14](./milestones/M14.md) — 1.3.0 的能力契约与验收标准
