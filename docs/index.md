---
layout: home

hero:
  name: pedyc-harness
  text: 面向 AI Agent 的声明式治理运行时
  tagline: 让 Agent 在契约、策略和独立验证的约束下可靠执行任务
  actions:
    - theme: brand
      text: 文档地图
      link: /README
    - theme: alt
      text: 项目目标
      link: /项目目标
    - theme: alt
      text: 系统架构
      link: /architecture/system

features:
  - title: 契约与 Policy
    details: 明确一次任务允许 Agent 做什么，以及完成之后凭什么认为任务真的完成了。
    link: /architecture/policy
    linkText: Policy 设计
  - title: 独立验证
    details: Agent 的自我描述不是独立验证证据。Harness 自己执行闸门并记录结果。
    link: /architecture/verification
    linkText: Verification 设计
  - title: Preset 治理规范
    details: 技术栈、领域与组织规范通过 Preset 声明、继承与合成，Runtime 不感知具体技术栈。
    link: /architecture/preset
    linkText: Preset 设计
  - title: 文档规范
    details: 目录语义、标题层级、链接与「当前/目标」标记规则，由站点构建强制检查。
    link: /CONVENTIONS
    linkText: 文档规范
---
