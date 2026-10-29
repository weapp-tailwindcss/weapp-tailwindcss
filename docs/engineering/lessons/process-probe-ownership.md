---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1320
baseline: 8609a88da433dfba7d4cf8c9e0917d2e126f3ac2
regressions:
  - e2e/demo-workflow-process-command.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-session-process.integration.test.ts
---

# 进程探针的任务归属与回收确认

## 症状

全面验收的真实后代清理用例中，生产 `session.stop()` 已按预期传播原 memory error；随后独立验证 `ps` 在原执行预算及额外 1000ms 回收预算内没有确认 callback/close。兜底查证登记的业务 PID 已退出，不能证明失败的 `ps` 也已回收。

## 根因与纠正

`runProcessCommand` 原先在回收超时后只返回含 PID 的错误，没有向调用方提供持续的任务归属记录；fixture 的 finally 因而能继续启动新的查询。Promise 拒绝、业务进程为空和探针 close 是三个独立事实，必须分别记录。

显式 owner 在启动时登记本次句柄、执行/回收截止、信号请求、exit、close、callback 和首错。回收未确认时锁存该域的 terminal error，下一次调度在 spawn 前拒绝；其他任务域继续独立运行。迟到 close 只更新原回执，不能恢复本轮健康、覆盖首错或重领预算。close 与 callback 均确认后释放 ChildProcess 引用，只保留序列化记录，避免长任务积累已结束探针的 stdio 和监听对象。

fixture 的生产身份查询、验证与清理共享同一 owner，并分别写入业务和探针的清理结果。查询失败仍执行本轮 UUID 自退请求和 `session.stop()`；原失败或任一回收未确认时保留证据目录。只向本次句柄请求终止，不按名称、未知 PID 或进程组扩大清理范围。

## 验证

独立 worktree 的 12 项命令回归、15 项身份回归及 3 个真实 session fixture 通过。整合后的主任务树再次执行两文件 27 项及真实 session 3 项，全部通过；实际 Node 常驻子进程验证原 80ms 超时后的 kill、close 与 OS PID 消失。fake timer 覆盖原执行预算加 1000ms 回收、域内阻断、其他域继续运行、迟到 callback/exit/close、终止失败、幂等 close 及句柄持有/释放。

全部相关文件的 ESLint、owner/runner 定向类型检查、规则检查和 diff 检查通过。真实 fixture 的三个场景均无兜底，所有探针确认 close 并释放句柄，原注入 memory error 仍以同一对象传播。

## 适用边界

本改进覆盖显式共享 owner 的链路。未传 owner 的兼容调用仍按每次命令建立独立域，不能宣称全仓所有探针已统一归属。原 1 秒探针超时的宿主触发原因仍未证明，未扩大执行/回收预算，也未把本轮定向成功当作完整验收通过。

## 规则评估

现有规则已要求保留首错、核对资源归属及停止后续调度，无需新增全局禁令。回归将业务清理和探针回收明确分账；完整多端和最终 CI 未完成，本记录保持 partial。
