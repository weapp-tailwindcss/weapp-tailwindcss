---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38135023565/job/114457094469
baseline: 70ff7cc0c0adba5ab22aa65d8429c80e086fdad2
regressions:
  - e2e/lynx-native-command.test.ts
  - e2e/lynx-command-observer.test.ts
  - e2e/lynx-command-host.test.ts
---

# Lynx iOS 启动命令的失败证据

## 症状

PR #1282 的准确 head `70ff7cc0c0adba5ab22aa65d8429c80e086fdad2` 在 Lynx iOS 作业 `114457094469` 的首次执行中失败。模拟器启动、项目构建、安装与应用容器查询已经完成；随后同一次 `xcrun simctl launch --terminate-running-process` 达到原 60 秒截止。原始错误为 `timedOut: true`、`signal: SIGTERM`、`durationMs: 60048.59475`。

## 根因与纠正

现有日志与 `lynx-ios-38135023565` artifact 只能定位到启动命令，没有该进程等待栈、主机状态或输出时序，不能区分模拟器服务迟缓与应用启动问题，也不能据此归因为基础设施噪声。

启动调用接入仓库已有的 `observeNativeCommand`，保存 `launch-command.json`。若本次进程存活超过 10 秒，已有观察器仅对本轮命令 PID 执行一次有界采样，同时收集主机状态；原进程退出后取消并回收采样。诊断沿用现有输出大小限制和失败传播，不另发 simctl 查询，不操作共享模拟器服务，不重试启动，不改变原 60 秒截止或样式验收。

这补齐失败层的证据，不是对首次超时原因已经得到验证的结论。后续准确 head 的原配置 hosted 执行用于确认启动及实际样式报告；若再次失败，应依据原始命令证据修复首次偏离的边界。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-native-command.test.ts e2e/lynx-command-observer.test.ts e2e/lynx-command-host.test.ts --update=none`：3 文件、18 项通过，包括真实超时不重试、只采样原 PID、随退出取消与采样子进程回收。修改入口的严格 ESLint、`pnpm agents:check` 与 diff 检查通过；本机定向测试不替代 hosted iOS 的启动和样式证据。

## 适用边界

仅为原 iOS 启动调用增加本轮诊断。原失败 artifact 和日志保留，不能通过清理用户设备、放宽截止、条件跳过或无限重跑消除失败。没有启动本地全仓或全端验收。

## 规则评估

不新增 AGENTS 规则。现有失败分层、准确提交验收及有界观察器回归已覆盖该问题；具体等待原因仍待 hosted 证据，因此保持 partial。
