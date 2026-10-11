---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/4ca235ff7aa54bf12c619a88aded8edd949361e9
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - scripts/agents/eslint-scope.test.mjs
---

# 本地验收产物进入 Lint 扫描范围

## 症状

在 Node 24.18.0、pnpm 12.4.1、ESLint 10.10.0 下执行 `CI=1 pnpm lint`，约 85 秒后退出 134，错误为 `Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`。V8 默认堆上限约 4 GiB。

## 根因与纠正

Git 忽略的文件不保证被 ESLint 忽略。本地 `e2e/reports/local-full-run/` 中的执行脚本、覆盖报告，以及仅供参考的 `submodules/tailwindcss-mangle/`，被本轮 ESLint API 确认为可扫描路径。这些目录包含历史和生成文件，不属于本仓库维护的源码。

在根 ESLint 配置中为这两个目录增加明确的全局忽略，不改变源码检查规则或 Node 内存参数。回归通过真实 ESLint API 检查排除边界，同时验证脚本、E2E 报告实现和共享包源码仍在检查范围。

## 验证

- 原命令 `CI=1 pnpm lint`：退出 134，保留原始 OOM 日志。
- 同一 checkout 执行 `CI=1 pnpm exec eslint . --ignore-pattern 'e2e/reports/local-full-run/**' --ignore-pattern 'submodules/**'`：约 29 秒通过，证明扫描边界影响本次失败。
- 新增回归后执行 `CI=1 pnpm agents:test --update=none`：修复前 1 项失败、11 项通过，修复后 12 项通过。
- 修复 worktree 执行 `CI=1 pnpm lint`：约 22 秒通过，0 error、3 个既有 `no-console` warning。

本轮原始日志保存在本地验收目录 `e2e/reports/local-full-run/2026-09-17-full/logs/`，分别为 `lint.log`、`lint-scope-diagnostic.log`、`lint-regression-red.log`、`lint-regression-green.log` 和 `lint-fixed.log`。

## 适用边界

这是本地扫描范围修复，不代表源码存在内存泄漏，也未把所有 OOM 归为同一原因。仅排除指定的生成报告与参考仓库，保留 `e2e/react-native/reports.ts` 等仓库实现的检查。耗时只用于描述本轮观察，不作为跨机器性能阈值。

## 规则评估

不新增 AGENTS 规则。根规则已经明确本地参考源码边界；用 ESLint 配置及可执行回归落实即可。
