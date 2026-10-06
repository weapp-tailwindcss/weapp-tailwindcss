---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 92d68bd3426c054429f9d991d2a8729b071ae17e
regressions:
  - e2e/lynx-native-command.test.ts
  - e2e/lynx-command-observer.test.ts
  - e2e/lynx-native-device.test.ts
---

# Lynx 设备查询超时的命令证据

## 症状

CI run `37309029345` 的 iOS job `111759610724` 在模拟器 `bootstatus` 完成后，执行一次 `xcrun simctl list devices available --json`，约 32.9 秒后以 `timedOut=true`、`SIGTERM` 失败。失败发生在设备选择之前，尚未运行 Pod、Lynx 构建或应用。

## 根因与纠正

已有 `failure.json` 保留了原始异常，但缺少命令实际 PID、输出时间与退出/管道关闭时间，无法区分 CoreSimulator 等待和子进程生命周期异常。RN 流程的同类查询没有相同的 30 秒上限，因此 RN 成功不能证明此处查询健康。

在原设备查询上附加观察器，保留分流输出的前 16 KiB、总字节数、spawn、首输出、exit、close 和结果结算时间。仅当本轮命令超过 10 秒仍活跃时，macOS 对其 PID 执行一次两秒 `sample`，诊断进程自身五秒强制结束。采样写入本轮目录，原命令退出后立即取消采样；采样失败不改变原命令结果。证据写入失败仍报错，并保留原始异常。

原命令、设备身份校验和 30 秒门槛不变，没有附加查询、暖机、重试或服务重启。此变更补齐诊断缺口，尚不代表已找到或修复远端超时根因。

## 验证

使用 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-native-command.test.ts e2e/lynx-command-observer.test.ts e2e/lynx-native-device.test.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-ios-container.test.ts e2e/lynx-native-options.test.ts --update=none`。

新增命令证据回归在修改前四项失败；修改后覆盖真实命令成功、超时、启动失败、证据写入失败、退出后的输出、UTF-8 字节边界，以及忽略 SIGTERM 的采样替身在超时和取消时被回收。

## 适用边界

调用栈采样会短暂暂停被观察进程；存在 `sample-start` 的记录属于带诊断探针的执行，不用于无探针性能比较。macOS 以外仍保存生命周期证据，但不执行 macOS `sample`。每轮报告仅对应原有的一次查询，不能作为设备完整验收结果。

## 规则评估

不新增 AGENTS 规则。使用持久测试约束证据归属、原异常保留和诊断资源释放，后续基于 CI 的实际调用栈继续定位。
