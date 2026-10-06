---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/tree/148cebd6ce3584f5b2c930dd63639a0c3a5d47ee
baseline: 148cebd6ce3584f5b2c930dd63639a0c3a5d47ee
regressions:
  - e2e/preflight-gate.test.ts
  - e2e/preflight-probes.test.ts
  - e2e/lynx-native-device.test.ts
  - e2e/lynx-native-environment.test.ts
  - e2e/lynx-ios-container.test.ts
  - e2e/react-native-android-device.test.ts
---

# 原生验收中的设备身份传递

## 症状

全面预检绑定了 RN 和 HBuilderX 设备，但没有把同一设备传给 Lynx。Lynx Android 默认使用固定 serial，iOS 运行和元数据采集分别选择设备；同时启动两台模拟器时，显式运行第二台却可能记录第一台的名称、系统和视口。Android 录像的 `adb pull` 也没有携带选定 serial。

RN 的 `RN_ANDROID_EXPO_DEVICE` 原来直接覆盖运行目标，与截图使用的 `RN_ANDROID_DEVICE_ID` 没有一致性检查。旧配置可能把安装目标和证据目标分开。

## 根因与纠正

设备发现、构建、运行和证据采集各自读取配置或选择默认设备，缺少贯穿生命周期的身份。修复后 Lynx 在构建前只解析一次唯一在线目标，显式把身份传给运行、截图、录像、容器查询和元数据采集，并将设备描述保存在本轮 artifacts 的 `device.json`。

预检与原生 runner 复用目标选择和 destination 校验。门禁把 Lynx ID、Android serial、iOS destination 一并绑定，并将这些配置及 RN Expo 目标纳入源码/环境身份；配置冲突阻断，不能覆盖后隐藏冲突。RN 的 Expo AVD 名称必须通过已选 serial 查询并验证，验证失败不能用未确认的名称兜底。

## 验证

- 先补现有门禁的反例，确认三个失败：Lynx ID 未绑定、Lynx Android ID 与 RN 不一致仍通过、`ANDROID_SERIAL` 与 RN 不一致仍通过。
- 定向回归：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-gate.test.ts e2e/preflight-probes.test.ts e2e/preflight-evidence.test.ts e2e/lynx-native-device.test.ts e2e/lynx-native-environment.test.ts e2e/lynx-native-options.test.ts e2e/lynx-native-command.test.ts e2e/lynx-ios-container.test.ts e2e/react-native-android-device.test.ts --update=none`，9 文件、104 测试通过，无跳过。
- 新增模块与测试的严格 TypeScript 检查、全部变更代码的 ESLint、`pnpm agents:check`、`git diff --check` 通过。类型检查同时纠正 Lynx command/options 中两处可选属性与实际返回值不一致的声明，运行行为不变。
- 回归覆盖多设备显式选择、缺失/离线/未授权目标、iOS destination 冲突、同一设备的报告元数据、Android 导出命令和跨入口配置身份失效。

## 适用边界

这些单测使用合成设备清单和受控命令返回，不代表真实设备、编译或跨端视觉验收。真实 prepare、computer use 与多端运行仍由主验收流程统一完成，本文维持 `partial`。正常验证未更新已提交报告或快照。

RN Android 当前使用 AVD 链路；无法从选定 adb serial 证明 AVD 名称时阻断。iOS 运行链路仍是 Simulator，不能描述为物理 iPhone 验收。

## 规则评估

不新增 AGENTS 规则。现有唯一目标、同轮证据和不得跳过的要求已足够，本次将设备身份落实为显式数据流和持久回归。
