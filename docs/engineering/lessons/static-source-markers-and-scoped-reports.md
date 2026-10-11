---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/4ca235ff7aa54bf12c619a88aded8edd949361e9
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - e2e/snapshotUtils.test.ts
  - e2e/apps-generator-mode-compare.test.ts
  - e2e/apps-generator-report-scoped.test.ts
  - e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
---

# 静态来源标记与定向汇总基线

## 症状

全量静态验证为 425 passed、2 failed、33 skipped。Uni H5 的 CSS 指标因工作树名称不同增加 2 字节；Uni-app x 的类集合缺少当前提交新增的 issue-1210 页面候选。原始提交独立复现两项失败，排除本轮 CSS-only 改动影响。

## 根因与纠正

CSS 快照仅规范化 `vite-generated-css` 起始标记，遗漏结束标记 `vite-generated-css-end`。旧基线因而包含绝对工作树路径。两处规范化入口均保留起止标记类型，并对来源应用相同规则；不删除标记、不隐藏 CSS 声明差异。回归覆盖 POSIX、Windows 盘符与反斜杠、根目录、相对路径，以及归一化后的汇总指标。

Uni-app x 的 12 个新增候选可逐项追溯到 issue-1210 页面，原提交遗漏了类集合、来源报告和小程序静态产物基线。限定该项目重新生成。HBuilderX 5.24 的 `uni-mp-vite/dist/plugin/polyfill.js` 在 style isolation v2 下向 App 样式注入 `/uvue.wxss`；原提交与修复工作树均产生该引用，实际目标文件存在。运行时是否可达仍须通过 DevTools 验证。

按项目过滤时，原 generator 测试完全跳过汇总校验与更新，导致项目 CSS 基线与汇总长期不一致。改为按项目和平台身份替换本轮实际构建的行，保留未运行行和顺序；拒绝重复身份，并保留实际本轮报告到忽略的 artifacts。定向验证仍检查汇总，完整验证继续检查全部行。

## 验证

- `CI=1 pnpm e2e:static`：保存最初的两项失败。
- 原提交限定两个 Uni 项目复现：2 failed、9 passed。
- 来源标记回归修复前 3 failed、3 passed；修复后 6 passed。
- `E2E_PROJECT_FILTER='^uni-app-(vite|x-vdom)-tailwindcss-v4$' E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts -u`：限定项目生成基线，未运行其他项目的快照更新。
- 同一项目集合不更新快照复验通过；汇总检查补齐后进一步准确暴露已过时的汇总行。
- 汇总纯函数回归覆盖同项目不同平台、未运行项目、输入不变、新平台和重复身份。
- 完整矩阵进一步发现三个 Taro 项目六行汇总过时；逐项目 CSS 快照全部通过。限定这些项目重新生成后 Taro CSS 基线无变化，全部 20 行汇总与此前独立构建实际报告一致。Taro generator 不更新快照复验 11 项通过。

原始日志位于本轮 `e2e/reports/local-full-run/2026-09-17-full/`，包括 `e2e-static`、`static-failures-baseline`、`source-marker-red`、`source-marker-green`、`uni-scoped-static-update`、`uni-scoped-static-green` 与 `scoped-summary-stale-red`。

## 适用边界

这份记录只证明静态快照与实际源码、构建输出一致。小程序运行时、HMR、截图及全量汇总复验尚未全部完成，保留 partial 状态。定向合并保留的其他项目行是已有基线，不能当成本轮执行证据；实际报告只保存本轮构建的行。

## 规则评估

不新增 AGENTS 规则。现有项目限定更新、审查差异和不更新复验的要求足够；用持续回归弥补工具链执行缺口。
