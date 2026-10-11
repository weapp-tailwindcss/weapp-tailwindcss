---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 2782d70998846829d6c137d6d47e5e0a3f8a334d
regressions:
  - e2e/hbuilderx-hmr-lifecycle.test.ts
  - e2e/hbuilderx-local.test.ts
---

# Android VDOM 纯 HMR 门槛与工具链重启

## 症状

同一提交的质量、静态、多平台构建、微信 IDE/视觉、8 个 demo 完整 watch、H5、HBuilderX 小程序和 Web 验收通过后，第 19 阶段 Android 在 uni-app x VDOM 首次保存时失败：`纯 HMR 验收失败：restarted`。后续 Android 视觉、iOS、Harmony 和最终跨端比较没有放行。

环境为 HBuilderX stable 5.26.2026091802、uni-app x VDOM、样式隔离 2.0、Android API 30 模拟器。首次 App Launch 后，差量编译和同步又触发第二次 App Launch。两次运行分别在完整链路与同配置定向复现中出现同样结果。

## 根因与纠正

生命周期断言没有误计首次启动：观察器在首次产物、运行时 marker 和截图就绪之后才开始监听保存过程。现有 16 项生命周期回归全部通过。

进一步建立没有 package.json、vite.config、Tailwind 或仓库插件的原生 uni-app x 最小项目，仅包含 manifest.json、pages.json、main.uts、App.uvue 和一个页面。页面使用合法 `.probe` class 选择器，显式设置样式隔离 2.0。首次启动后只将页面文字 `native-before` 改为 `native-after`，颜色 `#123456` 改为 `#654321`：编译无错误，应用仍再次触发 onLaunch。初次对照曾用不受支持的标签选择器；该结果保留，但结论以纠正后的合法 class 对照为依据。

最终对照日志为首次 `02:19:19.005 NATIVE_DIAG_APP_LAUNCH`，保存后 `02:19:23.999 NATIVE_DIAG_APP_LAUNCH`。说明当前工具链在无插件场景也执行应用重启，不能通过修改 weapp-tailwindcss 的样式生成来保证保持运行状态。

不将 uni-app x 改为 native-reload，不删除 App Launch 断言，不放宽门槛。恢复需要取得支持本次纯 HMR 要求的工具链/运行模式证据，再新建全端预检；当前证据不能证明其他平台通过。

后续用户明确授权忽略已确认非插件引起的 Android 重启问题并继续验收。本轮通过忽略产物目录内的任务适配器，仅将 Android VDOM 用例按 native-reload 执行，保留更新失败、重装、产物、运行时及视觉断言；仓库默认模式没有改变。报告标为用户接受的工具链例外，不计作纯 HMR 通过。

该续跑又发现普通 uni-app Android 同步旧产物，已按 [候选监听归属复盘](uni-app-watch-consumer-ownership.md) 修复。提交 `99701d08bbe46ecfd677e0cf7ae829df7eec0f53` 的全部质量门禁、6470 项单测（43 项既有跳过）、11 项受影响 watch/static 验证通过，Android VDOM 全部增量步骤及 4 个 Android 视觉结果通过。证据位于 `e2e/.artifacts/preflight/402a8f20-06ef-4297-9e7d-2a9c77498445/`。

第 20 阶段 iOS 尚未进入页面运行，HBuilderX 提示 App 真机运行插件包含 Intel 程序、需要 Rosetta 2。系统安装记录不存在，`arch -x86_64 /usr/bin/true` 返回 `Bad CPU type in executable`，确认当前机器缺少该运行条件。原始日志和只读系统检查保存在同轮 `ios-rosetta-block/`。停止本任务进程、恢复源码后等待用户处理系统组件安装；iOS、Harmony 和最终跨端比较仍未完成。此阻塞不属于已经授权的 Android 重启例外。

用户随后授权安装 Rosetta 2 并接受 Apple 许可，安装成功，x86_64 执行返回 0。新预检 `0af5b60a-88ff-4cac-9b5d-c9ede9400beb` 全部通过后，从 iOS 阶段续跑：两组普通 uni-app 的产物/传输检查通过，uni-app x VDOM 也编译成功，但运行器调用 `open -a Simulator` 失败，原始错误为 `Unable to find application named 'Simulator'`。

本机选中的工具链是 Xcode 27.0（27A266a），`Contents/Developer/Applications` 不存在；安装目录及系统索引均未找到 `Simulator.app`。Xcode 包含 `Contents/Applications/DeviceHub.app`（`com.apple.dt.Devices`），但 HBuilderX 的启动实现仍明确使用旧应用名，公开 CLI 参数没有替代应用路径选项。读取 DeviceHub 界面超时，未将它假定为可直接替换的兼容入口。Rosetta 阻塞已解除，当前需要解决 HBuilderX 与所选 Xcode 的模拟器应用启动兼容性，不能用 `simctl` 设备已启动或编译成功代替运行时证据。

后续核对 [Apple Device Hub 官方文档](https://developer.apple.com/documentation/xcode/managing-your-simulated-and-physical-devices-in-device-hub) 和 [Xcode 27 发布说明](https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes) 后，纠正“可能缺少 Simulator 安装组件”的判断：Xcode 27 的模拟器管理与显示入口是 Device Hub，文档明确说明运行模拟器时由 Device Hub 打开窗口。本机已安装该应用，模拟器运行时及 simctl 也可用。因此这里是 HBuilderX 仍调用旧应用名的兼容问题，不应据此要求重装 Xcode 或重复下载 iOS runtime。更换启动入口后仍需实际验证 HBuilderX 完整运行链路，不能直接将当前阻塞标为通过。

本轮仅安装了已授权的 Rosetta，没有重装/降级 Xcode，也没有改写 HBuilderX。测试进程已停止、临时源码标记已按原始内容核对恢复。安装记录、编译成功日志和新的启动错误保存在同轮 `rosetta-install.txt`、`ios-simulator-block/`；Harmony 与最终跨端比较仍未调度。

## 验证

- 完整运行 `d1983685-5a8c-4e0f-a851-7769ac35cf82`：6470 项单测通过、43 项既有跳过；699 项 static 通过、35 项按专项开关跳过；52 项多平台产物通过，质量门禁通过。微信视觉中一次 DevTools 连接/reLaunch 超时阻断，官方 CLI 定向诊断恢复后没有改变源码。
- 新预检 `d49abc54-919b-43f9-9baf-10eb23a91df6` 按同 SHA 从失败子阶段续跑：11 个微信视觉结果通过；8/8 demo watch 通过，约 45 分钟；H5 构建 5 项、Taro Web HMR 4 项、Web Vite HMR 18 项、uni-app H5 3 项通过；HBuilderX 小程序 5 项和 Web 3 项通过。
- HBuilderX 套件按平台筛选产生的 skip 只表示其它组本阶段不执行。Android 两个普通 uni-app 用例仅有产物/传输断言，日志明确未配置运行时探针，不能写成已取得设备视觉与完整运行时证据。
- `E2E_HBUILDERX_CASE='uni-app-x-vdom-tailwindcss-v4 android' pnpm e2e:hbuilderx:local:android` 在相同工具链和设备绑定下复现 restarted。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-hmr-lifecycle.test.ts --update=none`：16 项通过。
- 原始日志、运行前后截图、定向复现与无插件最小项目均保存在 `e2e/.artifacts/preflight/d49abc54-919b-43f9-9baf-10eb23a91df6/`，其中有效无插件对照为 `native-hmr-class-diagnostic/`。所有诊断进程已停止，仓库测试源码已恢复。

## 适用边界

该结论仅针对已验证版本的 Android VDOM 保存行为，不外推到 iOS、Harmony、Vapor 或其它工具链版本。预检通过只证明环境可运行，不证明编译器支持纯 HMR。

后续用户授权跳过 iOS 并免除本轮新预检；Harmony 无插件对照与 H5/跨端截图结果见 [Harmony 与 H5 续验记录](harmony-h5-acceptance.md)。Harmony 和跨端视觉仍有失败，不扩大本页的 Android 例外。

## 规则评估

保留原有生命周期门槛。另将已实际验证的后台应用内 computer use 入口写入多端手册：用户正在使用 Chrome 时可完成取证且不抢占其窗口，仍要求截图、输入、点击、回执和 verify 全部通过。
