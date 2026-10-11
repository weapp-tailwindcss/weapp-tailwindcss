---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 1783e35cfd1d0ddea6e829ba1fbeafafc415ae5c
regressions:
  - e2e/demo-workflow-short-process.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-capture-flight.test.ts
  - e2e/demo-workflow-exit-lifecycle.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
---

# 短进程退出与首次身份快照

## 症状

扩展验收 `5727e553-7822-40f3-9965-728aa52f1589` 的前 8 阶段通过，第 9 阶段 `git diff --check` 在约 108ms 后失败，内存采样数为 0。失败原因是 `本轮进程组缺少仍匹配的身份锚，不能重新领取 PGID=82941`，而非工作区差异。日志位于 `e2e/.artifacts/preflight/5727e553-7822-40f3-9965-728aa52f1589/full-regression-run.log`，主工作树另将首次现场归档到同 run ID 的 `full-regression` 目录。

## 根因与纠正

首次进程表扫描是异步的：扫描开始时本轮根进程还在，快照包含它；等快照返回，根进程已退出。原实现根据返回时的 `exitCode` 拒绝登记根身份，随后却用同一份旧快照判断进程组仍在，形成无锚误报。真实空 Node 进程和受控延迟快照都复现了相同首次偏离。

扫描前的存活状态也不能直接用来认领返回后的 PID。首次扫描尚无启动时间锚，期间 PID 可能被回收复用。修复将“首次扫描跨越退出且留下非空组”的结果视为不确定，在同一个截止时间和取消信号下重新采集一次。新表中组已空才正常完成；仍非空或出现复用 PID 时继续阻断，既不登记未知进程，也不向其发送信号。

并发 capture 和 stop 继续共享同一轮扫描。stop 直接收紧共享的绝对截止时间，不能只依赖超时计时器先被调度；补采只消费剩余预算。每次异步返回后以及最终身份写回前同时核对取消状态与截止时间，忽略取消的迟到响应也不能写回身份。没有放宽归属检查、延长清理窗口或扩大终止范围。

## 验证

- 修复前的受控首扫返回旧根快照，以及真实 `runStep` 空 Node 进程均以无锚错误失败；原始日志保留在独立工作树 `.tmp/short-process-before-settled.log`。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-short-process.test.ts --update=none`：11 项通过，覆盖旧快照重采、未知非空组、PID 复用、预算耗尽、重采故障、取消后迟到返回、未调度计时器的绝对截止、写回前微任务超时和真实短进程。
- 关联回归包含 process identity、capture flight、exit lifecycle、Windows cleanup、process command、memory probe、sampling、stop errors、cancellation 和 native cancellation，共 11 个文件、41 项通过，验证合作恢复、只终止确认身份的后代、错误保留及资源释放。
- 真实 `runStep({ name: 'real diff check', command: 'git', args: ['diff', '--check'] }, 1, 1)`：退出码 0，内存样本 0，无清理错误；时间为 2026-10-04T06:50:54.304Z 至 06:50:54.706Z。
- 严格类型检查、目标 ESLint、`pnpm agents:check` 和 `git diff --check` 通过。此次只改阶段进程生命周期，不涉及 demo 样式或 static 基线。

## 适用边界

POSIX 未能登记身份的非空进程组仍然阻断；不能通过重复扫描直到进程消失来放行。Windows 没有可用 PGID，继续保留原有启动时间与 PPID 边界，不把根退出当作全部后代已退出的证据。此处是本地进程定向验证，完整扩展验收需要整合提交后重新预检并从头运行。

## 规则评估

不新增 AGENTS 条目。已有进程归属、截止时间、取消和错误保留规则充分；通过持久的退出时序回归补齐异步快照与实时生命周期不同步的缺口。
