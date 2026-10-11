---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e225f2f9b058d0f44faa23b69c5e728cb3135d6a
regressions:
  - e2e/demo-workflow-cancellation.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-stop-errors.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/watch-command-lifecycle.test.ts
  - e2e/demo-workflow-extended.test.ts
  - e2e/e2e-matrix.test.ts
---

# 全面工作流取消时保留进程归属与恢复边界

## 症状

检查扩展工作流的 46 阶段编排时发现，阶段执行只等待直接子进程的 `close/error`，没有接管顶层 `SIGINT/SIGTERM`。工作流退出不能证明阶段后代已结束，也不能证明 watch 写入的源码已经恢复。预检服务已有消费者存活监控，会在消费者死亡后释放服务与锁；本问题不能描述为门禁必然永久泄漏。

## 根因与纠正

取消必须先进入负责恢复源码的 runner，再等待本轮资源完成收尾。工作流现在领取一个取消文件，向阶段透传 `E2E_WATCH_CANCEL_FILE`；watch 命令借用该文件，不另建隔离的取消通道，也不删除上层文件。首次信号固定取消原因，重复信号不能跳过收尾；预检领取、复查和阶段边界均检查取消，后续阶段不会继续启动。

阶段执行与进程身份跟踪拆为独立模块。POSIX 子进程使用独立进程组；进程归属由本轮根进程、仍匹配的启动时间和已登记后代扩展，拒绝凭命令名、工作目录、复用的 PID/PGID 或历史 PPID 重新认领进程。父进程先退出时，仍等待已登记后代结束。Windows 逐个复核 PID 身份后调用 `taskkill /pid /f`，不用 `/t` 根据可能失效的父子关系扩大清理范围。

合作取消窗口用于 runner 的 `finally` 恢复和正常退出；无响应时仅终止已确认身份的本轮进程。强制终止、进程表查询失败或清理超时都作为失败保留，不以进程消失推断源码恢复成功。阶段取消原因、清理错误、门禁关闭错误及报告写入错误保留在错误链和最终报告中；报告明确标记通用源码恢复状态为 `unverified`。原有测试、HMR 和性能预算不变。

## 验证

在 macOS 上设置 `CI=1`，使用禁止快照更新的定向命令：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-stop-errors.test.ts e2e/demo-workflow-windows-cleanup.test.ts e2e/demo-workflow-quality.test.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-environment.test.ts e2e/workflow-cleanup.test.ts e2e/watch-command-lifecycle.test.ts e2e/watch-command-budget.test.ts e2e/watch-command-scopes.test.ts e2e/e2e-matrix.test.ts --update=none
```

13 个文件、115 项通过，0 失败、0 跳过。隔离子进程收到真实 `SIGINT/SIGTERM` 后，取消信号经过实际 watch 命令进入 fixture 的 `finally`，恢复包含 CRLF 和中文的原始字节；另外验证父进程先关闭后，已登记独立后代仍能延迟恢复并退出。编排回归覆盖取消时不调度下一阶段、重复信号、门禁收尾、迟到的清理失败和最终报告；身份回归覆盖 PID/PGID 复用和 Windows 单 PID 清理。扩展阶段顺序、环境过滤及设备绑定契约保持通过。

新增生命周期模块、内存报告与独立进程回归通过严格 TypeScript 检查，包含 `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess` 和 `noPropertyAccessFromIndexSignature`。扩大到原有工作流、watch 依赖和矩阵测试的类型图仍有既存诊断：使用相同编译选项，把已修改跟踪文件的输入替换为起始提交内容后，修改前后均为 311 条相同诊断；没有通过放宽选项消除它们。不能把该比较写成整个 E2E 类型图通过。

修改代码 ESLint、规则检查与 `git diff --check` 通过。原始定向日志与类型输入比较保存在本轮 `.tmp/workflow-cancellation-*` 文件中。

## 适用边界

本修复只覆盖工作流取消、报告和本轮已证明归属的进程。未登记的任意 double-fork、第三方 IDE 内部会话及不提供合作取消的外部工具，不在确认范围。Windows 行为有模型回归，本轮没有 Windows 真实信号验收。fixture 的原字节恢复不能替代真实 demo 或设备的恢复证据。

本轮没有操作微信 IDE、HBuilderX、设备或浏览器，没有执行 46 阶段完整验收，也不把定向回归写成全端通过。公开包行为和 demo 样式未变化，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS 规则。通过实现与持久回归落实现有取消、资源归属、失败停止和证据边界要求。
