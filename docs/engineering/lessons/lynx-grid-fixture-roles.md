---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 779c68a656332a62cab5dc239b756b0413f0e6ac
regressions:
  - examples/react-lynx/src/compatibility/grid-geometry.test.ts
  - examples/react-lynx/src/components/CaseCard.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-evidence.test.ts
---

# Lynx grid 用例的布局角色和逐项断言

## 症状

原生报告中 grid-template 有真实第二列布局，grid-placement、grid-auto 和 grid-justify-self 却未产生预期差异。代码检查发现三者仍使用通用 view 夹具，缺少外层 grid 或目标自身的 grid 容器。通用“任意几何变化即支持”还会在只有部分效果生效时产生假阳性。

## 根因与纠正

三个用例各自使用专属节点和固定像素轨道：placement 是外层三行三列的子项；auto 自身是无显式轨道的 grid；justify 同时是外层子项和内层容器。移除通用最小尺寸、padding、额外文字子项的干扰，两组使用相同结构和默认属性。默认规则保持单类权重，排在 utilities 前。

placement 在第一格放固定占位，显式 start-1 可以重叠；删除 start-1 后必须自动避让。只有默认 start-2 不足以验证此项，因为 span shorthand 会重置起点。auto 测量第二子项：140px 宽减去 4px 间距得到两列 68px，第二子项相对 x=72，min-content 行高 24px。justify 同时检查自身右移和内部子项居中。

六矩形协议不变，实时采样和离线验证共用精确断言。固定对照不满足条件时记录 not-tested 并阻断验收，不能据此把 utility 判为 unsupported。实际效果缺失继续失败，不修改原生支持基线。

## 验证

- 新增回归在旧实现出现 15 个失败，覆盖缺失角色、部分效果假阳性与失效对照。
- `CI=1 pnpm e2e:lynx --update=none`：示例 79 项、根目录集成 101 项通过，包含真实包和 Rspeedy 构建、TASM 解码和证据协议。
- 后台 Chromium 消费实际组件结构及送入 encoder 的 CSS，三个正例均满足精确几何。逐个删除九个 utility 后均拒绝支持结论，记录每次六矩形数据；浏览器在 finally 关闭。这只验证夹具的标准 CSS 语义。
- `CI=1 pnpm e2e:lynx:static:update` 显式重生成 React Lynx 基线；审查后只有生成时间改变，118 项结果和 catalog hash 均不变。随后上述集成验证通过。
- 示例 TypeScript、ESLint 和 Stylelint 通过。

## 适用边界

新夹具仍需最终提交的 Android/iOS 原生证据。此前两个 head 的原生 grid-template 成功只证明存在基础 grid 能力，不能证明新用例通过。不同版本、基础 grid 不满足对照、坐标缺失或输出未绑定本轮时仍阻断。

## 规则评估

不新增 AGENTS 规则。用真实布局角色、逐项反例及已有证据边界落实测试语义，不以更新支持基线消除错误。
