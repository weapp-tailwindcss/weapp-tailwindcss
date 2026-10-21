---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 4ea2684361a8080362eb796c7eae5c8a117fa804
regressions:
  - benchmark/version-compare/test/project-selection.test.mjs
  - packages/weapp-tailwindcss/test/ci/benchmark-memory-confirmation.test.ts
---

# 性能测量模式必须来自项目登记

## 症状

主轮 watch 的 peak/steady RSS 都超过门槛，反向确认仍为 1000→1300 MB。仅将确认行的 `hmrMode` 改为 `unsupported` 或 `fallback-build`，不改变任何测量值，原流程却清除了主轮两项失败；即使确认行没有 RSS 也会放行。

## 根因与纠正

矩阵完整性检查按照登记模式要求 HMR 耗时样本，报告却按照行内自报模式选择是否检查 RSS。完整样本并不能证明两个边界使用了同一测量模式。

共享矩阵校验现在核对项目登记与行内有效的 build/HMR 模式。未显式配置时继续采用已有 build/watch 默认值。冲突在主轮和反向确认的共同入口拒绝，确认缺证保留主轮原始失败。真正登记为不支持或构建替代的项目继续使用原豁免；真实执行错误仍交由报告保留失败。

## 验证

Node 24.18.0、pnpm 12.14.0、macOS arm64，上述 baseline 加本片修改。先固化四项反向确认反例，全部得到 `expected true to be false`；再固化三项矩阵模式冲突反例，全部得到未抛错。修复后以 `CI=1`、`--update=none` 执行：

- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs benchmark/version-compare/test/project-selection.test.mjs --update=none`：30 项通过，包括真实登记的 unsupported/fallback-build 正向边界。
- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/benchmark-memory-confirmation.test.ts test/ci/benchmark-report.test.ts --update=none`：2 文件、50 项通过，确认保留原始两项 RSS 失败及数值，不写成功 summary，同时回归原报告行为。

## 适用边界

本片修复证据门禁，不重新采样，也不修改 5% 性能阈值。原 weapp-vite、本机和历史 CI 性能失败继续保留。没有证明性能根因消除，也不能用门禁单测替代真实构建/HMR 测量。

## 规则评估

不新增 AGENTS 规则。既有“不降低门槛、缺证不能成功”已覆盖，通过共享输入边界和可执行反例约束两条报告路径。
