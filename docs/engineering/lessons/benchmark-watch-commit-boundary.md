---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1324
baseline: 35762afa58b7bdd665324e46e23011106d2727fb
regressions:
  - benchmark/version-compare/test/watch-log-buffer.test.mjs
  - benchmark/version-compare/test/watch-output.test.mjs
  - benchmark/version-compare/test/uni-watch-readiness.test.mjs
---

# Uni watch 的文件观察与生产者提交边界

## 症状

PR #1324 的正式 Benchmark `41109215069` 在 Uni HMR RSS 上失败。既有诊断没有定位产品根因；该失败继续保留。本轮重新审查基准，发现两个能够独立复现的协议缺陷，尚不能据此解释正式约 89MiB 的尾差。

## 根因与纠正

旧日志缓冲按每个 stdout/stderr chunk 分行，无法重组跨 chunk 的 timing JSON、编译开始和 DONE 日志，也可能破坏 UTF-8。现在按两个流分别保存原始字节，完整行才解码并发布；半行所属操作在收到首字节时固定，不能在后续操作中完成后冒充新日志。历史窗口仍只保留最后 600 行。

旧回滚条件仅为 WXML 可读、非空且本轮 marker 消失，满足后便停止 RSS 采样。本地 mock 生产者先恢复文件、扣住 DONE 时，旧实现仍停止采样；新增回归先失败，再由协议修复通过。

安装的 `@dcloudio/vite-plugin-uni/dist/cli/action.js` 在 Rollup `BUNDLE_START` 输出 `Incremental Compiling...` 或 `开始差量编译...`，在 `BUNDLE_END` 输出 `DONE  Build complete. Watching for changes...`。仅为 Uni 小程序配置这一协议：每次 mutation 和 rollback 分别建立 stdout 日志窗口，必须观察本窗口的 start→DONE，才允许下一次写入或停止 RSS。旧 DONE、stderr 和先前操作开始的半行均不能放行。

首次启动仍等待 `ready in`；HMR 计时仍截止于原 marker/timing 观察点。提交检查消耗同一操作剩余的超时，不增加固定等待、不放宽 RSS 预算或确认条件。进程以退出码或信号终止时立即失败，不能凭已写好的文件放行。

## 验证

环境为本 worktree 独立依赖、Node 22.23.4 / pnpm 12.15.0，基于 `9ac95cf7d790fe4e34884fac90ef07d9cb73746c` 加本轮未提交改动。

- 修复日志缓冲前，新增 4 项完整行回归全部失败；修复生产者边界前，扣住 DONE 的回归观察到 sampler 已停止，按预期失败。
- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs --update=none --coverage.enabled=false --maxWorkers=1`：最终 49 文件 356 项通过，其中本轮三个定向回归文件共 24 项。最终复验使用 `CI=1`。
- `pnpm exec eslint --no-ignore` 对本轮 7 个 MJS 文件严格检查通过，无忽略警告。
- 回归覆盖双流交错、逐字节中文与 CRLF、操作前 UTF-8 首字节、旧 DONE、仅 start 未完成、先提交后恢复文件、先恢复文件后提交、mutation 未提交不得回滚、退出码及 SIGTERM 失败。负向断言使用文件读取回执及后续事件循环阶段，不靠固定毫秒等待推测观察已发生。

未开展全仓本地全面验收；正式 CI 验证尚待当前提交执行。单测和生产者源码审查不能代替真实框架性能结果。

## 适用边界

DONE 只证明 Uni 的 `BUNDLE_END` 产物提交。其 `event.result.close()` 没有被 await，因此此协议不证明 closeBundle 全部完成、空闲或等价 post-major GC；RSS 的末段中位数也不是空闲稳态。其他框架没有套用 Uni 的日志正则。

两项协议修复不构成 Uni RSS 产品修复结论，也不撤销历史正式失败。后续只依据准确提交的新正式原预算结果继续处理，不重复既有诊断碰绿。

## 规则评估

不新增规则。现有“文件观察不能替代生产者完成”“修复先补失败回归”和“保留首败、不放宽门禁”的约束已经覆盖本问题，持久回归负责防止再次退化。
