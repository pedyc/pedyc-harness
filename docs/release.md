# Release 设计

> Release 文档定义 pedyc-harness 多 package 项目的构建、版本、发布和发布前验证规则。
>
> Release 是工程交付流程，不属于 Harness Runtime。

---

## 1. 发布目标

pedyc-harness 当前由多个 npm package 组成：

```text
@pedyc/harness-core
pedyc-harness
@pedyc/harness-preset-generic
@pedyc/harness-preset-vue
```

各 package 具有明确职责：

```text
@pedyc/harness-core
    ↓
Runtime / Domain

pedyc-harness
    ↓
CLI / User Entry

@pedyc/harness-preset-generic
    ↓
Generic Preset

@pedyc/harness-preset-vue
    ↓
Vue Preset
```

Release 流程需要保证：

1. package 可以独立构建；
2. package 的依赖关系正确；
3. 发布内容只包含必要文件；
4. 类型声明与运行时代码保持一致；
5. 发布前必须通过项目验证；
6. package 版本变化具有明确语义。

---

# 2. Package 与发布边界

每个 workspace package 都是独立 npm 发布单元。

```text
packages/
├── core/
├── cli/
├── preset-generic/
└── preset-vue/
```

对应：

```text
core
→ @pedyc/harness-core

cli
→ pedyc-harness

preset-generic
→ @pedyc/harness-preset-generic

preset-vue
→ @pedyc/harness-preset-vue
```

Root package 不等于 npm 发布 package。

Root 的职责主要是：

```text
Workspace
Build
Test
Typecheck
Release orchestration
```

而不是承载 Runtime。

---

# 3. 依赖方向

发布前必须保持依赖方向：

```text
preset
   ↓
CLI
   ↓
Core
```

更准确地说：

```text
@pedyc/harness-preset-*
          ↓
   pedyc-harness
          ↓
@pedyc/harness-core
```

Core 不应该反向依赖：

```text
CLI
Preset
Vue
具体 Provider
```

尤其不能因为发布方便而形成循环依赖。

---

# 4. Build

每个 package 都必须能够独立构建。

基本流程：

```text
src/
  ↓
TypeScript
  ↓
Build
  ↓
dist/
```

例如：

```text
packages/core/
├── src/
├── dist/
├── package.json
└── tsconfig.json
```

发布包应该使用构建后的：

```text
dist/*.js
dist/*.d.ts
```

而不是直接依赖 `src/*.ts` 作为正式发布产物。

---

# 5. TypeScript

TypeScript 项目至少需要区分：

```text
Typecheck
Build
Test
```

推荐：

```bash
pnpm typecheck
pnpm test
pnpm build
```

其中：

### Typecheck

验证类型系统：

```bash
tsc --noEmit
```

### Test

验证运行行为：

```bash
vitest
```

### Build

生成正式发布产物：

```text
dist/
```

三者职责不同，不应该互相替代。

---

# 6. 发布前验证

正式发布前必须执行完整验证：

```text
Typecheck
    ↓
Test
    ↓
Build
    ↓
Package inspection
```

推荐统一命令：

```bash
pnpm verify
```

概念上：

```json
{
  "scripts": {
    "verify": "pnpm typecheck && pnpm test && pnpm build"
  }
}
```

任何一个阶段失败，都不应该继续发布。

---

# 7. Package Contents

发布前需要检查 npm package 实际包含的文件。

目标：

```text
包含：

dist/
package.json
README.md
LICENSE
必要的 metadata
```

避免：

```text
不应该发布：

src/
tests/
内部开发脚本
本地配置
临时文件
开发环境日志
```

具体包含哪些文件由 package 的：

```text
files
exports
main
module
types
```

等配置共同决定。

原则：

> npm package 应该是最小可运行发布物，而不是整个 Repository 的压缩包。

---

# 8. Exports

Package 应明确公开 API。

例如 Core：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

不要让用户依赖：

```text
@pedyc/harness-core/dist/xxx
```

这样的内部路径。

内部模块可以变化，但公开 API 应保持稳定。

---

# 9. CLI Package

CLI package：

```text
pedyc-harness
```

是用户安装和执行 Harness 的入口。

因此需要正确配置：

```json
{
  "bin": {
    "pedyc-harness": "./dist/cli.js"
  }
}
```

发布前必须验证：

```bash
pedyc-harness --help
pedyc-harness doctor
```

以及核心命令：

```bash
pedyc-harness init
pedyc-harness run
pedyc-harness verify
```

---

# 10. Preset Package

Preset package 的发布物主要包括：

```text
Preset implementation
Templates
Preset metadata
Type declarations
```

例如：

```text
@pedyc/harness-preset-vue
```

安装 Preset 不应该要求用户直接依赖其内部源码路径。

CLI 通过 Preset Registry 或对应的 package resolve Preset。

---

# 11. Versioning

每个 package 使用 SemVer：

```text
MAJOR.MINOR.PATCH
```

基本规则：

### PATCH

向后兼容的修复：

```text
bug fix
内部实现修复
不会改变公开 API 的修正
```

### MINOR

向后兼容的新能力：

```text
新增 API
新增 Preset 能力
新增 CLI 命令
新增可选配置
```

### MAJOR

不兼容变化：

```text
删除公开 API
修改已有 API 语义
修改配置协议导致旧项目无法工作
修改 CLI 行为导致现有脚本失效
```

---

# 12. Package Version Relationship

四个 package **共享同一个版本号，同步发布**：

```text
@pedyc/harness-core           1.1.0
pedyc-harness                 1.1.0
@pedyc/harness-preset-generic 1.1.0
@pedyc/harness-preset-vue     1.1.0
```

这不是靠约定维持的，而是被工具链强制的。三条独立的原因：

**1. 发布脚本拒绝版本不一致。** `scripts/harness/publish.ts` 在发布前收集四个
manifest 的版本，只要不全都相同就直接退出，一个包都不发。

**2. `workspace:*` 改写成精确版本，不是 caret。** 跨包依赖声明为 `workspace:*`，
`pnpm publish` 会把它改写成精确锁定版本：

```text
package.json 中          发布后 package.json 中
workspace:*      →       1.1.0        （不是 ^1.1.0）
```

所以单独发布 `@pedyc/harness-core` 的新版本**不会传递给任何已有消费者**：
依赖它的 CLI 和两个 preset 仍然精确锁定旧版本，除非它们也重新发布。

**3. 依赖是菱形闭包。** 任何一条边上的改动都会波及全部四个包：

```text
pedyc-harness                  → @pedyc/harness-core
pedyc-harness                  → @pedyc/harness-preset-generic
pedyc-harness                  → @pedyc/harness-preset-vue
@pedyc/harness-preset-generic  → @pedyc/harness-core
@pedyc/harness-preset-vue      → @pedyc/harness-core
```

因此同步发布是唯一自洽的方式。发布入口只有根目录的 `pnpm run release:publish`，
它按 `core → preset-generic → preset-vue → cli` 的依赖顺序推送四个包。

## 升级规则

一次发布只产生一个版本号，取四个包中变更的**最高**语义级别：

```text
四个包都只有向后兼容修复   → PATCH
任一个包新增向后兼容能力   → MINOR
任一个包有不兼容变化       → MAJOR
```

各等级的具体判定标准见上一节。

> 如果将来确实需要让四个包独立演进，必须同时改三处：把依赖从 `workspace:*`
> 改为 `workspace:^`、移除 `publish.ts` 中的版本一致性检查、并修订本节。
> 只改其中一处会导致"发布了但消费者装不到"这类静默故障。

---

# 13. Pre-release

在 API 尚未稳定时，可以使用：

```text
0.x.y
```

表示项目仍处于快速演进阶段。

如果需要测试版本：

```text
0.5.0-beta.1
0.5.0-beta.2
```

Pre-release 的目的：

> 在正式稳定 API 前验证 package 之间的兼容性。

---

# 14. Changelog

每次 Release 应记录：

```text
Added
Changed
Fixed
Breaking Changes
```

例如：

```md
## 0.5.0

### Added

- Added independent verification evidence.
- Added `verify` command.

### Changed

- Updated AgentAdapter protocol.

### Fixed

- Fixed policy path matching.

### Breaking Changes

- None.
```

Changelog 应面向使用者，而不是记录所有内部 commit。

---

# 15. Release 流程

标准 Release 流程：

```text
代码变更
   ↓
Typecheck
   ↓
Test
   ↓
Build
   ↓
Inspect package
   ↓
Version
   ↓
Changelog
   ↓
Publish
   ↓
Install smoke test
```

其中：

```text
Publish
```

不是流程终点。

发布后必须验证：

```text
从 npm 安装
    ↓
实际 import
    ↓
实际执行 CLI
    ↓
验证 package 能正常工作
```

---

# 16. Publish 前 Smoke Test

建议在发布后使用临时目录：

```text
/tmp/pedyc-harness-release-test/
```

安装：

```bash
npm install pedyc-harness
```

然后验证：

```bash
pedyc-harness --help
pedyc-harness doctor
```

Core 可以验证：

```ts
import { ... } from "@pedyc/harness-core"
```

Preset 可以验证：

```ts
import { ... } from "@pedyc/harness-preset-vue"
```

目标是确认：

> Repository 中能运行 ≠ npm package 安装后一定能运行。

---

# 17. Workspace 与 Published Package

开发环境中的：

```text
workspace dependency
```

不能完全代表：

```text
npm published dependency
```

例如：

```text
pnpm workspace:
@pedyc/harness-core
```

本地可以正常 resolve，并不意味着发布后的 package metadata 正确。

因此发布前必须检查：

```text
package.json
dependencies
peerDependencies
exports
files
dist
```

---

# 18. Release 与 Runtime 的关系

Release 不属于 Harness Runtime。

Runtime 负责：

```text
Task
Contract
Policy
Agent
Verification
Diff
Review
RunResult
```

Release 负责：

```text
Build
Version
Package
Publish
Distribution
```

两者边界：

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

# 19. 安全原则

发布前禁止将以下内容带入 package：

```text
API Token
Private Key
Local Path
Personal Configuration
Debug Logs
Credentials
```

特别需要检查：

```text
.env
.env.*
credentials
logs
.tmp
coverage
```

发布流程应该尽量自动化检查敏感文件。

---

# 20. Release Automation

未来可以使用 CI 自动执行：

```text
Pull Request
    ↓
Typecheck
    ↓
Test
    ↓
Build
    ↓
Package Check
```

进入 Release：

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

但自动 Publish 必须建立在：

```text
稳定版本策略
可信 CI
明确 npm 权限
```

之上。

---

# 21. 当前阶段

当前项目已经完成：

```text
TypeScript migration
Four-package split
Core / CLI / Preset separation
```

因此当前 Release 阶段重点不是复杂的 Release Infrastructure，而是：

1. 保证四个 package 可以稳定独立构建；
2. 明确 package exports；
3. 明确 package dependency；
4. 建立统一 verify；
5. 验证 npm 安装后的真实运行；
6. 建立基本 SemVer / Changelog 规则。

---

# 22. Release 原则

最终遵循：

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
