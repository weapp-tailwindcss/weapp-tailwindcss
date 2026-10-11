---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1217
baseline: 287239cd7f65cd569b02853536066f1268ed7473
regressions:
  - e2e/app-marker-visual.test.ts
---

# App 标记内部文字碎片的候选归属

## 症状

2026-09-19 恢复样式迁移的本地验收，HBuilderX 5.26 的 Harmony Vapor 两种样式隔离用例都停在初始截图检查。截图已显示真实页面，173px × 41px 的蓝绿色标记内文字换行并接近边缘，但识别器报告 `candidateCount: 3`，因此拒绝继续。

## 根因与纠正

识别器用背景色连通区域及声明的宽高比例定位标记。文字轮廓隔出的背景色碎片也可能满足该比例，原实现将它们与外层区域平等计为候选，导致同一个标记被误判为多个。

原始截图中，外层候选边界为 `(0, 302)-(600, 435)`，匹配 41,675 个像素；两个内部碎片分别为 `(447, 303)-(485, 311)` 和 `(240, 429)-(270, 435)`，匹配 128、142 个像素。后一个碎片触及外层候选的底边。

在既有颜色和比例筛选之后，移除包围盒被另一个更大候选完整包含的候选。外层边界与匹配像素数保持原值，不把碎片像素合并进它。两个独立同形标记仍属于歧义，即使其中一个面积更小，也不直接选择最大的候选。颜色容差、比例容差、像素下限、文字检查、截图差异与 HMR 生命周期标准均未改变。

## 验证

- 先添加回归再修复：新增两个用例在旧实现上失败；已有三个用例通过。
- 使用内存 PNG 覆盖内部文字轮廓、触边碎片、两个独立标记、不同大小的独立同形标记、无标记及同色移动；没有修改 demo、IDE 用例配置或样式输出，所以不涉及项目 static 基线更新。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/app-marker-visual.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts --update=none`：22 项通过，其中图像识别 6 项、生命周期 16 项。
- 两个 TypeScript 文件的 `eslint --no-ignore`、`pnpm agents:check`（0 errors）与 `git diff --check` 通过。
- 对本轮 Harmony Vapor 默认与 v2 隔离的两张原始 PNG 分别运行修正后的 `locateMarkerColor`：均为 `matched: true`、`candidateCount: 1`，外层候选仍为 41,675 像素。这是离线诊断，不是新一次设备验收。

原始证据位于验收工作树的 `.tmp/postcss-final-acceptance-resumed/2026-09-19T03-28-09-056Z/`；完整视觉报告生成时间为 `2026-09-19T04:01:37.922Z`。该组合工作树为 `dd74f6065`，包含 #1217、独立的 5.26 编译器升级及 #1221 的 core banner 迁移，不将这些结果冒充本修复分支的设备验证。

## 适用边界

本轮组合验收的 40 个视觉用例中，微信 11 项、H5 17 项、普通 Vue3 Android/iOS 各 2 项通过。普通 Vue3 App 使用已经确认的原生热重载标准，分别记录重启，不算保持状态的纯 HMR。

其余 8 项未通过：uni-app x VDOM Android/iOS 各两项在增量后出现 `App Launch`；Harmony VDOM 两项明确记录 `热更新失败` 并开始重新构建；Vapor 两项为上述初始截图歧义。截图工具修复不改变这些原始结果，也不证明 Harmony 热更新已恢复。全端入口在视觉阶段失败后终止，后续专项未执行。设备资源和本任务进程已释放，测试临时源码已恢复。

恢复新的完整设备验收仍需重新进行环境预检。当前记录保持 `partial`，不以旧失败截图的离线重放替代真实设备复验。

## 规则评估

不新增 AGENTS 规则；将具体失败固化为识别器回归，保留完整失败报告和既有设备验收标准。
