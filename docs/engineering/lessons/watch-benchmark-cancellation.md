---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 0d2ddb800db22046ff7f0f5fe7527fb0117894fa
regressions:
  - benchmark/performance/test/watch-cancellation.test.mjs
  - benchmark/performance/test/watch-startup.test.mjs
  - benchmark/performance/test/watch-lifecycle.test.mjs
---

# watcher 基准超时后的取消与收尾

## 症状

全面测试中的 Webpack watcher 契约在外层 Vitest 30 秒预算到达时失败；同一原始代码随后单独运行约 6.65 秒通过。该证据不能认定编译器存在产物缺陷，也不能通过放宽预算或减少样本解释为修复。

本次只补齐基准工具的生命周期边界：真实用例仍为 30 秒、每次等待构建仍为 15 秒、每个 bundler 仍执行三轮且每轮包含六次变更。静态 CSS 基线没有变化。

## 根因与纠正

Vitest 超时会拒绝它所等待的测试 Promise，但不会自动取消测试体中的异步构建，也不会等待构建函数自己的清理。旧用例没有向测量函数传入取消信号，因此外层报错后仍可能修改下一份输入，最终构建阶段与完成数也无法出现在超时错误中。

用例改用 `it.for` 获取真实 `TestContext`；Vitest 5 的 `it.each` 不向回调传递该 context。测量等待及下一次文件写入都检查 `signal`，取消错误携带当前 phase、已完成构建数、已观察颜色和临时工作目录。`onTestFinished` 有独立的 15 秒收尾预算，并等待原测量 Promise；它不会把这段时间算作新的构建或样本预算。

测量 Promise 只在关闭完成后结束。取消发生于启动中时，先等待启动返回本轮资源，再关闭；取消发生于关闭中时，也不会提前返回成功。Webpack watcher 关闭报错后仍尝试关闭 compiler。清理失败与主失败通过 `AggregateError` 一起保留；只有清理失败时也必须失败。关闭失败时不删除临时工作目录，错误中的目录用于继续核实资源与现场。

## 验证

轻量回归覆盖取消前启动、启动中取消、构建等待取消、关闭期间取消、主失败与关闭失败并存、单独关闭失败、构建的 15 秒预算，以及真实 Vitest 超时后下一项开始前关闭已完成。真实超时用例使用永不通知完成的合成构建等待，不启动真实 compiler；它是显式预期失败，后续独立断言核实取消信号、异常原因、阶段与完成数，保证它不能仅凭发生任意失败而通过。

初始化回归先证明：初始文件写入期间取消后，旧实现仍尝试加载 compiler；补充写入完成后的取消检查后，Vite 与 Webpack 两项均通过。轻量回归共 10 项通过、1 项符合预期失败；测试使用 `CI=1` 和禁止更新快照的参数。

```sh
pnpm --filter benchmark-performance exec vitest run test/watch-cancellation.test.mjs test/watch-startup.test.mjs --maxWorkers=1 --fileParallelism=false --update=none --reporter=verbose
```

主任务在集成提交 `733e0a7f5` 集中执行轻量与真实编译验证，3 文件共 12 项通过、1 项符合预期失败；真实 Vite 用时 2.95 秒、Webpack 用时 4.35 秒，三轮恢复后的 CSS 均与原静态基线一致。日志为 `.tmp/watch-lifecycle-integrated.log`，命令设置 `CI=1`：

```sh
pnpm --filter benchmark-performance exec vitest run test/watch-lifecycle.test.mjs test/watch-cancellation.test.mjs test/watch-startup.test.mjs --maxWorkers=1 --fileParallelism=false --update=none --reporter=verbose
```

## 适用边界

本记录基于 Vitest 5.0.3 的 `TestContext.signal` 与 `onTestFinished` 行为。真实 Vite/Webpack 编译集成验证已通过，未更新 CSS 基线。收尾钩子也有 15 秒上限；资源关闭本身不返回时仍会报钩子超时，不能用强杀或提前删除工作目录伪造关闭成功。

失败诊断以首次阶段及构建数为准。不得把独立重跑通过写成此前全面测试已通过，也不得在没有本轮完整环境门禁的情况下自行启动全面验收。

## 规则评估

不新增 AGENTS 规则。已有资源归属、预算与失败证据规则足以约束此问题，通过持久回归落实取消和收尾边界。
