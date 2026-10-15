---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 14bd2ee5d186586b6359caa2ca374db37e996b38
regressions:
  - website/tests/framework-sidebar.spec.ts
---

# 侧栏图标验收应区分接入指南和配置参考

## 症状

网站功能验收中，框架侧栏图标测试持续得到 18 项，而旧断言要求 15 项，最终达到 60 秒测试预算。相同失败在原始尝试及两次重试中稳定复现。

## 根因与纠正

`sidebars/tutorial.ts` 中接入指南有 15 个框架项，后续新增的配置参考另有 uni-app x、ReactLynx、React Native 三项。旧测试标题为“每个接入项”，选择器却覆盖整个侧栏，没有区分两组的职责。

通过中英文栏目按钮定位实际分组，继续精确要求接入项为 15 个，新增配置参考为 3 个，并分别检查三条本地化配置链接。整侧栏仍要求 18 项，图标视觉几何检查从每种图标的首个实例扩大到全部 18 项，保留背景、尺寸和文字偏移断言。

只修正测试的范围与完整性，不删除合法配置入口，也不以宽松数量范围掩盖侧栏变化。

## 验证

macOS、Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，在候选网站的独立 Wrangler 服务上运行真实测试：

- 修复前，`renders framework logos` 因 15/18 差异失败；首次错误、重试及 trace 单独保留。
- 修复后限定同名场景，Chromium、Firefox、WebKit 的中英文共 6 项全部通过。
- 使用本轮 build 身份校验、`CI=1`、单 worker、显式 headless 和 `--update-snapshots=none`；未调整超时或像素阈值。

本项不代表完整网站功能、截图或本机扩展矩阵通过，后续仍需重新预检和完整验收。

## 适用边界

没有产品代码、文档内容或样式输出变化，不需要更新 static 基线或公开包 change intent。精确数量表达当前导航契约，新增或删除合法入口时应同时复核对应分组及实例图标。

## 规则评估

不新增 AGENTS。保留真实浏览器回归，按导航语义定位范围，并扩大既有实例检查。
