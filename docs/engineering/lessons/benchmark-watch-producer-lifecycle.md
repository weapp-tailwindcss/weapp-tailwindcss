---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 56c3af2b637380bc2229f14e91e2bce23c277d20
regressions:
  - benchmark/version-compare/test/watch-process.test.mjs
  - benchmark/version-compare/test/watch-output.test.mjs
  - benchmark/version-compare/test/gc-workload-isolation.test.mjs
---

# Benchmark watcher 的退出与收尾边界

## 症状

单次授权的 [Mpx allocation 诊断](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41188016002)中，current worker 已因证据解码上限退出，runner 却在第三轮回滚继续等待，最终把首错报告为 `hmr rollback 3 timeout 180000ms`。两个 watch 会话均未完成，本次诊断不能作为正式 RSS 门禁结果。

## 根因与纠正

回滚轮询只检查输出是否恢复，没有检查生产者是否已经退出。旧输出可读或 HTTP 请求成功并不证明 watcher 仍存活；异步探测和诊断收尾期间也可能发生退出。

文件与 HTTP 路径共用退出检查，覆盖正常退出码、非零退出码和信号退出。在 warmup、修改、回滚、计时等待及最终收尾的相应异步边界之后再次检查，保留实际退出信息，避免把它延迟为轮询超时或接受旧输出。

另一个确定的生命周期缺陷是 `stopChild` 收到 `close` 后仍保留升级计时器。抽出共享模块，在 `close` 时清除两个计时器，并处理发送初始信号时同步关闭的情况。原有 1200ms、4000ms 升级时限与平台信号策略保持不变。

## 验证

本地验证基于上述 baseline 加本次尚未提交的修复，使用当前独立 worktree 的依赖：

- 精确旧 runner 的 15 个退出边界回归失败；旧清理实现的 3 个关闭回归失败，原升级时限用例通过。初版夹具缺少诊断方法造成的失败不计入缺陷复现。
- 新增 19 项回归，覆盖文件与 HTTP 回滚、正常和异常退出、信号、旧输出、异步探测中退出、诊断收尾中退出和定时器清理。
- `rtk proxy pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1`：48 文件、359 测试通过。
- 五个修改的脚本与测试文件显式 `eslint --no-ignore` 通过；`pnpm agents:check` 和 `git diff --check` 通过。

## 适用边界

这是 runner 错误报告和收尾的修复，未建立原正式 Mpx RSS 回归的分配来源。证据采集的 64MiB 解码上限、采样预算、性能断言和工作负载未调整；没有第二次诊断 dispatch 或 rerun。

4000ms 兜底返回仍不等于已取得实际 `close`、全部后代进程或最终 OS 清理证据。定向夹具通过也不等于真实 Mpx 工作负载或 iOS 验收通过；原 RSS 与两个 iOS 阻断继续保留。

## 规则评估

不新增 AGENTS 规则。现有“先复现再修复”“区分输出观察与真实生命周期”“保留失败首错”边界已经适用，以共享实现和持久回归落实。
