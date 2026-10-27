---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 5b889d9436294001ca0552c68e157016f6f48e2b
regressions:
  - e2e/demo-workflow-probe-failure-cleanup.test.ts
  - e2e/demo-workflow-cleanup-budget.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-signal-result.test.ts
  - e2e/demo-workflow-capture-flight.test.ts
  - e2e/demo-workflow-cooperative-budget.test.ts
  - e2e/demo-workflow-process-command.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/demo-workflow-short-process.test.ts
---

# 进程探针超时后仍须停止本次启动的业务进程

## 症状

本地全面验收 `ed279c07-c0b1-4ed0-9468-d06c586478b1` 在 static 阶段出现 5000ms 身份探针超时，探针自身也没有确认退出。工作流转入 2000ms 有界清理，第二次探针再次超时；报告已经失败，static 子进程却继续运行。日志中的清理错误保留了 `close=false` 和已登记 PID，没有记录任何已发送的终止请求。

## 根因与纠正

清理先等待身份扫描，再检查总截止，最后才进入停止本次 spawn 本体的 fallback。扫描和退出确认一旦耗尽预算，截止分支会直接跳出，连不依赖旧 PID 快照的 `ChildProcess.kill()` 都被跳过。上层阻止后续阶段不等于已启动的独立子进程会停止。

身份采集失败由进程树保存；开始收尾时先向仍活的本次 `ChildProcess` 发送 TERM。清理期间再次观察失败时立即请求停止；总预算耗尽后仍活则通过同一句柄发送 KILL。每种信号只请求一次，失败发送不写成成功记录。

自然退出、已收到退出信号或已确认 close 的句柄不再发送信号。历史 PID、PGID 和后代列表不能作为此次 fallback 的终止依据；已登记后代仍沿用原来的出生身份复核。原探针、reap 和信号发送错误继续保留；成功发送 KILL 不证明 close、后代清空或源码恢复，阶段仍失败。

## 适用边界

不改变既有超时值和总预算，不在预算耗尽后增加探针或等待。正常合作退出、短进程和 PID 复用规则保持不变。本次没有扩展 static runner 的取消协议，也没有把无法复核的后代按旧快照批量终止。

## 验证

新增最小回归先在原实现得到 4 失败、3 通过：macOS、Linux、Windows 模型中的活句柄在超时后均未收到终止请求。修复后补充实际 Node 子进程、发送异常与拒绝发送场景，定向命令如下：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-probe-failure-cleanup.test.ts e2e/demo-workflow-cleanup-budget.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-signal-result.test.ts e2e/demo-workflow-capture-flight.test.ts e2e/demo-workflow-cooperative-budget.test.ts e2e/demo-workflow-process-command.test.ts e2e/demo-workflow-windows-cleanup.test.ts e2e/demo-workflow-short-process.test.ts --maxWorkers 1 --reporter default --update=none
```

9 个文件、65 项通过，无失败或跳过。macOS 上真实 Node 子进程故意忽略 TERM，随后由本次启动句柄发出 KILL 并等待实际 close；Windows/Linux 部分为平台模型测试，不能写成在对应主机执行。源码与测试的定向严格 TypeScript、ESLint，以及 `git diff --check` 通过。

本记录只证明进程清理定向回归；不代表中断的全面验收已通过。整轮验收仍须使用集成提交重新预检，再完整执行。

## 规则评估

不新增 AGENTS 规则。通过生命周期实现和持久回归落实既有进程归属、失败停止和证据要求。
