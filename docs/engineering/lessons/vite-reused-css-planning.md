---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 48b0f965f779b69abb9985b97a721c557dc01afb
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-processed-css-planning.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-transform-decision-plan.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-import-shell-rebuild.test.ts
---

# 复用 CSS 产物前不准备无人消费的生成上下文

## 症状

真实 uni-app x watch 首轮样本仍超过 500 ms 门槛，其中 generateBundle 的 entries.plan 中位数为 212.3 ms。审查发现已处理 CSS 的复用返回之前，已执行候选范围解析、来源追踪、运行时签名和共享缓存范围准备。这些值只在返回之后的转换管线中消费；阶段耗时本身不能证明每项的具体贡献。

## 根因与纠正

产物归属与生成计划混在同一提前准备阶段。现在先按既有完整条件决定是否复用，保留输出、主包注入、记忆来源和回调记录；只有需要继续转换时才准备候选与签名。没有新增跨请求缓存，也没有修改复用条件、输出归属、候选过滤或文件读取边界。

## 验证

- 新回归使用真实 generateBundle hook，覆盖微信、支付宝、抖音三种后缀，以及连续相同内容、内容更新、撤销已处理身份。修改前每种后缀均因 3 次多余来源准备失败；修改后复用阶段为 0 次，撤销身份后为 1 次且执行样式转换。CSS 与输出记录断言均保留。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-processed-css-planning.test.ts test/bundlers/vite-css-transform-decision-plan.unit.test.ts test/bundlers/vite-import-shell-rebuild.test.ts --update=none`：3 文件、16 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-plugin.bundle.unit.test.ts test/bundlers/vite-css-finalizer.unit.test.ts test/bundlers/vite-processed-css-assets.unit.test.ts test/bundlers/vite-empty-source-scope.unit.test.ts test/bundlers/vite-scoped-generator-sources.unit.test.ts --update=none`：5 文件、288 项通过。
- 主包构建、`tsconfig.typecheck.json` 类型检查、修改文件的 `eslint --no-ignore`、`pnpm agents:check` 与 `git diff --check` 通过。构建保留既有 mixed exports 提示。

## 适用边界

确定性调用计数证明消除了无人消费的准备，不代表整个 entries.plan 耗时被消除，也不能宣称真实 HMR 已满足 500 ms。真实链路须在整合提交、新预检和构建后重新采样；不调整预算或用单测耗时替代设备与 watch 验收。

## 规则评估

不新增 AGENTS。已有生命周期、精确来源、回归与性能证据要求足够，本次通过持久回归限制优化范围。
