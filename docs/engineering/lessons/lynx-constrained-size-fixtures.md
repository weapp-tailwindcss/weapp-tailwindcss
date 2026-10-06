---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c53b5029a729efe881e8763d6a6e1505dd3d7998
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - examples/react-lynx/src/compatibility/native-geometry.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# Lynx 尺寸限制必须由夹具实际触发

## 症状

[Android 运行 37356795751](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37356795751/job/111921134357) 已恢复上一轮的宽高比、size、sr-only、字号和字间距结果；盒模型、min/max 和 CSS variable 仍与历史支持基线不同。三项原始 probe/control 均约为 170.67×62.10，没有触及 max-height:240px。

## 根因与纠正

auto 宽高无法区分 content-box 与 border-box；过小内容也无法证明最大高度是否生效。两组改用相同的显式尺寸夹具：盒模型基础内容为 96×64，padding 为 8、border 为 2，control 外框应为 116×84，probe 外框应为 96×64；尺寸限制的基础内容为 40×300，应用 utility 后要求高度为 240。min-width 用例还必须实际扩大宽度，不能仅凭高度变化通过。

基础值使用 components 层中的单类选择器，避免复合选择器在 layer 降级后覆盖被测 utility。既有降级只保留层顺序，并未模拟完整 specificity；此修复不改变公共转换策略。

几何断言同时校验控制组和被测组，拒绝任意位移、错误限制或仅部分属性生效。原生 rem 会随屏幕适配，min-width 只验证其扩宽效果，不把浏览器默认 16px 当成本机 rem 标准。

## 验证

- 新增的 3 项组件回归和 6 项反例在旧实现失败；修复后定向示例回归通过。
- `CI=1 pnpm e2e:lynx:static:update` 限定 React Lynx 重生成 118 项静态证据，catalog hash 和结论不变。
- `CI=1 pnpm e2e:lynx --update=none` 验证真实 Rspeedy 构建、原生编码/解码、尺寸声明及报告校验。
- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx exec tsc --noEmit`、定向 ESLint、Stylelint 和规则检查。

测试过程中纠正了两个诊断表示假设：decoder 会重排规则，级联顺序应在 encoder 输入 CSS 中核验；零尺寸在解码文本中保留无单位的 0，不应强制写成 0px。

## 适用边界

此处完成夹具、断言与构建回归，原生支持基线未修改。双端模拟器的新运行仍须验证这些矩形；不能用静态编码代替设备验收。

## 规则评估

不新增 AGENTS 或公开包 change intent。本次只修改测试夹具与证据判断，以持久回归约束默认样式和被测属性的边界。
