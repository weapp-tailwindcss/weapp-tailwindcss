---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 091ff6890be473e51df8d8dca708b8997e574549
regressions:
  - e2e/lynx-native-artifacts.test.ts
  - e2e/lynx-native-command.test.ts
  - e2e/lynx-native-device.test.ts
  - e2e/lynx-ios-container.test.ts
---

# Lynx 设备发现失败也必须留下本轮证据

## 症状

[iOS CI 的 Lynx 任务](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37290323440/job/111698951509)已创建并 boot simulator，但后续 `xcrun simctl list devices available --json` 在 30 秒超时。上传步骤未找到任何 artifact，无法从附件区分设备发现与原生构建失败。

## 根因与纠正

`run-native.ts` 原来先执行 `resolveNativeDevice`，之后才创建证据目录；复制 fixture、构建及复制 bundle 也都在晚到的 try/catch 外。任何准备阶段失败都绕过 `failure.txt`，这是已证实的证据丢失边界，不是 CoreSimulator 超时的已证根因。

现在先建立 artifact 目录，再将设备发现、host 准备、bundle 构建/复制、原生运行和报告校验纳入统一错误边界。保留 `failure.txt` 入口，新增 `failure.json` 记录失败阶段、时间及允许的命令结果字段，不展开 Execa 的环境和配置。若记录证据自身失败，聚合原始失败及写入失败；已有 device、bundle 和报告文件保留。iOS CI 的准备回归入口加入该持久测试。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-native-command.test.ts e2e/lynx-native-device.test.ts e2e/lynx-ios-container.test.ts --update=none`：4 文件、40 项通过。

新增 11 项包括真实 Node 子进程在设备发现阶段超时、其余每个阶段失败、已有证据保留、环境字段隔离、部分/全部写入失败、CLI 异常链与循环引用、目录不可建立时零设备命令及正常返回。原命令错误状态、设备绑定和 iOS 容器恢复回归同时通过。日志保存在任务 `.tmp/ci-audit/lynx-failure-artifacts-final.log`。

## 适用边界

本次修复失败取证，不能据此认定原始 simctl 超时已经消除。没有操作本地模拟器、微信登录态或重启任何 IDE，也没有延长 30 秒发现期限、重试设备发现或降低 Booted 校验。实际 iOS 执行仍需后续 CI 与全端预检证明。

纯测试编排变更不影响公开包及样式输出，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS。用可执行失败边界回归落实已有“保留首次失败证据”要求，避免再把准备错误留在取证之外。
