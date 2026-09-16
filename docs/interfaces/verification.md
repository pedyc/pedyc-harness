# 验证契约

> 一次运行里"通过"是如何被判定的,以及判定依据被记录成什么。
>
> 来源:`packages/core/src/contracts/validation.ts`、`packages/core/src/runtime/approval-gate.ts`、
> `packages/cli/src/run.ts`。

## 1. 闸门如何执行

验证闸门来自 `policy.requiredChecks`。每个条目是一个
**包脚本名**,由探测到的包管理器执行:

| 锁文件 | 实际调用 |
| ------------------ | ------------------ |
| `pnpm-lock.yaml` | `pnpm run <script>` |
| `yarn.lock` | `yarn <script>` |
| 其他 | `npm run <script>` |

脚本**串行**执行,没有并行调度、没有依赖关系、没有失败跳过语义。

`pedyc-harness verify` 会先断言这些脚本名在目标项目的 `package.json` 中确实存在,否则直接失败并
报出缺失的脚本名。

## 2. 记录类型

整个验证面只有一个类型:

```ts
interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'
  details: string
}
```

| 字段 | 内容 |
| --------- | -------------------------------------------------------------- |
| `command` | 形如 `pnpm run build` 的可读命令串 |
| `result` | 退出码为 0 时 `'pass'`,否则 `'fail'` |
| `details` | 失败时取 stderr;成功时为固定文案 `Command completed successfully.` |

## 3. 阶段通过条件

两条判定都在 Harness 侧,不采信 Agent 的自我描述:

```ts
testerApproved(verification, externalTest) =
  verification.every((check) => check.result === 'pass')
  && externalTest.ok
  && externalTest.payload.approved === true

reviewerApproved(reviewer, outOfScopeChanges) =
  reviewer.ok
  && reviewer.payload?.approved === true
  && outOfScopeChanges.length === 0
```

两个要点:

- **Tester 通过需要两个独立条件同时成立**:所有闸门真的通过,且外部 tester 认可它收到的证据。
  没有闸门时 `every` 为 `true`,因此 `requiredChecks` 为空意味着验证形同虚设。
- **范围检查由 Harness 执行**,不交给 Agent。即使 reviewer 批准,只要有越界文件就判定不通过。

## 4. 重试

Tester 未通过时回到 Coder,上限为 `min(input.maxIterations, policy.maxIterations)`,缺省 3。
Coder 会收到上一轮完整的 `verification` 数组作为 `previousVerification`——这是失败原因回流给
Agent 的唯一通道。

Planner、Coder、Reviewer 任一失败都会**直接终止**,不重试。

## 5. 产物

每次运行写入 `.harness/runs/<runId>/`:

| 文件 | 写入时机 |
| -------------------------------------- | ---------------------------- |
| `input.json` | 编排开始前 |
| `policy.json` | 编排开始前 |
| `iteration-<n>-verification.json` | 每轮 Tester 之后 |
| `output.json` | 结束时的最终 `RunResult` |

`runId` 由 ISO 时间戳去掉非数字字符后取前 14 位生成。

## 6. 尚未记录的内容

> **目标(M8)** 下列内容均**未实现**,`VerificationCheck` 里没有对应字段:
>
> - 退出码的结构化记录(现在只折叠成 `pass`/`fail`)
> - stdout 留存与截断策略
> - 每条闸门的耗时与起止时间戳
> - 统一的 `ValidationEvidence` 模型与证据持久化

因此「Agent 的自我描述不是证据」这条原则在当前实现里只做到了**结果层面的独立执行**,尚未做到
**过程层面的可复核**。

## 7. 另一条独立闸门:`verify` 命令

`pedyc-harness verify` 是**配置闸门**,不属于 `run` 的四阶段循环。它依次检查:`.harness/` 配置与
schema 是否齐全、JSON 是否可解析、`validatePolicy` 是否通过、`agents` 形状是否合法、
`requiredChecks` 对应的 npm 脚本是否存在。

若项目存在 `.harness/verify.mjs`,则用它以 `--root <项目根>` 调用该脚本,并**透传其退出码**。
这条钩子只在 `verify` 命令里执行,`run` 流程不会调用它。

## 8. 相关文档

- [Core 契约](./core.md) · [Policy 契约](./policy.md) · [Provider 契约](./provider.md)
- [Verification 设计](../architecture/verification.md)
- [里程碑路线](../milestones/milestones.md)
