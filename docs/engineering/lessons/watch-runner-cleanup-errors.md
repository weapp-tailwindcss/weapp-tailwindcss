---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e225f2f9b058d0f44faa23b69c5e728cb3135d6a
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-runner-cleanup.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-runner.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
---

# Watch runner 收尾失败保留与资源释放

## 症状

取消生命周期复审发现，完整 watch、分包、Web 和主样式入口的源码恢复循环均吞掉读写错误。完整 watch 的输出完整性监控器停止失败时，后面的 session 停止不会执行；分包与主样式入口的 session 停止失败又会覆盖原始 mutation 失败。正常执行返回指标前打印的 `passed` 也可能早于失败的清理。

## 根因与纠正

各入口将多个可失败的清理动作放在同一个 `finally`，却没有独立收集失败。现在私有 `cleanup` 模块按当前入口持有的原文和资源，逐项尝试全部源码恢复、监控器停止和 session 停止。失败时聚合主错误与每个清理错误，保留原始错误对象及原因链，并在顶层 message 列出源码路径和失败阶段，使当前只输出 stack 的 CLI 也能看到完整失败。

分包独立 session 使用相同的停止聚合边界。主样式已有部分指标时，继续抛出同一 `WatchHmrPartialMetricsError` 类型并保留 metrics，完整聚合错误放入 cause，保持 CLI 的 `instanceof` 消费契约。成功日志延迟到所有收尾完成后输出。

源码不存在时仍尝试按已保存原文恢复；其他读取失败会明确报告，不影响后续文件和资源。恢复继续使用现有原子替换、权限和重试写入器，新增默认开启的 `normalizeEol` 选项，仅恢复路径关闭归一化，保留混合 CRLF/LF 原文。写入后重新读取核对内容，不更改正常 mutation 的换行行为。

## 验证

首批 5 项回归在修改前全部失败，分别暴露主错误丢失、恢复错误被吞及正常执行后清理失败仍返回成功。新增删除源码、混合换行和成功日志边界后，再确认 5 项相关断言失败；修复后覆盖四种入口的 10 项清理回归通过。

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-runner-cleanup.unit.test.ts test/watch-hmr-runner.unit.test.ts --update=none`：2 文件、14 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-regression.unit.test.ts --update=none`：1 文件、116 项通过，包括既有文本写入和 mutation 行为。
- 回归使用真实临时文件及原子写入，按依赖边界注入读写、monitor 和 session 错误；验证其他源码仍恢复、全部资源均被调用、原始错误对象保留、顶层 stack 可见，以及删除文件的混合换行字节恢复。
- 修改的 4 个 TypeScript 文件按工具包 strict 配置做逐文件语法和语义诊断；执行显式 ESLint、`pnpm agents:check` 和 `git diff --check`，提交保留正常 hook。

## 适用边界

本次仅修复 runner 已领取源码和资源的收尾，不改变超时、性能阈值、样式语义、浏览器内部流程或进程树所有权。不运行设备、IDE、浏览器、真实 watch 或全面测试，单测通过不代表取消时的设备验收已完成。未改 demo 与样式产物，无 static 基线变化；私有工程工具不新增公开包 change intent。

## 规则评估

不新增 AGENTS。既有根因回归、原文恢复、失败可观察和资源归属要求足够，本次通过可执行回归落实。
