---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1172
baseline: 6f2d368f5be9f76faf8c4212a044f707daa6aeff
regressions:
  - scripts/ci/demo-matrix/watch.test.mjs
---

# 虚拟模块回归夹具的包边界

## 症状

Windows Node 24 的 Demo Watch Diagnostic 在运行 Gulp 前的矩阵单测失败：默认虚拟模块 watcher 在初始观察期编译 3 次，超过原有上限 2。失败任务为 102314611693，工作流运行 34303286786。

## 根因与纠正

读取真实 compilation 图发现夹具没有 package.json，解析器把共享临时目录直到磁盘根的 package.json 列为 missingDependencies；绝对入口还触发拼接 context 的失败解析路径。原测试因而同时观察了无关缺失路径，不能把次数直接归因于虚拟模块轮询。

夹具现在先建立自己的 package.json，使用 bundler 相对入口，并逐次断言 missingDependencies 为空。初始最多两次编译、真实写入触发重编译、更新后保持空闲的原断言全部保留；额外记录 invalidations，后续异常仍失败。

## 验证

旧夹具追加新图边界断言，本地确定失败：Virtual fixture has unexpected missing dependencies。修复后的图 missingDependencies 为空。`pnpm test:demo:matrix` 的 51 项全部通过。

负对照 `WATCHPACK_POLLING=100 node scripts/ci/demo-matrix/fixtures/virtual-watch.cjs` 仍因初始编译 6 次失败，说明没有放松对轮询循环的检测。Windows 最新自动 CI 尚需复验，不能仅凭本地结果断言所有额外 invalidation 的来源均已确认。

## 适用边界

本次修正限于回归夹具隔离，不修改 Gulp 或 webpack-virtual-modules 产品实现；Gulp 实际 watch 仍由独立矩阵验收。对其它异步 watcher 问题不得增加固定次数阈值掩盖失败。

## 规则评估

不新增规则，沿用构建图取证和回归先行要求。
