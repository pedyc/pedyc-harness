# Release 设计

> Release 文档定义 pedyc-harness 多 package 仓库的构建、版本、打包、发布前闸门与发布流程。
>
> Release 是工程交付流程，不属于 Harness Runtime。

本文档描述**当前实现**：每一条规则都对应仓库中一个真实文件或脚本。少数尚未落地的目标形态
单独以「目标（M16）」标注，不与现状混写。阶段划分见 [里程碑路线](./milestones/milestones.md)。

---

## 1. 发布目标

仓库由四个 npm package 组成，各有明确职责：

| Package | 目录 | 职责 |
| ----------------------------- | ---------------------- | ------------------ |
| `@pedyc/harness-core` | `packages/core` | Runtime 原语与跨模块契约 |
| `pedyc-harness` | `packages/cli` | CLI 与用户入口 |
| `@pedyc/harness-preset-generic` | `packages/preset-generic` | Generic Preset |
| `@pedyc/harness-preset-vue` | `packages/preset-vue` | Vue Preset |

Release 流程需要保证：

1. 每个 package 可以独立构建；
2. package 之间的依赖方向正确；
3. 发布内容只包含必要文件；
4. 类型声明与运行时代码来自同一次构建；
5. 发布前必须通过自动化闸门，而不是依赖人工检查；
6. 版本变化具有明确语义。

---

## 2. Package 与发布边界

Root package（`pedyc-harness-workspace`）是 `private` 的 workspace 根，**不是发布单元**。它只承担
Build、Test、Typecheck 与 Release 编排，不承载 Runtime。workspace 范围由 `pnpm-workspace.yaml`
声明为 `packages/*`。

当前四个发布单元的清单事实：

| Package | 版本 | `files` | `exports` 子路径数 |
| ----------------------------- | ----- | ------------------------------- | --- |
| `@pedyc/harness-core` | 1.1.0 | `dist`, `README.md` | 11 |
| `pedyc-harness` | 1.1.0 | `dist`, `templates`, `README.md` | 2 |
| `@pedyc/harness-preset-generic` | 1.1.0 | `dist`, `README.md` | 1 |
| `@pedyc/harness-preset-vue` | 1.1.0 | `dist`, `README.md` | 1 |

四个包均为 `publishConfig.access: public`，`engines.node` 为 `>=20`。仓库固定使用
`pnpm@10.15.0`（`packageManager` 字段）。目标项目使用 npm、pnpm 或 yarn 均可，与发布流程无关。

---

## 3. 依赖方向

`@pedyc/harness-core` 是最低层，不反向依赖 CLI、Preset、Vue 或具体 Provider。

真实的依赖边来自各包 `package.json` 的 `dependencies`：

```text
pedyc-harness                  → @pedyc/harness-core
pedyc-harness                  → @pedyc/harness-preset-generic
pedyc-harness                  → @pedyc/harness-preset-vue
@pedyc/harness-preset-generic  → @pedyc/harness-core
@pedyc/harness-preset-vue      → @pedyc/harness-core
```

这是**扇形**结构，不是 `preset → CLI → Core` 的链式结构：Preset 只依赖 Core，**不依赖 CLI**。
Core 的唯一运行时依赖是 `ajv`，没有任何 workspace 依赖。

发布顺序必须遵循依赖方向，由 `scripts/harness/publish.ts` 固定为：

```text
@pedyc/harness-core
        ↓
@pedyc/harness-preset-generic
        ↓
@pedyc/harness-preset-vue
        ↓
pedyc-harness
```

任何改动都不能形成循环依赖，也不能让 Core 反向依赖上层。

---

## 4. Build 与产物

每个 package 用 `tsc` 把 `src/` 编译到 `dist/`：

```text
packages/<name>/
├── src/
├── dist/          # 构建产物，发布内容
├── package.json
└── tsconfig.json
```

- 根 `build` 脚本为 `pnpm -r --if-present run build && tsc -p tsconfig.scripts.json`。
  前者构建四个 package，后者把 `scripts/*.ts` 编译到 `scripts/dist/*.js`。
- `dist/` 在 `.gitignore` 中，是构建产物而非源码；发布的正是它。
- 发布物必须是编译后的 `dist/*.js` 与 `dist/*.d.ts`，不能把 `src/*.ts` 当作发布产物。
- `prepare` 脚本等于 `build`，因此从 git 安装时也会先构建。

---

## 5. 验证命令

仓库实际提供的脚本如下。注意命令名与直觉不同：

| 用途 | 真实命令 | 说明 |
| ------------ | ------------------------------- | ------------------------------------------ |
| Typecheck | `pnpm run type-check` | `tsc --noEmit -p tsconfig.json` |
| Test | `pnpm run test:unit` | 先 `build`，再 `vitest run` |
| Build | `pnpm run build` | 见上一节 |
| Schema 同步 | `pnpm run schemas:sync` | 由 `schemas/` 生成各副本 |
| Schema 校验 | `pnpm run schemas:check` | 副本漂移时非零退出 |
| 样例项目验证 | `pnpm run verify:examples` | 外部项目兼容性 |
| Harness 自检 | `pnpm run harness:verify` | 校验本仓库的 `.harness/` 配置 |
| 发布闸门 | `pnpm run release:check` | 见下一节 |
| 发布 | `pnpm run release:publish` | 见第 14 节 |

不存在 `pnpm verify`、`pnpm typecheck` 或 `pnpm test`。Typecheck、Test、Build 三者职责不同，
不应互相替代；统一入口是 CI 的闸门链（下一节），而不是一个聚合脚本。

---

## 6. 发布前闸门

发布前必须通过完整验证。CI 在每次 push 与 pull request 上按固定顺序执行
（`.github/workflows/harness-verify.yml`）：

```text
pnpm install --frozen-lockfile
        ↓
pnpm run build          # 先构建：Harness 通过发布入口解析 workspace 包
        ↓
pnpm run harness:verify
        ↓
pnpm run schemas:check
        ↓
pnpm run verify:examples
        ↓
pnpm run release:check
        ↓
pnpm run type-check
        ↓
pnpm run test:unit
```

`build` 必须排在第一位：Harness 通过各包的**发布入口**（`exports`）解析 workspace 包，因此
`dist/` 必须先存在。

`release:check`（`scripts/harness/release-check.ts`）是发布专用的产物闸门，它不读源码，而是
对真实 tarball 做端到端验证：

1. 对四个包执行 `pnpm pack`；
2. 用内置 tar 读取器逐个检查 tarball，断言必需文件存在（`package.json`、`README.md`、
   `dist/index.js`、`dist/index.d.ts` 等，CLI 额外要求 `dist/bin.js`、`dist/cli.js`、
   `dist/run.js`、`dist/presets.js` 与四个 `templates/*.json`）；
3. 断言没有泄漏 `tests/`、`examples/`、`scripts/` 下的工作区文件；
4. 断言打包后的 `dependencies` 不再残留任何 `workspace:` 范围；
5. 在一个**真实的外部 npm 项目**里 `npm install` 这四个 tarball，确认交叉依赖由本地文件满足；
6. 确认 npm 生成了 `pedyc-harness` bin shim，并直接驱动该 shim（而不是源码路径）；
7. 执行 `init --preset vue`；随后断言 `verify` 在 `package.json` 缺少预设闸门时**必须失败**并
   报出缺失脚本名，补齐后才通过；
8. 执行 `doctor`，确认包管理器识别为 npm；
9. 执行 `run --dry-run --json`，断言输出符合契约（`dryRun: true`、四阶段、`status: passed`）；
10. 配置一个确定性的离线 echo provider，跑完整四阶段循环，并断言 Tester 真的执行了全部闸门。

第 5–10 步解释了为什么这个闸门不可省略：`files` 写漏、`workspace:*` 未改写、硬编码仓库路径、
`bin` 缺失，都会在这里失败，而不是在用户 `npm install` 之后才失败。

`pnpm run release:publish -- --dry-run` 可以在不发布的前提下预览将要推送的内容。

---

## 7. Package Contents

发布内容由各包 `package.json` 的 `files` 白名单（以及 `exports`、`bin`）共同决定。约定：

**应该包含**：`dist/`、`package.json`、`README.md`、`LICENSE` 与必要的 metadata。

**不应包含**：`src/`、`tests/`、内部开发脚本、本地配置、临时文件、开发日志。

两点实现细节：

- `LICENSE` 不在任何 `files` 数组中，但四个包目录下都有 `LICENSE` 文件。npm 始终自动包含
  `package.json`、`README`、`LICENSE`/`LICENCE`，因此这是有意的依赖，不需要写进 `files`。
- 四个包都**没有** `main`、`module`、`types` 顶层字段；入口完全由 `exports` 描述（见下一节）。

原则：npm package 应该是最小可运行发布物，而不是整个 Repository 的压缩包。

---

## 8. Exports

Package 必须明确公开 API，且入口键统一使用 `types` + `default`：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

`@pedyc/harness-core` 公开 11 个子路径，`pedyc-harness` 公开 2 个：

| 子路径 | 对应实现 |
| ---------------------- | ---------------------------- |
| `.` | `dist/index.js` |
| `./package-manager` | `dist/core/package-manager.js` |
| `./intake` | `dist/core/intake.js` |
| `./command` | `dist/core/command.js` |
| `./snapshots` | `dist/core/diff-inspector.js` |
| `./schema` | `dist/core/validator.js` |
| `./agent` | `dist/core/agent.js` |
| `./policy` | `dist/core/policy-engine.js` |
| `./provider` | `dist/adapters/provider-runner.js` |
| `./orchestrator` | `dist/core/executor.js` |
| `./contracts` | `dist/contracts/index.js` |

注意子路径名与文件名并不一一对应（例如 `./snapshots` → `diff-inspector.js`、`./orchestrator`
→ `executor.js`），这是公开 API 与内部命名的隔离层，改动内部文件名不应改变子路径名。

用户不得依赖 `@pedyc/harness-core/dist/xxx` 这类内部路径。内部模块可以变化，公开 API 应保持稳定；
`exports` 从未暴露 `src/`，因此深路径不属于公开接口。

---

## 9. CLI Package

`pedyc-harness` 是用户安装与执行的入口：

```json
{
  "bin": {
    "pedyc-harness": "dist/bin.js"
  }
}
```

`dist/cli.js` 同样是必需文件，但不作为 bin：它通过 `..` 定位包内的 `templates/`，只有在
`dist/` 这一层深度才能正确解析。因此 `files` 必须同时包含 `dist` 与 `templates`。

发布前必须验证：

```bash
pedyc-harness --help
pedyc-harness doctor
pedyc-harness init --preset vue
pedyc-harness verify
pedyc-harness run --input .harness/task.example.json --dry-run --json
```

这些正是 `release:check` 在外部消费者项目里自动执行的命令。

---

## 10. Preset Package

当前 Preset package 的发布物是**编译后的 TypeScript 模块**加 README：

```text
@pedyc/harness-preset-vue/
├── package.json
├── dist/index.js
├── dist/index.d.ts
└── README.md
```

它以 `dependencies: { "@pedyc/harness-core": "workspace:*" }` 依赖 Core。安装 Preset 不需要用户
直接依赖任何内部源码路径。

> **目标（M16）** 以下三条属于目标形态，**当前尚未实现**，不要据此操作：
>
> 1. 发布物包含 `preset.json`（Preset Manifest），声明继承关系与本 Preset 提供的配置。
>     现状：仓库中不存在 `preset.json`，Preset 是 TS 模块（`packages/preset-*/src/index.ts`）。
> 2. 通过 `peerDependencies` 声明兼容的 `pedyc-harness` 版本范围。
>     现状：四个包都没有 `peerDependencies`。
> 3. CLI 通过 Preset Registry 解析 Preset；项目在 `.harness/harness.json` 中只声明包名，版本落在
>     `package.json` 与 lockfile。
>     现状：`packages/cli/src/presets.ts` 是只有两个表项的硬编码 `Map`，不存在 `harness.json`。

Preset 生态与解析规则见 [Preset 设计](./architecture/preset.md)。Harness 不自建 Preset Registry，
分发与权限复用 npm 生态，见 [项目目标](./项目目标.md)。第三方 Preset 不参与下一节的同步版本约束。

---

## 11. Versioning

每个 package 使用 SemVer（`MAJOR.MINOR.PATCH`）：

| 级别 | 语义 | 示例 |
| ----- | ---------------- | ---------------------------------------------------------- |
| PATCH | 向后兼容的修复 | bug fix、内部实现修复、不改变公开 API 的修正 |
| MINOR | 向后兼容的新能力 | 新增 API、新增 Preset 能力、新增 CLI 命令、新增可选配置 |
| MAJOR | 不兼容变化 | 删除公开 API、修改已有 API 语义、修改配置协议或 CLI 行为导致旧用法失效 |

`0.x.y` 只适用于公开 API 尚未稳定的阶段。本仓库已越过该阶段（当前 1.1.0），因此新版本一律按
上表判定，不再使用 `0.x` 语义。确需测试版本时使用 `1.2.0-beta.1` 这样的预发布标识。

---

## 12. Package Version Relationship

四个 package **共享同一个版本号，同步发布**，当前均为 `1.1.0`。

这不是靠约定维持的，而是被工具链强制的。三条独立的原因：

**1. 发布脚本拒绝版本不一致。** `scripts/harness/publish.ts` 在发布前收集四个 manifest 的版本，
只要不全都相同就直接退出，一个包都不发。

**2. `workspace:*` 改写成精确版本，不是 caret。** 跨包依赖声明为 `workspace:*`，`pnpm publish`
会把它改写成精确锁定版本：

```text
package.json 中       发布后 package.json 中
workspace:*      →    1.1.0        （不是 ^1.1.0）
```

所以单独发布 `@pedyc/harness-core` 的新版本**不会传递给任何已有消费者**：依赖它的 CLI 和两个
Preset 仍然精确锁定旧版本，除非它们也重新发布。`release:check` 会断言打包后没有任何
`workspace:` 范围残留。

**3. 依赖是菱形闭包。** 任何一条边上的改动都会波及全部四个包（边见第 3 节）。因此同步发布是
唯一自洽的方式。发布入口只有根目录的 `pnpm run release:publish`，它按
`core → preset-generic → preset-vue → cli` 的依赖顺序推送四个包。

### 升级规则

一次发布只产生一个版本号，取四个包中变更的**最高**语义级别：

```text
四个包都只有向后兼容修复   → PATCH
任一个包新增向后兼容能力   → MINOR
任一个包有不兼容变化       → MAJOR
```

这条约束只适用于 pedyc 官方发布的四个包。未来的第三方、公司或个人 Preset 是独立的 npm
package，按自己的节奏发布，只需通过 `peerDependencies` 声明兼容的 `pedyc-harness` 范围。

> 如果将来确实需要让四个包独立演进，必须同时改三处：把依赖从 `workspace:*` 改为
> `workspace:^`、移除 `publish.ts` 中的版本一致性检查、并修订本节。只改其中一处会导致
> 「发布了但消费者装不到」这类静默故障。

---

## 13. Changelog

对外变更记录在根目录的 [CHANGELOG.md](https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md)，它是唯一来源，本文档不复制其内容。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 SemVer，小节按
`Added` / `Changed` / `Fixed` / `Breaking Changes` 组织，标题形如：

```md
## [1.1.0] - 2026-09-15
```

Changelog 面向使用者，说明**对使用者意味着什么**，而不是罗列内部 commit。

---

## 14. Release 流程

标准流程如下，每一步都对应第 5、6 节中的真实命令：

```text
代码变更
   ↓
pnpm run build
   ↓
pnpm run harness:verify
   ↓
pnpm run schemas:check
   ↓
pnpm run verify:examples
   ↓
pnpm run release:check        # 产物闸门：pack / tarball / 真实 npm install / CLI 全流程
   ↓
pnpm run type-check
   ↓
pnpm run test:unit
   ↓
更新 CHANGELOG.md 与四个 package 版本（保持相同）
   ↓
pnpm run release:publish -- --dry-run    # 预览
   ↓
pnpm run release:publish                 # 按依赖顺序发布四个包
   ↓
Publish 后 Smoke Test（下一节）
```

`Publish` 不是流程终点，发布后必须验证真实安装结果。

`release:publish` 在推送任何包之前会依次拒绝以下情况：npm registry 不是官方源、未通过
`npm whoami` 认证、目标版本已存在（避免"部分发布"）、`release:check` 未通过。它也会检测
`auth-and-writes` 模式的 2FA 并提示使用 `--otp` 或配置可绕过 2FA 的 token。`--skip-preflight`
可以跳过 `release:check`，仅用于确认流程本身，不应在正式发布中使用。

---

## 15. Publish 后 Smoke Test

`release:check` 已经在发布前对 tarball 做了等价的端到端验证，但发布后仍建议从 registry 装一次，
因为"能 pack"与"能从 npm 装到"是两个不同的信任级别。

在一个仓库之外的临时目录中：

```bash
npm install pedyc-harness
npx pedyc-harness --help
npx pedyc-harness doctor
```

再验证包入口可被真实 import：

```ts
import { ... } from "@pedyc/harness-core"
import { ... } from "@pedyc/harness-preset-vue"
```

目标：确认「Repository 中能运行 ≠ npm package 安装后一定能运行」。

跨平台说明：应使用系统临时目录（如 Node 的 `os.tmpdir()`），不要硬编码 `/tmp`——
`release:check` 与 `publish.ts` 都显式处理了 Windows 的 `.cmd` shim。

---

## 16. Workspace 与 Published Package

开发环境中的 `workspace` 依赖不能完全代表 npm published 依赖。本地能正常解析，并不意味着发布后的
package metadata 正确。

因此发布前必须检查（这些正是 `release:check` 自动覆盖的项）：

```text
package.json
dependencies
peerDependencies
exports
files
dist
```

---

## 17. Release 与 Runtime 的关系

Release 不属于 Harness Runtime，两者边界清晰：

| | 负责 |
| -------- | --------------------------------------------------- |
| Runtime | Task、Contract、Policy、Agent、Verification、Diff、Review、RunResult |
| Release | Build、Version、Package、Publish、Distribution |

```text
Development / Release
        ↓
npm package
        ↓
Installed Project
        ↓
Harness Runtime
```

---

## 18. 安全原则

发布前禁止将以下内容带入 package：

```text
API Token
Private Key
Local Path
Personal Configuration
Debug Logs
Credentials
```

尤其注意 `.env`、`.env.*`、`credentials`、`logs`、`.tmp`、`coverage`。

仓库已通过 `.gitignore` 排除 `logs`、`*.log`、`.npmrc`、`*.local` 与 `.harness/runs`。其中两点
需要特别留意：

- `.npmrc` 被 gitignore，且只应在其中保留 `registry` 配置；用于发布的 token 应放在用户主目录的
  `~/.npmrc`，永远不要提交进仓库。`publish.ts` 会校验实际使用的 registry 是否为官方源。
- `.harness/runs/` 是一次运行的运行时状态与审计数据，属于 `Runtime State`，不应进入版本库；治理定义
  （`policy.json`、`agents.json`）则应提交。

> **尚未实现**：敏感文件扫描目前**没有**自动化。`release:check` 只检查必需文件是否存在、
> `tests|examples|scripts` 是否泄漏、`workspace:` 范围是否残留，不做密钥扫描。因此第 19 节的
> 自动化链条中，这一项仍是人工责任。

---

## 19. Release Automation

当前状态：CI 已在每次 push 与 pull request 上执行第 6 节的完整闸门链（含 `release:check`），
因此「PR → Build → 校验 → 产物检查」已经是现状而非规划。

仍然属于未来的是**自动发布**：

```text
Tag
 ↓
CI
 ↓
Verify
 ↓
Build
 ↓
Publish npm
```

自动 Publish 必须建立在稳定版本策略、可信 CI 与明确 npm 权限之上。在此之前，发布由人工执行
`pnpm run release:publish`，并依赖其内置的前置条件检查。

---

## 20. 当前阶段

已经完成：

```text
TypeScript migration
Four-package split
Core / CLI / Preset separation
```

当前阶段的 Release 重点不再是搭建 Release Infrastructure——第 6 节的闸门与 `release:check` 已经
可用——而是：

1. 保持四个 package 稳定独立构建；
2. 保持 `exports` 公开面清晰、子路径名稳定；
3. 让声明式治理配置落地：**M15（Config Foundation）与 M16（Preset System）是当前最高优先级**，
   它们决定 Policy、Verification 与 Run Record 从哪里读配置；
4. 在二者落地后修订第 10 节，把「目标（M16）」转为现状描述；
5. 补齐第 18 节的敏感文件自动扫描。

阶段划分、依赖关系与验收标准见 [里程碑路线](./milestones/milestones.md)。

---

## 21. Release 原则

```text
Build reproducible
Test before publish
Package minimal
API explicit
Version meaningful
Published package must be tested
```

核心原则：

> **发布的是可验证的运行单元，而不是 Repository 的源码快照。**

---

## 22. 相关文档

- [CHANGELOG.md](https://github.com/pedyc/pedyc-harness/blob/main/CHANGELOG.md) — 对外变更记录
- [里程碑路线](./milestones/milestones.md) — M15/M16 与阶段划分
- [项目目标](./项目目标.md) — 项目定位与设计原则
- [Preset 设计](./architecture/preset.md) — Preset 生态与解析规则（含目标形态）
- [文档导航](./README.md)
- 实现：`scripts/harness/publish.ts`、`scripts/harness/release-check.ts`、
  `.github/workflows/harness-verify.yml`
