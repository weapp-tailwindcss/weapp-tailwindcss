---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1270
baseline: d4de79c217ff8c4b0feb4dcda7eed730881fb291
regressions:
  - packages/weapp-tailwindcss/test/bundlers/source-candidate-file-io.test.ts
  - packages/engine/test/extraction.raw-file-budget.test.ts
  - packages/engine/test/extraction.project-concurrency.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# 源码候选扫描的文件资源边界

## 症状

PR 1270 的 head `d4de79c21` 在 Lynx iOS run `37596251089`、attempt 1、job `112709508540` 的构建阶段失败。Rspack 读取 `css-loader/api.js`、`sourceMaps.js` 时报告 `Too many open files (os error 24)`，并非原生截图或样式语义错误。

同一工作树、Node 22.22.3 的受控子进程在文件描述符 soft/hard 上限 64 时复现主包候选扫描的 `EMFILE`，上限 4096 时成功。限制主包扫描后，完整构建仍失败；追加读取跟踪发现 Engine 原始补扫同时存在 148 个在途读取。不能仅凭一处扫描器的单测通过宣称完整构建的资源问题已修复。

## 根因与纠正

主包冷扫描、watch 扫描和 CSS loader 直接对整个文件集合执行 `Promise.all`；Engine 在 Oxide 返回空候选时的补扫，以及无方括号任意值补扫，也没有读取上限。多个 CSS 入口同时执行会叠加资源压力。

主包的候选扫描共用八个读取槽位，并以八个 worker 遍历文件；Engine 的原始补扫、任意值补扫和位置报告在各自加载实例中共用八个读取槽位。两者都是内部模块，保持公开导出和候选语义；分批收集原始候选保持枚举顺序，不在通用路径或匹配工具层引入 I/O。

主包遍历失败后停止启动新任务，先等待在途 worker 结束，再传播首次原始错误。Webpack watch 对文件元数据 Map 使用工作副本，只有整轮成功才与候选快照一起发布；否则重试可能将更新一半的元数据与旧快照组合，误判为缓存命中。

## 验证

2026-10-07，macOS arm64，pnpm 12.9.1。主包资源回归修复前四项失败，修复后三文件 205 项通过；CSS loader 与资源回归两文件 31 项通过。Engine 新增回归修复前返回空候选，修复后五文件 60 项通过，覆盖两个原始扫描请求与位置报告同时运行，以及独立任意值补扫。

主包和 Engine 构建、严格 TypeScript 与显式 ESLint 均通过。Lynx 定向真实编码、既有 CSS AST/encoder 基线与 headless 浏览器夹具共 24 项通过；不更新快照，临时浏览器由用例的 `finally` 关闭。

修复后同一 Node 22.22.3、相同依赖的完整 Lynx development 构建在文件上限 128 时成功，CSS SHA-256 为 `e8e02eb2ca5163a470c4a8d7bda34b818f4e0bdc436110eb1328ea0a69018c41`，与修复前上限 4096 的产物完全一致。

保留上限 64 的完整构建失败：修复后的跟踪峰值为 50，其中首次失败时八个源码读取、四十个 Tailwind 依赖读取、两个配置读取。失败位于上游 Tailwind 依赖加载，不能将上限 128 的通过写成 64 通过，也未修改 CI 的 ulimit、增加重试或吞掉错误。

主要验证命令：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/source-candidate-file-io.test.ts test/bundlers/webpack.v5.unit.test.ts test/bundlers/vite-source-candidates.unit.test.ts --update=none --coverage.enabled=false
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/css-imports.test.ts test/bundlers/source-candidate-file-io.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/engine exec vitest run test/extraction.raw-file-budget.test.ts test/extraction.project-concurrency.test.ts test/extraction.candidate-extractor.test.ts test/v4.generation-scan-race.test.ts test/v4.bare-arbitrary-values.test.ts --update=none --coverage.enabled=false
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts --update=none --coverage.enabled=false
```

原始日志、文件限制实验和单测证据位于忽略的 `.tmp/ci-artifacts/`。并行重建依赖导致一次 Vite 采样读取到已删除的产物，该组废弃；后续性能采样与重建串行执行，不纳入该失败组的耗时。

当前源码的 Node 24.18.0 真实 Vite 复验分别执行两轮三对 off/required 交替样本。第一轮冷构建中位数 1054.2/1022.0 ms，减少 3.05%；第二轮 1025.7/1020.8 ms，减少 0.48%。第二轮补齐 Engine 源码、加载产物和 manifest 哈希审计，共 1097 个输入、846 次真实原生调用；两轮全部输出 SHA-256 均为 `560fddf7402079a67bcde204d9d2c468a23fc01c1393241923390ad8b28d346d`，DOM/计算样式一致，六个 worker 均恢复源码，资源清理错误为空。

第二轮文本 HMR 中位数 off/required 为 69.3/176.9 ms，新增类为 180.1/179.8 ms。文本组存在变慢，未定位前不能宣称 HMR 提速或仅归因为噪声，也不重复采样直到偶然通过。Node 峰值 RSS 为 off 640384–655248 KiB、required 625856–636608 KiB；只涵盖 Node，不能推导全进程树的稳定收益。报告分别为 `.tmp/source-file-budget-vite-serial.json` 与 `.tmp/source-file-budget-vite-final.json`，本轮构建收益不与其他报告的百分比相加。

## 适用边界

这是源码扫描自身的资源约束与失败恢复，不保证任意第三方编译器在文件上限 64 下完成整个构建。ESM/CJS 的不同加载实例有各自预算，未宣称对整个进程的所有文件操作施加统一限制。完整 CI 仍须在包含本轮修复的新 head 上验证，旧 head 的成功不替代新 head。

性能以当前源码的 Rust 开关、同一 Node、依赖与输入哈希、交替采样评估；不能将扫描资源修复直接计为 Rust 提速。

## 规则评估

不新增 AGENTS 规则。已有根因复现、局部修复与真实产物验证要求足以覆盖本次问题；通过持久回归落实有限读取、错误传播与快照原子发布。
