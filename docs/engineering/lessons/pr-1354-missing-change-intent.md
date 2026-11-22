---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1354
baseline: 06815a1e532fd96bd3f8a73388c4b8b5788c817d
regressions:
  - packages/engine/test/v4.generation-session.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-incremental-artifact.test.ts
---

# 性能 PR 遗漏公开包变更意图

## 症状

PR #1354 合并了 Tailwind CSS 生成缓存和对应回归，却没有携带 `.changeset` 文件。main 上的 release plan 只包含此前的依赖升级 intent，无法在下一次版本准备中记录这次公开包行为变化。

## 根因与纠正

排查时把性能优化和 benchmark 诊断改动视为工程侧变更，忽略了 `packages/engine` 与 `packages/weapp-tailwindcss` 的生产源码都发生了行为变化。根规则和工程流程已经要求公开包行为变化通过 `pnpm release status` 检查中文 change intent，本次执行时没有完成这一步。

从合并后的 main 创建补救分支，使用 `pnpm change --bump patch --summary ... @weapp-tailwindcss/engine weapp-tailwindcss` 生成独立中文 intent，并通过补救 PR #1355 交付。release plan 现在将两个实际受影响包纳入 patch 版本计划，未手工修改版本号或发布元数据。

## 验证

- `pnpm change check` 通过，两个 pending intent 均解析到 workspace 包，版本约束有效。
- `pnpm release status` 显示 `@weapp-tailwindcss/engine` 与 `weapp-tailwindcss` 均由新增 intent 触发 patch。
- `pnpm agents:check` 与 `git diff --check` 通过。
- 补救 PR：[#1355](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1355)。

## 适用边界

性能、缓存、诊断和测试改动只要触及公开包生产源码，就必须按公开包行为变化处理。只修改 benchmark 或私有工程工具时，才可以在确认没有发布包行为变化后不新增 intent。补救 PR 的 CI 尚未完成，不能把当前 partial 记录写成已发布。

## 规则评估

不新增 AGENTS 规则。现有公开包 change intent 和 `pnpm release status` 要求已经覆盖该场景，后续性能 PR 在提交前必须将实际生产源码包与 release plan 一起核对。
