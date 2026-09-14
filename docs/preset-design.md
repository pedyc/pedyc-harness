# Preset 设计

Preset 是技术栈差异的载体，不负责实现任务编排。每个 Preset 至少应提供：

- 项目检测规则（例如 `vue` 依赖或 `vite.config.ts`）。
- 产品目录和受保护目录默认值。
- 默认验证命令。
- Agent、Instructions 和 Skills 模板。
- 该技术栈的编码约定。

当前 CLI 提供：

- `generic`：只生成通用契约和安全策略，适合非 Node 或自定义项目。
- `vue`：增加 Vue 3、TypeScript 和 Vite 约定。

当前 Preset 接口字段包括 `name`、`detection`、`defaultProductPaths`、
`verificationScripts`、`policy`、`agents`、`instruction` 和 `skills`。CLI Registry
负责发现 Preset，Core 不依赖任何具体技术栈。

```bash
npx pedyc-harness init --preset generic
npx pedyc-harness init --preset vue
```

Preset 模板应保持可读并复制到目标项目，不能只隐藏在 `node_modules` 中。项目可以在
生成后修改模板，并通过版本控制审查规则变化。

未来可将 Preset 拆为 `@pedyc/harness-preset-react` 等包；在真实出现多个生态之前，
不应过早引入复杂的插件生命周期。
