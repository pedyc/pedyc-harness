# ADR-001 Preset Resolution 使用 DFS

## Context

Preset 支持多层继承。

## Decision

使用 DFS 解析继承关系。

## Reasons

1. 实现简单
2. 可以自然检测循环
3. 适合当前 Preset DAG 规模

## Alternatives

- Topological Sort
- BFS

## Consequences

- 需要 visited 状态
- 可以加入 memoization