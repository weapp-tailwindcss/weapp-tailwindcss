---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c87c6181598da82b661968242314ebcf494bbc9c
regressions:
  - e2e/lynx-pixel-geometry.test.ts
  - e2e/lynx-pixel-evidence.test.ts
  - e2e/lynx-rspeedy.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - examples/react-lynx/src/components/CaseCard.test.ts
---

## 症状

Android 的 skew 用例只有 View 矩形证据，无法证明截图中的双轴倾斜是否实际生效。以前把矩形没有变化直接判为不支持，会把取证通道的盲点混入平台兼容性结论。

## 根因与纠正

核对固定 Lynx 4.0.1 实现：`getTransformValue()` 暴露 View 矩阵，而 skew 在 `UIGroup.beforeDraw` / `ViewInfo` 的 Canvas 绘制路径中执行。`getSkewX/Y()` 已经返回角度的正切值。给通用矩形测量手工补一个 CSS 矩阵并不能证明实际绘制，且会混淆 flatten 与普通 View 的路径。

保持 RN 与 Lynx 共享 catalog 的 `probe: geometry`，由 Lynx 专属 evidence strategy 统一决定组件捕获画布、原生采集、帧清单和严格验收。skew 捕获固定不透明父画布，原始采集只提交 `not-tested`；宿主解码 PNG，拟合实心蓝色主体的四边，验证左右边 `tan(6deg)`、上下边 `tan(3deg)`、中心、尺寸、面积和连续填充。Canvas 与顺序 CSS 矩阵的小于 0.6px 差异纳入固定容差，不根据设备结果调参。

完整但错误的效果判为不支持；缺主体、坏对照、透明画布、孔洞、裁切、缺图或无法解码均阻断取证。严格读取器重新计算 PNG 结论，拒绝沿用旧 geometry checkpoint 或篡改效果记录。`GeometryBounds` 注释明确 View 矩阵的边界。

## 验证

- 先复现新增像素几何回归的 12 项失败，再实现判定器。覆盖 1、2.625、3 倍像素密度的 CSS 与 Canvas 双轴形状，以及平移、缩放、旋转、单轴、反向、错误角度和无效图。
- `CI=1 pnpm e2e:lynx`：示例回归 82 项，根目录 Lynx 构建、编码、协议、像素与报告回归 118 项通过。
- 真实 `CaseCard` 子树与 encoder 输入 CSS 在 headless Chromium 中生成截图；三个像素密度下双轴效果通过，分别删除 utility、替换平移/旋转/缩放必须失败。合成图片与浏览器图片都不是原生设备验收证据。
- `CI=1 pnpm e2e:lynx:static:update`：限定 React Lynx 重新生成 118 项 static 证据，catalog hash 与结果未变，只有生成时间更新。随后执行不更新基线的验证。
- 本轮原生支持基线未更新。最终同一提交的 Android / iOS 原生 PNG、截图回执、bundle 身份和预期效果验证尚未完成，因此记录保持 `partial`。

## 适用边界

该像素判定器仅适用于固定 160×160 画布和 96×80 蓝色实心 skew 夹具，不作为通用图像识别器。共享 catalog 与 RN 原生基线不因 Lynx 取证策略变化而失效。历史报告可展示，不能替代当前严格验收所需的原始图片。

## 规则评估

不新增 AGENTS 规则。现有“原始证据、首次偏离、不得降低门禁”约束已覆盖此问题，补集中策略与可执行回归即可。
