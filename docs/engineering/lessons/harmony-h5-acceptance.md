---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 94c15d711920c1110f3842013ce4c45ffedbeca3
regressions:
  - e2e/hbuilderx-local.test.ts
  - e2e/hbuilderx-hmr-lifecycle.test.ts
  - e2e/demo-visual-theme.test.ts
---

# Harmony 工具链失败与跨端截图口径

## 症状

用户明确授权“先跳过这个，做其他的验证，也不需要预检了”，本轮跳过 Xcode 27 / HBuilderX 兼容性阻塞的 iOS，不运行新预检，继续 Harmony 和独立 H5 验收。这是本任务的范围调整，未修改仓库通用门禁。Android VDOM 原生热重载例外沿用[此前授权记录](android-vdom-hmr-gate.md)，不扩大到 Harmony。

执行 checkout 为上述 baseline，最新生产源码提交为 `99701d08bbe46ecfd677e0cf7ae829df7eec0f53`。本轮没有修改生产源码、测试断言或快照。

`pnpm e2e:harmony` 编译及安装成功，设备截图和布局包含本轮 `hbuilderx-app-dynamic-v4-harmony` 标记，但测试日志未收到 `App Launch`，600 秒后超时。保留此失败后，任务诊断用例只增加 `--runtime-log-format raw --native-log false`，保持全部运行时与 HMR 断言；启动检查通过，首次保存收到 `开始热更新 ...`、`热更新失败`，随后工具准备重建鸿蒙工程，断言正确拒绝放行。

独立 H5 验收完成 17 个场景截图和 55 个 HMR 步骤；合并本任务此前的微信、Android 截图后，12 组跨端比较均超过 5% 门槛，命令非零退出。H5 最终结果为 9 个通过、8 个跨端比较失败；此前单端成功记录与本轮跨端失败应分别解读。

## 根因与纠正

### Harmony 无插件对照

环境为 HBuilderX stable `5.26.2026091802`、OpenHarmony `6.1.1.125`、VDOM、样式隔离 2.0。临时原生 uni-app x 项目没有 package.json、vite.config 或 Tailwind 插件，仅使用 `.probe` class。启动后将页面文字和颜色一起更新：

- `10:52:05.448`：`NATIVE_DIAG_APP_LAUNCH`。
- `10:52:08.644`：`开始热更新 ...`。
- `10:52:14.847`：`热更新失败`。

同一工具链在无插件项目也能复现失败，说明失败不以 weapp-tailwindcss 为必要条件；尚未定位 HBuilderX 内部实现或设备端协议的具体故障。不把系统日志中的通用错误直接当作根因，不将 Harmony 改为 native-reload，不把它计作已通过。依赖同一 HMR 链路的 Harmony 视觉阶段未执行，Vapor 证据仍未取得。

### 跨端截图并非同一页面状态

检查真实截图与采集实现后，确认当前比较将各平台 HMR 的最终整图直接缩放至 390×844，但没有统一页面状态和取景区域：

- Taro H5 的标记插入位置来自 Web 用例锚点，微信则插入根节点内；React Vite 的蓝色标记分别位于示例块下方和页面顶部。
- uni-app x 的 H5 和 Android 使用不同标记文字与增量步骤；H5 会将 Web 探针滚入可见区域，Android 截图停留在另一滚动位置。
- Web 使用 `fullPage` 截图，微信裁剪运行时窗口，Android 使用整屏截图。Android 当前证据还包含系统栏和 `Loading debugging framework...` 提示。

这说明当前高差异值不能直接证明插件样式错误，也不能据此宣称样式一致。修复验收需要统一跨端用例状态、内容区域、逻辑视口与就绪条件，重新取得实际截图；单纯拉伸图片、删除差异区域或提高阈值不能完成这一验证。本轮保留失败，不更新基线，不将比较失败改为跳过或成功。

## 验证

本轮原始产物目录：`e2e/.artifacts/acceptance/remaining-813fe53f-93d6-4df2-a8c8-1b464bf8ec67/`。

- `authorization.json`、`summary.json`：用户范围调整、checkout 与最终状态。
- `run.log`、`harmony-first-run/`：正式 Harmony 超时及原始设备证据。
- `harmony-raw.log`、`harmony-raw-run/`：原始日志通道下实际 HMR 失败。
- `harmony-native-diagnostic/source/`、`result.json`、`hbuilderx.log`：无插件最小项目及失败对照。
- `h5-result.json`、`h5-visual.log`：H5 命令、时间、SHA 与退出码。
- `visual-before.json`、`visual-after-report.json`、`visual-after-report.md`：合并前后的完整结果。截图和 diff 位于 `e2e/.artifacts/demo-visual/full/`，未提交到 Git。

H5 验证命令：

```bash
DEMO_VISUAL_REPORT_RESET=0 DEMO_VISUAL_MAX_CROSS_PLATFORM_DIFF_RATIO=0.05 pnpm exec tsx scripts/demo-visual-e2e-report.ts --h5-only --fail-on-incomplete
```

| 项目 | 微信/H5 差异 | Android/H5 差异 |
| --- | --- | --- |
| taro-vite-react-tailwindcss-v4 | 46.43% | 未配对 |
| taro-vite-vue3-tailwindcss-v4 | 40.26% | 未配对 |
| taro-webpack-react-tailwindcss-v4 | 44.36% | 未配对 |
| taro-webpack-vue3-tailwindcss-v4 | 57.26% | 未配对 |
| uni-app-vite-tailwindcss-v4 | 65.01% | 54.65% |
| uni-app-vite-vue3-hbuilderx-tailwindcss-v4 | 35.60% | 60.84% |
| uni-app-x-vdom-tailwindcss-v4 默认隔离 | 20.13% | 30.77% |
| uni-app-x-vdom-tailwindcss-v4 隔离 2.0 | 22.33% | 27.93% |

## 适用边界

本轮不是全端通过。iOS 为用户授权跳过；Harmony HMR 失败，后续 Harmony 视觉阻塞；跨端视觉失败。gulp、mpx、weapp-vite 的微信结果没有匹配 H5 截图，不计入跨端成功。9 个 Web H5 场景通过本端验收，并不代表取得其它平台对照。

微信截图来自源码提交 `2782d70998846829d6c137d6d47e5e0a3f8a334d` 的既有验收，Android 来自最新生产源码提交；本轮 H5 在 baseline checkout 运行。合并用于发现差异，不把历史截图改写为本轮同 SHA 证据。修正采集口径后还需在同一源码版本重新采集。

## 规则评估

不新增 AGENTS 规则，不修改纯 HMR 或 5% 差异门槛。现有失败日志与生命周期断言有效；跨端视觉采集契约仍待修复，保留为明确未完成项，不以文档记录代替修复和重验。
