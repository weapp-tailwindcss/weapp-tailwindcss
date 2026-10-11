---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: dad822b606333e8674031a13d52e8227d939751e
regressions:
  - e2e/mini-program-full-screenshot.test.ts
  - e2e/mini-program-screenshot.test.ts
  - e2e/templates-ide-smoke.test.ts
---

# 模板截图证据与视口裁剪职责

## 症状

扩展流程前 26 个阶段通过，第 27 阶段 MPX 模板在截图裁剪时报「小程序截图尺寸与运行时屏幕比例不一致」。实际截图为 804×1428，运行时屏幕为 375×667；按宽度推算高度为 1430.048，超出原有 2 像素检查。模板已完成真实页面非零布局检查，截图本身可正常解码。

## 根因与纠正

稳定版微信开发者工具 2.02.2608080 先按模拟器 UI 比例缩放，再将截图矩形的左右上下边界向外取整到 DIP，最后通过 Electron 截屏。宿主显示器比例与模拟设备 DPR 不是同一概念。截图接口只返回图像，没有返回截图矩形、宿主 DPR 和 UI 缩放；从图像宽度推算统一比例会把宽轴取整误差传播到高度。

曾尝试将裁剪容差改为 `max(2, ceil(scale))`，但独立审查发现低 UI 缩放、高宿主 DPR 仍会超出此值，因此撤回。不能把一次定向通过作为任意容差正确的依据。

模板 smoke 只需要保留真实截图证据，没有裁剪图的像素对照消费者。新增原图捕获入口，校验运行时几何、截图协议结果和 PNG 解码，原样保存字节，并在 `.capture.json` 明确记录 `full-screen`、实际图像尺寸和当次运行时尺寸。模板继续检查精确路由、非零布局和零运行时错误。需要颜色/ROI 对照的视口接口保留原严格检查，两者不再混用。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/mini-program-screenshot.test.ts e2e/mini-program-full-screenshot.test.ts --update=none`：22 项通过，覆盖原图字节及首尾像素不变、804×1428 原始案例、无效运行时边界、缺失/空/损坏图片及 CRC、协议异常和无合成证据。
- 原视口接口对 804×1428 与 375×667 的不确定缩放继续拒绝，不放宽像素检查。
- 使用已有稳定版微信服务执行 `CI=1 pnpm e2e:templates:ide --update=none`：六套模板及矩阵合同共 7 项通过，0 失败、0 跳过，79.85 秒。全部重新安装/构建，六套均 runtime clean；截图与结构证据归档到 `e2e/.artifacts/template-ide-verification/2026-10-05-full-screenshot/`。
- 首次失败报告保存在 `e2e/.artifacts/full-regression/11b7b590-6cdd-4788-ac32-82bb337b897d/`。后续定向运行覆盖了通用目录里的模板截图，因此该目录现有图片不能充当首次失败原图。

## 适用边界

原图记录用于追溯真实画面，不证明跨端像素一致。微信截图缺少完整坐标元数据的问题仍存在，遇到需要精确裁剪的用例时不能自动切到原图以绕过断言。本次没有修改模板源码、构建产物或 static 基线。

## 规则评估

不新增 AGENTS 规则，以两个职责明确的 API 和持久回归固定边界；保留已有截图、结构及登录保护要求。
