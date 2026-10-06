---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 0d2ddb800db22046ff7f0f5fe7527fb0117894fa
regressions:
  - packages/weapp-tailwindcss/test/tailwindcss/helpers.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-engine.test.ts
---

# 运行时候选测试的真实扫描范围

## 症状

全面单测中 raw source tokens 用例达到 120 秒超时。原预算下的单次串行诊断用时 19.85 秒通过，不能仅凭超时断言生产代码出错。

## 根因与纠正

测试仍使用已忽略的内联 `v4.css` 配置，同时把 `base` 设为仓库根。引擎收到默认 Tailwind 入口后扫描整个仓库。原断言只检查几个类名存在，而仓库测试源码也包含相同字符串，不能证明扫描了临时 fixture。

新增扫描边界断言在修复前稳定失败：`filesScanned` 为 6,425，期望为 1。现改用真实 `cssEntries`，CSS 显式 `source(none)` 并仅引用 `index.tsx`；依赖解析仍使用已有 `resolve.paths`，不借扫描根解决模块解析。

同一临时目录增加一个未引用、含有效 utility 的文件；两条运行时 API 的结果都必须精确等于目标文件的三个类名。另断言扫描数量和文件的真实路径，防止符号链接路径差异掩盖扫描归属。

## 验证

- 修复前边界断言报告扫描 6,425 个文件，保留于本次 `.tmp/raw-tokens-boundary-before.log`。
- 修复后 helper 与 v4-engine 两文件 78 项通过，0 失败、0 跳过；包括原有“忽略内联 CSS、保留 cssSources”契约。
- 命令：`CI=1 pnpm exec vitest run --project=weapp-tailwindcss packages/weapp-tailwindcss/test/tailwindcss/helpers.test.ts packages/weapp-tailwindcss/test/tailwindcss/v4-engine.test.ts --maxWorkers=1 --fileParallelism=false --update=none`。

## 适用边界

只纠正测试输入与断言，不改变生产代码、公开 API、预算或 static 产物基线。全仓负载可能放大耗时，但不是本次扫描越界的根因。

## 规则评估

不新增 AGENTS 规则；精确扫描文件和完整候选集合断言作为持久约束。
