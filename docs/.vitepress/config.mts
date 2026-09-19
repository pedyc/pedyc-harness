import { defineConfig } from 'vitepress'

// The documentation site lives inside `docs/`, so `srcDir` is `docs/` itself:
// every markdown file there is a page. The package is private and defines no
// `build` script, so the root build and the release pipeline never touch it.
export default defineConfig({
  lang: 'zh-CN',
  title: 'pedyc-harness',
  description: '面向 AI Agent 的声明式治理运行时',
  cleanUrls: true,

  // `archived/` holds superseded designs. They are published for traceability —
  // live documents link into them — but they are not held to the current
  // conventions, so dead links inside them must not fail the build. This mirrors
  // the exemption documented in docs/CONVENTIONS.md.
  ignoreDeadLinks: [/archived\//],

  markdown: {
    lineNumbers: false,
  },

  themeConfig: {
    outline: { level: [2, 3], label: '本页目录' },
    nav: [
      { text: '开始', link: '/getting-started' },
      { text: '文档地图', link: '/README' },
      { text: '项目', link: '/项目目标' },
      { text: '架构', link: '/architecture/system' },
      { text: '接口', link: '/interfaces/README' },
      { text: '规范', link: '/CONVENTIONS' },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '从零接入 Harness', link: '/getting-started' },
          { text: '迁移到 1.2.0', link: '/migrating-to-1.2.0' },
        ],
      },
      {
        text: '项目',
        items: [
          { text: '文档地图', link: '/README' },
          { text: '项目目标', link: '/项目目标' },
          { text: '里程碑路线', link: '/milestones/milestones' },
          { text: 'Release', link: '/release' },
        ],
      },
      {
        text: '架构',
        items: [
          { text: '系统架构', link: '/architecture/system' },
          { text: 'CLI 设计', link: '/architecture/cli' },
          { text: 'Policy 设计', link: '/architecture/policy' },
          { text: 'Preset 设计', link: '/architecture/preset' },
          { text: 'Provider 设计', link: '/architecture/provider' },
          { text: 'Verification 设计', link: '/architecture/verification' },
        ],
      },
      {
        text: '接口',
        items: [
          { text: '核心接口设计', link: '/interfaces/README' },
          { text: 'Core 契约', link: '/interfaces/core' },
          { text: 'CLI 接口', link: '/interfaces/cli' },
          { text: 'Policy 接口', link: '/interfaces/policy' },
          { text: 'Provider 接口', link: '/interfaces/provider' },
          { text: 'Preset 接口', link: '/interfaces/preset' },
          { text: 'Verification 接口', link: '/interfaces/verification' },
        ],
      },
      {
        text: '决策',
        items: [
          { text: '决策总览', link: '/decisions/README' },
          { text: 'ADR-001 Preset Resolution', link: '/decisions/ADR-001-preset-resolution' },
          { text: 'ADR-002 Preset Validation', link: '/decisions/ADR-002-preset-validation-resolution' },
          { text: 'ADR-004 Policy 严重级别', link: '/decisions/ADR-004-policy-severity-rules' },
          { text: 'ADR-008 Policy 范围', link: '/decisions/ADR-008-policy-scope-and-deferred-rule-disposition' },
        ],
      },
      {
        text: '权衡',
        items: [
          { text: '权衡总览', link: '/tradeoffs/README' },
          { text: '成本权衡', link: '/tradeoffs/成本权衡' },
        ],
      },
      {
        text: '规范',
        items: [
          { text: '文档规范', link: '/CONVENTIONS' },
          { text: '核心概念', link: '/核心概念' },
        ],
      },
      // `archived/` is intentionally absent: it is published for traceability,
      // not for reading, so it stays out of the navigation.
    ],

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/pedyc/pedyc-harness/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: {
      text: '最后更新于',
      formatOptions: { dateStyle: 'short', timeStyle: 'short' },
    },
  },
})
