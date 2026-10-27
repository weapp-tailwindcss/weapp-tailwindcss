---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 1c4ed4a2a72d9eec79715cb178a6b4f8668105b1
regressions:
  - website/scripts/local-worker/process-lifecycle.test.ts
  - website/scripts/local-worker/test-process-state.test.ts
  - packages/weapp-tailwindcss/test/ci/local-worker-workflow.test.ts
---

# Linux 后代退出与 zombie 回收的测试边界

## 症状

PR #1316 的 quality shard 1 在 `surviving-detached` 用例失败：生产清理已经返回，但 `process.kill(pid, 0)` 没有抛出异常。失败证据为 [run 39995316056 / job 120562629917](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39995316056/job/120562629917)。同一 head 的 Ubuntu 独立生命周期 job 通过，说明“PID 立即消失”受到操作系统回收时序影响。

## 根因与纠正

使用该 head 的真实 `withLocalWorker`、`workerFixture` 在 Linux / Node 24.22.1 容器中复现，保留同一 PID 和 `started` 出生身份。清理前后代为非 zombie；清理后其父进程变为 PID 1、`zombie: true`，同时 signal 0 仍成功。它已经停止执行并关闭监听端口，但尚未被父进程回收。原 fixture 收尾也误把该状态当作存活，向已关闭的端口发送 `/stop` 后再次失败。

生产进程树已按出生身份登记后代并排除 zombie，修复仅调整测试基础设施：

- 退出断言核对 PID 与已登记的出生身份，并区分仍执行、zombie、已消失和 PID 被复用；仍执行时立即失败。
- 进程结束后还必须确认监听端口拒绝连接；连接成功、探针超时和其它探针错误都不能通过。
- 失败收尾不向 zombie 或被复用的 PID 发信号；需要协作停止时先验证本轮随机凭据，并在带凭据的退出请求前再次核对出生身份，避免误停占用旧端口的其它服务。
- 保留 `surviving-detached` 强制清理错误断言，不把强制清理改写成正常成功。

生产清理器、终止信号、命令预算和构建流程均未修改。

## 验证

在该 baseline 加未提交修复的源码上，macOS / Node 22.22.3 和 24.22.1 分别执行以下定向集合，各通过 8 文件、78 测试，无跳过：

```sh
CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run \
  scripts/local-worker/launch-gate.test.ts \
  scripts/local-worker/launch-gate-options.test.ts \
  scripts/local-worker/process-lifecycle.test.ts \
  scripts/local-worker/windows-lifecycle.test.ts \
  scripts/local-worker/command.test.ts \
  scripts/local-worker/server.test.ts \
  scripts/local-worker/test-scope.test.ts \
  scripts/local-worker/test-process-state.test.ts \
  --maxWorkers=1 --update=none
```

`command.test.ts` 内的 Playwright 子任务故意首例失败，用于验证 fail-fast；外层 Vitest 的 78 项结果全部通过。另执行 `test/ci/local-worker-workflow.test.ts`，3 项通过，确认 Windows Node 22/24、Ubuntu Node 24、macOS Node 24 均包含新回归。

修复后的真实 Linux / Node 24.22.1 场景连续验证 3 次：存活状态拒绝退出断言；同身份 zombie 与关闭端口通过；fixture 收尾成功。容器逐次使用 `--rm` 删除，未触碰宿主机进程或用户会话。

修复后的 hosted Windows/Linux/macOS CI 尚待当前补丁提交后验收；本地定向结果不替代新 head 的 CI。

## 适用边界

这些辅助函数仅用于本轮创建的合成 fixture。signal 0 仍可用于已持有 `ChildProcess` 句柄且明确等待 `close` 的根进程回归，但不能单独判断已被重新托管的后代是否仍执行。身份采集失败继续阻断，不猜测 PID 或端口归属。

## 规则评估

不新增 AGENTS 规则。现有进程归属要求已经覆盖该风险，使用可执行回归明确操作系统 zombie 语义即可。
