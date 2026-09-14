# 发布与版本规则

本文说明 Pedyc Harness 的发布单元、版本策略、发布前检查和 Provider 安全边界。
里程碑背景见 [里程碑路线](./milestones.md)，命令细节见 [CLI 使用与生成规则](./cli.md)。

## 发布单元

四个包同步发布，共享同一个版本号：

| 包 | 目录 | 说明 |
| --- | --- | --- |
| `@pedyc/harness-core` | `packages/core` | Runtime 原语，无 Vue 依赖 |
| `pedyc-harness` | `packages/cli` | 自包含 CLI 与 Preset Registry |
| `@pedyc/harness-preset-generic` | `packages/preset-generic` | 通用契约与安全策略 |
| `@pedyc/harness-preset-vue` | `packages/preset-vue` | Vue 3 约定 |

根目录 `pedyc-harness-workspace` 是 `private: true` 的集成宿主，不发布。

版本号固定同步，是因为 CLI 声明了对 Core 和两个 Preset 的精确依赖。允许各包独立
演进会让用户遇到「CLI 1.x 需要 Core 2.x」这类矩阵组合问题，而对当前规模来说，
同步版本带来的可预测性远大于收益。

## 版本策略

遵循 SemVer，按对外可见的契约判断：

- **MAJOR**：破坏 `.harness/` 的 JSON Schema、结构化输出字段、CLI 命令或参数语义、
  Provider 请求/响应协议。
- **MINOR**：新增 Preset、新增命令或参数、新增可选配置字段、新增导出 API。
- **PATCH**：修复缺陷、调整文案、内部重构且不改变对外契约。

`.harness/` 契约是版本策略的核心。以下内容一旦发布即视为稳定接口：

- `.harness/input.schema.json`、`.harness/output.schema.json`、
  `.harness/agent-response.schema.json` 定义的字段。
- Provider 协议：stdin 读一个 JSON 请求、stdout 写一个 JSON 响应、stderr 记录诊断。
- `run --dry-run --json` 的结构化结果：`status`、`dryRun`、`phases`。
- `policy.json` 的字段含义，以及 `protectedPaths`、`allowedProductPaths` 的判定方式。

CLI 渲染到终端的文字不属于稳定契约，可以随时调整。

## 依赖与打包规则

- workspace 内部依赖一律写 `workspace:*`。`pnpm pack` 会在打包时改写成发布版本号，
  `pnpm run release:check` 会校验 tarball 中不再残留 `workspace:` 范围。
- 每个包通过 `files` 白名单只发布 `src`（Core 另含子路径导出）`templates`、`README.md`。
  `LICENSE` 和 `README.md` 由 npm 自动收录。
- `LICENSE` 在各包目录内各存一份，tarball 不依赖仓库根目录。
- Scoped 包声明 `publishConfig.access: public`。
- 发布包不得引用仓库内路径。CLI 曾通过 `../../..` 反向调用根目录脚本，这类写法会被
  `release:check` 的临时消费者测试拦下。
- 外部运行时依赖只有 `ajv`。

## 发布前检查清单

```bash
pnpm install --frozen-lockfile
pnpm run harness:verify     # 仓库 Harness 契约（22 个文件、4 个门禁）
pnpm run verify:examples    # 三个外部样例项目
pnpm run release:check      # 打包、tarball 内容、消费者 smoke test
pnpm run type-check
pnpm run test:unit
pnpm run build
```

`release:check` 会：

1. 对四个包执行 `pnpm pack`。
2. 解包检查必需文件、泄漏文件（`tests/`、`examples/`、`scripts/`）和 `workspace:` 残留。
3. 把 tarball 解压到临时消费者项目的 `node_modules/`，用包内 bin 入口执行
   `init --preset generic|vue`、`verify`、`doctor` 和 `run --dry-run --json`。
4. 校验 dry-run 输出的 JSON 结构。

消费者目录位于系统临时目录，不会命中本仓库的 workspace 链接，因此「本地能跑、装上就坏」
的问题会在这里暴露。

## 发布步骤

依赖顺序：先 Core，再 Preset，最后 CLI。

```bash
pnpm install --frozen-lockfile
pnpm run release:check
pnpm --filter @pedyc/harness-core publish --access public --no-git-checks
pnpm --filter @pedyc/harness-preset-generic publish --access public --no-git-checks
pnpm --filter @pedyc/harness-preset-vue publish --access public --no-git-checks
pnpm --filter pedyc-harness publish --access public --no-git-checks
```

发布后：

- 更新 `CHANGELOG.md`，把 `Unreleased` 段落归入新版本号。
- 在干净目录执行 `npx pedyc-harness@<version> verify`，确认 registry 安装可用。
- 给仓库打 `v<version>` tag。

## Provider 安全边界

- 发布包不假设用户机器上安装或登录了任何 Agent CLI。Preset 生成的 `agents.json`
  不含 Provider，`verify` 和 `run --dry-run` 在无 Provider 时即可使用。
- 非 dry-run 运行必须由用户在 `.harness/agents.json` 中显式配置 Provider 命令。
  Harness 只按约定传入标准输入并读取标准输出，不代替用户做鉴权决策。
- 仓库自带的 `scripts/harness/claude-adapter.mjs` 是可选的本地适配器示例，
  默认不启用。它不会传递 `--dangerously-skip-permissions` 或任何跳过确认的参数。
- 写入范围由 `policy.json` 约束：`protectedPaths` 拒绝修改，`allowedProductPaths`
  限定产品代码范围。越界改动会在 Tester 阶段被报告。
- CLI 不执行网络请求。所有命令都在目标项目内本地完成。

## 兼容性策略

- Node.js >= 20，包声明 `engines.node`。
- Windows 与 Linux 均受支持：包管理器通过锁文件探测，命令入口同时提供可执行脚本
  与 `node <path>` 方式；`release:check` 在两个平台都可运行，CI 在 `ubuntu-latest` 执行。
- 包管理器支持 npm、pnpm、yarn，按锁文件优先级 `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json` 选择。
- `verify` 先做通用校验，再执行可选的 `.harness/verify.mjs` 项目钩子，因此项目可以
  在不修改 Core 的前提下追加严格检查。
- 升级既有项目配置用 `pedyc-harness diff` 预览、`pedyc-harness update` 应用；
  `update` 默认跳过已修改文件，只有 `--force` 才覆盖。
