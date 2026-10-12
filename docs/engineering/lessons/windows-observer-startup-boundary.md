---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1288
baseline: a75bbed8498bb49546301c6b9556aff756f0054c
regressions:
  - e2e/demo-workflow-observer-startup.test.ts
  - e2e/demo-workflow-process-observer.test.ts
  - e2e/demo-workflow-observer-memory.test.ts
  - e2e/demo-workflow-windows-observer.test.ts
  - e2e/demo-workflow-cancellation.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
  - e2e/dev-startup-matrix.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-source.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-sampler.unit.test.ts
---

# Windows 采集器宿主启动与真实预热的截止边界

## 症状

[PR Gate run 38270723472](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38270723472)、attempt 1、准确 head `a75bbed8498bb49546301c6b9556aff756f0054c` 的 [Windows dev startup job 114884771255](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38270723472/job/114884771255) 在 `weapp-vite-tailwindcss-v4` 业务启动前失败。Windows Server 2025 / Node 22 的 Watch 内存采集器报告：

```text
elapsedMs: 15019
readyAtMs: 10422
runtimeVersion: 5.1.26100.33438
memory request sentAtMs: 1
stdin-written: 2
request-received: 14089
```

完整日志保存在忽略的 `e2e/.artifacts/issue-1286-ci/windows-dev-startup-job-114884771255.log`。没有 `query-completed` 或 `response-ready`，业务尚未 spawn，不能归为 demo 编译或样式缺陷。

## 根因与纠正

此前宿主启动、JSON cmdlet 首次加载和真实 CIM 查询共享一个 15 秒截止。宿主首次标记到达已耗时 10.422 秒，输入解析完成又到第 14.089 秒，真实全表 memory 查询与序列化只剩不足 1 秒。阶段记录是父进程接收时刻，只能证明预算分配问题，不能把每段延迟进一步认定为某个内部模块的 CPU 时间。

统一 Workflow 与 Watch 的准备契约：同一个持有的 collector 先完成宿主握手，截止从 spawn 前起算，最多 15 秒；之后完成真实 provider 查询，截止从收到合法 ready 的不可变时刻起算，最多 15 秒。Workflow 的本体身份和 memory 共用该预热截止；Watch 继续调用原全表 memory 查询。总准备上限由 15 秒变为 30 秒，业务等待、运行采样 5 秒、业务清理 2 秒和 collector 回收确认 1 秒保持原值。相关真实 Windows、取消、dev 与 HMR 测试同步外层准备预算，保留原业务和收尾余量。

`observer-ready` 仅表示宿主进入脚本，不能作为 CIM 已可服务的证据。ready 前不发送真实查询；真实预热完成后才启动业务，预热样本不计入业务指标。ready 和进度不会续时，Promise 续体不能重新领取预算。最终放行前再次检查健康及绝对截止，最后查询成功后排队的退出事件或迟到续体也阻断业务。

等待握手纳入同一 fatal、abort、EOF、stream error、close 和退出确认边界；迟到 ready、重复 ready、错误 PID/版本、同块坏尾行都使会话失效。没有重试、重启、降级查询或复用旧样本。失败只终止本轮持有的采集器一次，退出未确认继续阻断。

这是准备契约的修正；[此前诊断记录](windows-observer-prepare-diagnostics.md) 的单一 15 秒设计保留为历史证据，不能再作为当前契约。

## 验证

本地环境为 macOS、Node 24.18.0、pnpm 12.9.1；下列结果包含基线上的本轮未提交修复，不把基线 SHA 当作修复后的提交。慢启动两项先在旧实现失败，同一用例在新实现通过。

```sh
CI=1 corepack pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-observer-startup.test.ts e2e/demo-workflow-process-observer.test.ts e2e/demo-workflow-observer-memory.test.ts e2e/demo-workflow-observer-diagnostics.test.ts e2e/demo-workflow-cooperative-budget.test.ts e2e/demo-workflow-powershell-bootstrap.test.ts e2e/demo-workflow-windows-observer.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-native-cancellation.test.ts --update=none --coverage.enabled=false
CI=1 corepack pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-memory-source.unit.test.ts test/watch-hmr-memory-sampler.unit.test.ts test/watch-hmr-runner.unit.test.ts test/watch-hmr-runner-cleanup.unit.test.ts test/watch-hmr-web-cleanup.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none --coverage.enabled=false
CI=1 E2E_DEV_STARTUP_RUN=1 E2E_DEV_STARTUP_CASE=weapp-vite-tailwindcss-v4 E2E_DEV_STARTUP_TIMEOUT_MS=180000 corepack pnpm e2e:dev:smoke
```

第一组最终为 108 项通过、2 项 Windows 专属用例跳过；新增启动边界 20 项通过。第二组为 170 项通过、1 项 Windows 专属 smoke 跳过。实际 dev 入口 2 项通过，初次构建约 4.1 秒，finally 确认本轮进程退出。准备失败、运行与清理边界、真实单个 Node provider、SIGINT/SIGTERM 和独立后代恢复继续覆盖。

修复 head `6d5a5588967797811e3515fe2cf9b18596675df6` 的 [Windows startup job 114908377848](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38277825189/job/114908377848)、attempt 1 已在 Windows / Node 22 通过真实 dev 的 2 项检查；Linux 与 macOS startup 同样通过。该 job 不等于上述本地条件跳过的 3 项独立 Windows 协议测试均已执行。

## 适用边界

本地定向验证证明截止、协议和生命周期行为，已补充上述准确修复 head 的真实 Windows startup 证据。独立 Windows 协议用例及其余新 head 门禁应分别核对；不能把旧 head 成功、排队、取消或条件跳过当作已执行通过。未执行本地全仓或全端验收，没有启动、重置或登录 IDE，也没有创建浏览器资源。此记录保持 `partial`。

## 规则评估

不新增 AGENTS 规则。修正共用 collector 的准备契约和持久回归即可；仅涉及私有验收工具与测试，不新增包发布 intent，没有改动 demo 源码或样式基线。
