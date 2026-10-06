---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c05b342ded79797ce2efc36c9d3e5f0bb678e952
regressions:
  - e2e/app-target.test.ts
  - e2e/app-visual-lifecycle.test.ts
---

# App 启动与视觉证据绑定同一设备

## 症状

同时启动两台 iOS 模拟器并指定第二台时，视觉入口将指定 UUID 用于截图，却只向 HBuilderX 传递 `--iosTarget simulator`。测试可能启动另一台模拟器，截图无法证明被测应用的行为。完整视觉生命周期回归修复前有三项失败，实际启动参数缺少 `--deviceId`。

## 根因与纠正

预检已经统一设备环境变量，但各消费者仍分别解析启动与截图目标。HMR 入口追加设备 ID，视觉入口没有；底层 runner 只绑定 IDE host，不负责设备选择。Android/Harmony 的标准用例消费了预检变量，但自定义启动参数与截图环境变量冲突时也会分别选择设备。

在 E2E 层增加共享的 `bindAppTarget`，在创建 runner、修改源码之前汇总设备配置、检查在线目标并绑定唯一 ID。启动参数、截图和运行时探针统一消费绑定后的用例。多设备未指定、指定目标缺失、重复参数、运行与截图配置冲突立即失败。iOS 模拟器流程独立校验 `--iosTarget simulator`，设备 UUID 通过 `--deviceId` 传递。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/app-target.test.ts e2e/app-visual-lifecycle.test.ts --update=none`：28 项通过。覆盖指定第二台模拟器、启动和截图实际调用参数一致、三端配置冲突、目标缺失、多设备歧义、重复/空参数、iOS target 冲突、仅 SDK 提供 adb、Harmony 空目标及原生 HMR 生命周期。

保留首次失败日志于任务 artifacts。设备枚举只确认绑定，不替代实际应用、截图和 HMR 验收；完整流程须在提交后重新预检。没有修改 demo 或样式输出，无需重生成 static 基线。

## 适用边界

本修复属于本仓库 HBuilderX E2E，未改变公开 runner 包对其他调用方的设备选择策略，也不会启动、关闭或重置用户模拟器。在线设备后续掉线由实际命令和阶段门禁报告。

## 规则评估

不新增 AGENTS 规则。现有设备身份与证据规则已经明确，新增共享实现和持久回归落实该边界。
