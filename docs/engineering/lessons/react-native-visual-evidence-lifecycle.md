---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - e2e/react-native-native-screenshot.test.ts
  - e2e/react-native-runtime-artifacts.test.ts
  - e2e/react-native-android-visual-probes.test.ts
---

# React Native 截图就绪与证据生命周期

## 症状

Expo iOS 的运行时回传和 HMR 断言通过，但 TSX 变更后的截图包含 Refreshing 遮罩。固定等待两秒和截图哈希不同，不能证明当前探针已经完整绘制。增加像素门禁后，画面在就绪与遮挡之间反复切换。

## 根因与纠正

JS 状态回传和原生开发遮罩不在同一生命周期。Expo 的 workspace 监听包括 e2e 与其他 demo；运行期间把 Metro 日志和截图写入 e2e 会再次触发刷新，其他 demo 的并行变更也会干扰本轮验收。

运行期证据改写到系统临时目录，待 Metro 停止后统一发布。每张原生截图验证三个探针的实测几何、当前颜色与连续两帧就绪，保留每次像素评估。遮罩覆盖主题卡片时，即使 HMR 文字仍可见也必须失败。

Android `measureInWindow` 会减去可见窗口 inset，不能直接乘像素比作为全屏截图坐标。Android 使用本轮 UIautomator 的屏幕 bounds，同时核对包身份、资源 ID、当前标识和实测尺寸；iOS 保留原生窗口测量。不能硬编码状态栏高度，不能通过扫描颜色寻找一个恰好通过的区域。

## 验证

- `pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/react-native-native-screenshot.test.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-android-visual-probes.test.ts --update=none`：6 项通过。
- `pnpm e2e:react-native:web`、`pnpm e2e:react-native:ios`、`pnpm e2e:react-native:android`：串行真实运行通过，当前 baseline、TSX 与 CSS 三张截图逐张审查；28 supported / 90 unsupported，不表示 118 项全部支持。
- 当前示例新增用于颜色测量的 `bg-slate-900` 候选，单独通过 `writeStaticEvidence` 重新生成 `examples/react-native-expo/src/compatibility/static-evidence.json`；兼容目录结论不变，未覆盖 runtime 报告。
- 原始失败、截图和每次命令的源码哈希保存在本轮 local-full-run 报告中；Android 坐标错误的原始失败仍保留。

## 适用边界

验证版本为 Expo 54.0.37、React Native 0.81.5、iOS 26.5、Android 11/API30。截图只验收可见的测量探针；示例顶部绝对定位探针与系统安全区的重叠不构成完整应用 UI 质量通过。原生窗口模式变化时仍须复查坐标映射。

Expo CLI 会枚举非目标离线模拟器。本轮通过独立 ADB 服务、官方扫描端口环境变量完成环境隔离，未修补业务代码、终止全局 ADB 或关闭其他设备。CocoaPods 的 PATH 与 Ruby Logger 问题只在本次子进程环境修正。

## 规则评估

不新增 AGENTS 规则。已有规则要求本轮有效截图、结构探针和源码恢复；通过持久回归与证据生命周期修复落实这些要求。
