---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 357c3bf342f44cf3875f5d407fd630e21134fdf4
regressions:
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - e2e/lynx-pixel-evidence.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# Lynx 像素采样的稳定父画布

## 症状

[像素证据复盘](./lynx-pixel-evidence.md)确认截图编码不能证明样式生效。进一步沿采样链路发现，Android 边框用例的两图为 448×173 与 448×163；旋转动画两帧为 434×90 与 448×163。可见性、透明度用例直接截取元素自身，在旧报告中与 control 的像素相同，却因尺寸不同被判支持。

## 根因与纠正

采样目标是会被测试属性改变的节点本身。Android 对它调用 `View.draw()`，未经过父 view 的子节点合成过程；原先的窗口坐标裁剪还随目标变换改变边界，遇到 flatten 节点时又向上查找不同的祖先。两侧 48% 宽度也会在不同原点取整成相差一像素的宽度。图像内容、坐标系和绘制范围因而没有稳定的比较边界。

现在像素与交互采样使用明确的 `probe-container-*` / `control-container-*` 父画布。两侧采用相同大小、相同横向原点的固定容器，Android 声明 `flatten=false`，由平台在父容器中合成被测子节点。透明度、可见性、边框或旋转不再改变截图自身的大小；伪状态和 transition 样式仍注入原被测节点。

Android 仅接受指定容器的原生 view，缺失则返回未测，不再回退到其他祖先或整窗裁剪。iOS 检查 `drawViewHierarchyInRect` 的返回值，失败绘制不作为有效 PNG。Node 接收端仍独立验证实际图像尺寸、解码及可见差异，不因新配置而放宽门槛。

## 验证

新增原生报告回归在修改前 3 项失败；修改后覆盖静态属性采集父画布、动画/transition 全程固定目标且只变更被测节点，以及画布缺失不回退。命令：`CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx test --update=none`。

示例布局修改后限定执行 `CI=1 pnpm e2e:lynx:static:update`，重新构建相关包及 ReactLynx bundle。审查 `examples/react-lynx/src/compatibility/static-evidence.json`：118 项 CSS AST/encoder 结论不变，只有生成时间更新；用不更新模式重新验证。

## 适用边界

编译与 JS 采样契约回归不能替代原生屏幕证据。需在修改后的双端 host 重新采集、审查固定画布、属性消费和逐 case 结果，再显式更新兼容基线。本轮保留原生基线，未将旧 supported/unsupported 结论改写为新验收结果。

固定画布不单独证明 PNG 属于本轮，截图写入回执、残留文件和报告绑定还需约束。几何用例与具体 CSS 功能支持也不由本次像素采样修复证明。

## 规则评估

不新增 AGENTS 规则。以稳定采样边界、真实失败回归和独立 PNG 校验落实已有证据要求。
