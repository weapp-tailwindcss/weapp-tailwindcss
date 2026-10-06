---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 15dd772eea8056d6ec1b330cd14bccbb2b4113e2
regressions:
  - e2e/demo-workflow-exit-lifecycle.test.ts
  - e2e/demo-workflow-capture-flight.test.ts
  - e2e/demo-workflow-process-command.test.ts
  - e2e/demo-workflow-sampling.test.ts
  - e2e/demo-workflow-memory-probe.test.ts
---

# 工作流同步进程扫描阻塞 close 的修复

## 症状

模板 IDE 验证运行 `4d01c914-9b4f-4738-86f5-ded65fe6e8cf` 中，工作流报告子进程清理失败，出现 `close=false` 与空 PID 集合，并保留了从 `ChildProcess.onExit` 进入同步进程扫描的超时堆栈。同轮更早出现的 Taro 渲染失败是独立问题，不能用清理修复解释或覆盖。

## 根因与纠正

`exit` 监听器直接启动清理，清理在首次让出事件循环前反复同步读取进程表。即使被测进程正常退出，Node 也无法在监听器返回前派发 `close`；扫描耗尽清理预算后，代码先按 `close=false` 判定失败。旧代码还把耗尽的预算压成 1ms，继续启动没有实际预算的扫描。

进程表、Windows 精确 PID 清理和工作流内存采样改用异步有界命令。归属扫描与内存采样各自保持单飞；停止时复用正在进行的扫描并约束其截止时间，不调度新周期采样。阶段报告等待末轮采样落定，保留迟到的错误。其他内存报告消费者的同步 API 与既有解析语义保持不变。

`execFile` 内置 timeout 仍可能等到 `close` 才回调，不能单靠错误回调启动退出确认计时器。命令启动即安排独立截止；超时发送 `SIGKILL` 后额外等待最多 1 秒，缺少退出确认时报告 PID 并阻断。正常完成必须同时有命令回调和 `close`，不以外层无跟踪的 Promise race 丢弃探针。

成功仍要求被测子进程 `close` 和已核实的归属集合为空；身份锚缺失、真实超时、强制终止以及末轮采样失败都继续报错。PID 出生时间再确认、Windows 禁止 `/t` 扩大范围等原有边界保留。

## 验证

先运行持久回归，确认旧实现正常退出时误报 `close=false`，超时场景继续发起 `[80, 1, 1, 1]` 毫秒扫描。异步实现通过相同回归。探针没有 callback/close 的回归同样先红后绿：旧实现未触发独立终止，新实现按时发出信号并报告未确认 PID。

定向验证使用 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts`，显式传入以上文件及既有身份、Windows、取消、原生取消、错误合并、quality 和 extended 回归，追加 `--update=none`。工作流与矩阵回归共 13 文件、97 测试通过；demo 内存报告消费者另 2 文件、7 测试通过，均无跳过。定向严格 TypeScript、ESLint、`pnpm agents:check` 与 `git diff --check` 通过。

## 适用边界

本记录覆盖 fixture、mock 的平台输出和真实 Node 子进程；Windows 系统命令仅验证协议契约，未声明在 Windows 主机执行。实际失败日志没有记录每次扫描的 timeout 值，因此 `[80, 1, 1, 1]` 是最小复现结果，不是对 IDE 失败日志的补写。

本提交未执行真实 IDE/设备回归，不代表六模板或完整扩展验收通过，后续须在集成提交完成本轮预检后验证。探针额外 1 秒是退出确认上限，不会重新放行已耗尽预算的阶段。

## 规则评估

不新增 AGENTS 规则。已有进程所有权、失败阻断和持久回归约束足以表达边界，本次通过生命周期实现与可执行回归保证约束。
