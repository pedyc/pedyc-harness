# Preset 设计

Preset 是技术栈差异的载体，不负责实现任务编排。这是 [项目目标](./项目目标.md) 第二节设计原则 6
「流程与技术栈解耦、技术栈规则通过 Preset 注入」的落地。每个 Preset 至少应提供：

- 项目检测规则（例如 `vue` 依赖或 `vite.config.ts`）。
- 产品目录和受保护目录默认值。
- 默认验证命令。
- Agent、Instructions 和 Skills 模板。
- 该技术栈的编码约定。

当前 CLI 提供：

- `generic`：只生成通用契约和安全策略，适合非 Node 或自定义项目。
- `vue`：增加 Vue 3、TypeScript 和 Vite 约定。

## 接口

当前 Preset 是一个普通对象，字段包括 `name`、`detection`、`defaultProductPaths`、
`verificationScripts`、`policy`、`agents`、`instruction` 和 `skills`，定义在
`packages/preset-generic/src/index.mjs` 与 `packages/preset-vue/src/index.mjs`。

[项目目标](./项目目标.md) 第六节曾列出顶层 `allowedProductPaths`、`requiredChecks` 以及
`instructionTemplates`、`agentTemplates`、`skillTemplates` 等字段。实现时做了收敛：路径和
检查命令等策略统一收进 `policy`，提示词模板收敛为单个 `instruction` 加 `skills` 数组。
这样 CLI 只需要读取一个策略对象，不需要理解多套模板字段。

CLI Registry（`packages/cli/src/presets.mjs`）负责发现 Preset，Core 不依赖任何具体技术栈。

```bash
npx pedyc-harness init --preset generic
npx pedyc-harness init --preset vue
```

Preset 模板应保持可读并复制到目标项目，不能只隐藏在 `node_modules` 中。项目可以在生成后
修改模板，并通过版本控制审查规则变化。

## 扩展方式

`generic` 与 `vue` 已拆为独立 workspace 包。未来 React、Node、Python 等 Preset 应按同一
对象接口新增独立包，由 Registry 注册，不复制 Runtime 执行逻辑。在真实出现多个生态之前，
不应过早引入复杂的插件生命周期。
