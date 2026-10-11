---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e8214338888303dc57d9ee438af1b12f24e2fcf1
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - examples/react-lynx/src/compatibility/native-geometry.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# Lynx 尺寸与字体几何夹具的消费边界

## 症状

e82143388 的 [Android 模拟器运行 37354926422](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37354926422/job/111914804229) 已通过安装、运行及严格取证，但与历史支持结论不同。原始矩形明确显示 aspect 为 72×48、size-[44px] 为约 72×44、sr-only 为 72×40。字号、字间距与 control 的几何数据完全相同。

## 根因与纠正

通用夹具的 min-width:72px 和 min-height:40px 用于可见展示，却覆盖了尺寸测试的目标。aspect 自己声明 width:64px 仍被最小宽度限制；44px 和 1px 也无法成立。这是测量前的夹具约束错误，不能归因为引擎不支持或降低几何断言。

三类精确尺寸用例为 probe/control 对称清除通用最小宽高并使用 border-box，保持实际被测 utility 与 control 的差别。其它用例的默认尺寸不变。aspect 保留原来的 64px 宽度和 4:3 断言。

字号和字间距的 class 原先绑定 view；真实 bundle 关闭 CSS 继承，子 text 还有自身字体设置。沿用文字像素用例的消费边界，将这两组 class 交给 text。两侧夹具同时采用横向 flex，使被测文字的宽度变化可通过后续子节点偏移观测；不能依赖无关的左右列原点差异。

## 验证

2 项组件回归在旧实现上确认文字 class 未到达 text；5 项真实编码回归确认原产物没有解除尺寸限制或建立文字横向测量结构。修复后：

- `CI=1 pnpm e2e:lynx:static:update` 限定 React Lynx 重生成静态证据，118 项结论和 catalog hash 不变，仅更新时间变化。
- `CI=1 pnpm e2e:lynx --update=none`：示例 45 项、根目录 78 项，共 123 项通过，包含真实相关包/Rspeedy 构建、bundle 解码、静态对照与原始证据门禁。
- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx exec tsc --noEmit`。
- `CI=1 pnpm exec stylelint examples/react-lynx/src/global.css`：首次发现 24 处声明顺序/空行问题，限定该文件修正后通过；随后重新运行上述 123 项回归，static 对照仍通过。

编码测试仅将 decoder 的双花括号变量占位符还原为可解析的诊断语法；实际 bundle 和被测字面量不改写。它验证真实编译产物，不代替双端运行。

## 适用边界

旧 supported 结论曾受屏幕坐标假阳性污染；当前报告仍有 28 项与历史基线不同，需要逐项审查。box-sizing、grow、grid 等其它夹具以及像素用例仍需独立诊断。本次只修正有明确输入和原始测量证据的尺寸、文字消费问题，未刷新原生支持基线。最终双端模拟器仍需重新运行验证。

## 规则评估

不新增 AGENTS，不改变公开包行为。测试夹具的默认展示样式不能压过被测能力；用真实编码回归与原始几何证据约束该边界。
