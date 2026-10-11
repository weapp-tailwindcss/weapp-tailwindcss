---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: bbb5c597300c0d9da6a2c42cedd5cf0f3b07b730
regressions:
  - packages/postcss/test/css-macro-idempotency.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-source-preparation-macro.test.ts
---

# 混合外层条件的 variant 准备必须幂等

## 症状

审查生成器是否可以取消重复宏预处理时，真实 HBuilderX、uni-app x VDOM 和 Vapor 入口均满足幂等性，但普通规则和 variant 混在一个外层条件中的来源不满足。对 `/* #ifndef MP */ .web-only { color: red; } @custom-variant active { &:active { @slot; } } /* #endif */` 连续准备，会不断添加 `@weapp-tw-ifndef "MP"` 包裹。

新增 PostCSS 回归的初始 8 项全部先红，主包 9 项宏来源检查中仅这一混合形状失败。该缺陷存在于原有准备函数，不能用多执行一次来掩盖。

## 根因与纠正

外层条件为了保留普通规则的语义而保留注释；下一轮又将该条件应用到已经包裹的 variant。现在仅沿支配整个 variant 的单节点 `ifdef` / `ifndef` 链检查相同指令与精确表达式，已有条件不再重复添加。遇作者注释、多节点分叉、选择器或其他规则便停止下探，不能把一个局部分支中的条件视为整体条件。

不同表达式、同表达式的正反方向、嵌套条件与各个 variant 分别保留。普通规则所在的外层注释仍由原先的清理条件决定；仅含 variant 的区域继续移除原注释。

## 验证

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/css-macro-idempotency.test.ts test/css-macro.test.ts --update=none`：2 文件、31 项通过。新增 10 项覆盖正反条件、嵌套、作者注释、深层分叉和多 variant；连续三次准备不再改变 CSS。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-source-preparation-macro.test.ts --update=none`：11 项通过，包含 3 个真实 demo 原始入口、6 种宏形状，以及 Web/小程序真实引擎的直接与增量产物等价、生成 variant 的 H5/微信条件判定。
- PostCSS 构建及声明、修改源码和测试的 `eslint --no-ignore` 通过。

## 适用边界

该修复只保证来源准备的幂等性与条件结构，不改变框架何时执行普通 CSS 条件注释。Tailwind 自身会移除普通作者注释，因此没有把普通规则外层注释跨完整 Tailwind 编译的保留当成本次修复保证；生成 variant 的内部条件仍按既有宏管线处理。未修改 demo 或静态输出基线，也未运行设备测试。

## 规则评估

不新增 AGENTS。PostCSS 所有权、先红后绿、平台语义和单一准备边界已有规则足够，通过具体回归约束支配范围，不使用任意后代匹配或表达式启发式化简。
