---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c53b5029a729efe881e8763d6a6e1505dd3d7998
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - e2e/lynx-rspeedy.test.ts
---

# Lynx 像素夹具默认值覆盖了被测样式

## 症状

[Android 运行 37356795751](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37356795751/job/111921134357) 中，线性渐变和阴影的 probe/control PNG 完全相同。实际图片分别显示灰阶渐变、5px 红色阴影，与 Tailwind utility 的目标不同。

## 根因与纠正

默认值使用 `.probe-fixture-<id> .compat-probe` 两个类，生成的 bg-linear-to-r 和 shadow-lg 只有一个类。layer 降级后仅顺序被保留，组件默认值因 specificity 更高而获胜。真实 CSS、TASM 和截图一致，不能因此认定 Tailwind 没有生成 utility，或原生引擎不支持该属性。

两组共同使用同一个单类默认样式，保留可见的灰阶渐变、红色阴影作为控制值。components 默认规则在 utilities 之前，不再用更高权重遮蔽被测声明。两组 DOM、文字、子节点和固定捕获画布相同。

背景尺寸用例原本使用已经铺满的无固有尺寸渐变，cover/no-repeat/center 可能没有可见变化。默认夹具改为 24×24 的平铺渐变并靠左上放置，让背景尺寸 utility 的覆盖具有可见条件；该组合的像素变化仍不能逐项证明三种属性各自完全支持。

## 验证

- 3 项新增组件回归在旧实现失败；修复后通过。
- `CI=1 pnpm e2e:lynx:static:update` 限定 React Lynx 更新，118 项静态结论和 catalog hash 不变。
- `CI=1 pnpm e2e:lynx --update=none`：示例 60 项与根目录 82 项，共 142 项通过，包含真实包/Rspeedy 构建和 bundle 解码。新增回归核对真正输入 encoder 的 CSS 规则权重边界与先后顺序。
- 定向 TypeScript、ESLint、Stylelint、规则和差异检查。

## 适用边界

此处只修复有直接产物和截图证据的默认样式干扰，没有改写原生支持基线。新模拟器 PNG 仍需验证。dark 的媒体条件、结构伪类的 Fiber 实现限制和其它像素用例应单独诊断，不能都归因于 specificity，也不能通过改普通 class 冒充原能力已生效。

## 规则评估

不新增 AGENTS，不改变公开包转换策略。通过同条件组件夹具、实际编码回归和原始图片约束测试可信度。
