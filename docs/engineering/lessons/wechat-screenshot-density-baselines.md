---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/928
baseline: e1af8b2b4e600c50f02800e4184568cc12eb05d6
regressions:
  - e2e/issue-928-baseline.test.ts
  - e2e/issue-928-css-pixel-region.test.ts
  - e2e/issue-909-ide.test.ts
---

# 微信渐变截图按真实采样密度选择基线

## 症状

完整扩展流程前 39/57 阶段通过，第 40 阶段先因模拟器自适应 94% 的非整数采样失败。通过官方 UI 固定该完整项目路径的 100% 并匹配 iPhone 6/7/8 后，1920×1080 宿主得到 375×667 原图、375×603 视口。原 2x 基线来自 750×1334 原图、750×1206 视口；两者 CSS 对照区域均为 240×128，四块渐变均为 112×56。比较仍有 68 个差异像素，门槛为 `<10`。

## 根因与纠正

截图坐标归一化只保证比较同一 CSS 区域，不能使不同密度下的圆角抗锯齿相同。两份真实截图的运行时 JSON 逐字节一致，`wx.pixelRatio=2`，实际采样分别为 1 和 2。375/DPR2 和 390/DPR3 两次真实 1x 采集得到相同对照像素，说明不能按模拟机型或设备 DPR 选择基线。独立检查定位 68 个差异全部位于圆角，渐变内部没有超阈值差异。

初次恢复建议要求重新提供 2x 显示环境，只能满足旧单基线。用户明确要求同时支持 1920×1080 和 3840×2160 后，修复测试夹具的采样条件边界：用同一原图和运行时视口的宽度比例唯一选择已登记基线。1x 新增独立采集，2x 原文件逐字节保留；分辨率不作为选择键，4K 普通模式也可选择 1x。两处真实 v4 场景共用登记表。旧单路径调用保留为明确的 2x 条件。

保持 CSS 坐标采样、尺寸容差、全部颜色和结构断言、`pixelmatch threshold: 0.1`、最终差异像素 `<10`。不缩放当前图、不做自动对齐、不查找最相似基线、不回退其它密度；缺失、损坏、非整数或未登记密度直接失败。只有显式更新流程可写当前已登记密度，不能连带覆盖另一份。

## 验证

以下验证包含本次未提交改动；原基线 SHA 不代表已经包含修复。真实设备使用 macOS、Node 24.18.0、pnpm 12.9.1、DevTools Stable 2.02.2608080、基础库 3.10.3，模拟器 iPhone 6/7/8、100%。

- 首次保留 68 像素失败；选择实现后在缺少 1x 基线时，以 `CI=1 E2E_UPDATE_ISSUE_928_BASELINE=0 pnpm e2e:ide:issues-909-916-928 --update=none` 确认 ENOENT 失败，没有借用 2x。
- `CI=1 E2E_UPDATE_ISSUE_928_BASELINE=1 pnpm e2e:ide:issues-909-916-928 --update=none`：两个真实场景通过，限定生成 1x；原 2x SHA-256 仍为 `45c0f3d63c64c19aaeb5fdad550b5b46e38934185ccd6eb038b09f1c9110334b`。主代理审查两份图，布局和渐变内容一致，差异来自圆角栅格。
- 上述更新变量改为 `0`，保持 `CI=1`、`--update=none` 复验：两个真实场景通过，23.90 秒；两份回执均选择 1x、0 差异、未更新基线。
- 持久回归使用真实 1x/2x 视口原图执行同一个比较入口，覆盖唯一选择、旧 2x 调用、选中项错误而另一项匹配仍失败、缺失/损坏失败、仅更新当前项、9 像素通过/10 像素拒绝，以及颜色、位移和 CSS 尺寸负控制。原非整数采样与通用裁剪回归继续保留。
- `CI=1 E2E_UPDATE_ISSUE_928_BASELINE=0 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-928-baseline.test.ts e2e/issue-928-css-pixel-region.test.ts e2e/mini-program-screenshot.test.ts e2e/mini-program-full-screenshot.test.ts --update=none`：4 个文件、55 项通过，无跳过。
- 对 `taro-webpack-react-tailwindcss-v4` 限定执行 `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER=^taro-webpack-react-tailwindcss-v4$ pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts -u`：10 项通过，重新生成 14 份 static 快照，版本库中字节未变化；随后将 `-u` 改为 `--update=none` 复验，10 项通过，11.71 秒。
- 改动 TypeScript 文件 ESLint、`pnpm agents:check` 和 `git diff --check` 通过；规则检查为 61 份规则、331 份文档、943 条命令、0 错误。独立只读审查确认两份真实原图经同一入口匹配对应基线、门槛未降低。
- 原始日志和回执保存在 `e2e/.artifacts/full-validation-recovery/display-density-compatibility/`；完整流程旧失败保存在 `canonical-bc3b543e-d653-4ba5-bea2-ae302f5f09c9/`，未把旧失败改写为通过。

## 适用边界

新增 1x 原图来自本轮真实 1080p 宿主；2x 原图来自 2026-10-05 历史采集，已核对原图、运行时、几何、对照及两场景像素一致性。历史采集的准确提交和独立原执行日志缺失，已在持久 provenance 中说明；离线入口回归不能冒称本轮 3840×2160 显示环境已实际执行。源码及候选提交变化后仍须新建预检、原生 Chrome 证据和完整扩展流程。

本次仅修复 E2E 基线条件，不修改公开包、demo 或 CSS 生成，不新增公开包 change intent。对应 Taro static 产物已限定重新生成并禁更新复验。完整 57 阶段尚未通过，保留 `partial` 状态。

## 规则评估

不新增 AGENTS 硬规则。更新唯一多端手册和已有基线说明，保留登录态保护、完整性检查和原验收门槛。
