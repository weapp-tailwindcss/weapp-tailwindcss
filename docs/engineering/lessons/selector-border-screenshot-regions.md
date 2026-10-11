---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - e2e/where-selector-pixels.test.ts
  - e2e/where-selector-ide.test.ts
---

# 选择器视觉断言的边框与背景区域

## 症状

DevTools 的 `where` 转译用例报告逗号选择器未生效，绿色背景像素正常，蓝色像素为零；本轮截图却清晰显示蓝色顶边。

## 根因与纠正

fixture 用 `8rpx solid #2563eb` 顶边证明逗号选择器命中。原实现将节点矩形向内缩四个截图像素，再同时统计背景和蓝色边框，恰好排除了待测属性。

背景使用内缩区域，顶边单独使用与 fixture 一致的 CSS 几何区域。先将 rpx 换算为页面 CSS 像素，再按截图和页面宽度缩放。保留原有大于 80 个蓝色像素的门槛，框外或内部蓝色不能替代缺失的顶边。

## 验证

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/where-selector-pixels.test.ts --update=none`：修复前 3 失败，修复后 3 通过，覆盖两种像素比和无顶边负例。
- `pnpm e2e:ide:where`：DevTools 2.02.2608070 真实复验通过，保留本轮截图、目标矩形和像素计数。
- 定向 ESLint 通过；fixture 与生成样式未修改，无需更新 static 基线。

## 适用边界

该采样器专用于当前 fixture 的背景与顶边证据，不将页面其他蓝色区域作为通过依据。原始错误及修复前后图片位于本轮 local-full-run 报告。

## 规则评估

不新增 AGENTS 规则，通过负例回归约束采样区域与目标样式的一致性。
