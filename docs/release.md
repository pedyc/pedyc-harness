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
3. 在系统临时目录创建真实 npm 项目，用 `npm install` 安装四个 tarball。四个包必须在同一条
   安装命令里，npm 才能用本地 tarball 满足 `@pedyc/harness-core@1.0.0` 这类跨包依赖。
4. 通过 `node_modules/.bin/pedyc-harness` 驱动安装后的 CLI：
   - `init --preset vue`；
   - `verify` 在缺少门禁脚本时必须失败，补齐脚本后必须通过；
   - `doctor` 必须报告 npm；
   - `run --dry-run --json` 必须是四阶段预览；
   - 配置一个离线 Provider 后跑完整四阶段闭环，四个门禁必须真实执行且全部通过。

消费者目录位于系统临时目录，不会命中本仓库的 workspace 链接，因此「本地能跑、装上就坏」
的问题会在这里暴露。第 4 步的两向 `verify` 检查很关键：如果消费者项目没有 `package.json`，
`requiredChecks` 校验会被跳过，`verify` 看起来通过其实什么都没验证。

## 发布步骤

前置条件（无法由脚本代替）：

1. 拥有 npm 账号，并且该账号拥有 `@pedyc` scope 或有权在其下发布。用
   `npm org ls pedyc --registry https://registry.npmjs.org/` 确认，输出应包含你的账号和
   `owner`（或至少 `developer`）。
2. `npm login --registry https://registry.npmjs.org/`。
3. 解决 2FA。账号若启用了 `auth-and-writes`（用 `npm profile get --json` 查看 `tfa.mode`），
   每次发布都需要一次性密码。推荐做法是在 `~/.npmrc` 中配置一个可绕过 2FA 的令牌：

   ```
   //registry.npmjs.org/:_authToken=<Automation token 或带 Bypass 2FA 的 Granular token>
   ```

   也可以用 `--otp <code>` 临时传入，但四个包是四次独立调用，30 秒窗口内很可能来不及。
4. `pedyc-harness` 这个非 scoped 包名未被他人占用。

### registry 陷阱

npm 命令默认走 `.npmrc` 里的 `registry`。本机若指向 `registry.npmmirror.com`，会出现两类
误导性错误：

- `npm org ls` 报 404。该镜像**没有实现 org 接口**，对任何 org 都返回 404，包括确实存在的。
- 发布打到镜像上，同样以 not found 收场。

`release:publish` 已经显式传入 npmjs.org，不受影响；但手工排查时必须自己带上
`--registry https://registry.npmjs.org/`。

另外，npm 在权限不足时返回的是 **404 而不是 403**。所以「not found」既可能是资源不存在，
也可能是你没权限看它——这是排查 npm 权限问题时最容易走弯路的地方。

```bash
pnpm install --frozen-lockfile
pnpm run release:publish -- --dry-run   # 预检：认证、版本占用、打包
pnpm run release:publish                # 真正发布
```

`release:publish` 按 Core → preset-generic → preset-vue → CLI 的依赖顺序发布，并在每一步之前
拒绝执行：

- 未登录，或登录账号无法访问目标 registry。
- 四个包版本号不一致。
- 目标 registry 上已存在同名同版本（npm 不允许覆盖，且部分发布最难收拾）。
- `release:check` 未通过。可用 `--skip-preflight` 跳过，但不应在正式发布时使用。
- 使用 `pnpm publish` 而非 `npm publish`：只有 pnpm 会把 `workspace:*` 改写成发布版本号。

`--registry` 可覆盖目标 registry，默认 `https://registry.npmjs.org/`。

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
