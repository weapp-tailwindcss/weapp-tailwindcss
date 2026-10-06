---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: cda077c3cc1e783d3bc876cdfc667be4048c900a
regressions:
  - examples/react-lynx/src/compatibility/flex-geometry.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-evidence.test.ts
---

## 症状

审查 Lynx 原生支持基线时，三个 flex 用例的“不支持”缺少有效布局对照。将实际 `CaseCard` 和 encoder 输入 CSS 放进标准浏览器，三项 probe/control 的尺寸及子节点局部位置仍完全相同。

## 根因与纠正

通用 slot 没有明确的 flex 父容器和竞争项，无法触发 grow、basis、order 或 shrink。通用判定又接受任意几何变化，使组合用例只生效一部分也能返回支持。先补回归，三个浏览器场景失败；固定新布局后，旧判定器仍错误接受删除 grow、wrap、shrink 的结果，13 项几何回归中 9 项失败。

改用 160×140 固定画布，两侧各 6px padding。grow/basis 与另一可扩张项竞争剩余空间；wrap/order 同时包含父级排序竞争及内部溢出换行。`flex: 1` 的零 basis 会掩盖同一节点的 shrink 效果，因此 shorthand 在外层扩张行消费，shrink 在内层拥挤行消费，分别以外层宽度和子项宽度取证。

实时采集与严格离线读取共用精确几何契约。固定控制布局失效返回 `not-tested` 并阻断；有效对照下缺少任何单项效果返回 `unsupported`。保留六份原始矩形，不用屏幕原点差异或某个属性成功代替完整效果。

## 验证

- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx test --update=none`：95 项通过，包含 13 项新几何回归。
- `CI=1 pnpm e2e:lynx`：示例 95 项、根目录 121 项通过，包括真实 Rspeedy 构建、TASM 解码及严格报告取证。
- 浏览器从实际 `CaseCard` 递归生成 HTML，读取实际 encoder CSS。三个完整效果通过；分别删除六个 utility token 都必须失败，且每次重建相同控制场景。所有 headless 浏览器均在 `finally` 释放。
- `CI=1 pnpm e2e:lynx:static:update`：限定 React Lynx 重生成 118 项，catalog hash 与样式结果不变，仅时间更新；随后不更新基线的完整 Lynx 定向回归通过。
- 类型、ESLint、Stylelint、规则和 diff 检查通过。最终提交的双端原生采样尚未完成，不更新原生支持基线，复盘保持 `partial`。

## 适用边界

固定数值只适用于这三个有显式竞争项的 Lynx 夹具，不是通用 flex 布局判定器。RN 与 Lynx 共享 catalog 的 className 和 hash 保持不变；浏览器校准证明场景可触发，不能替代新提交的原生设备报告。

## 规则评估

不新增 AGENTS 规则。现有有效对照、原始证据及不得降低门槛要求足够；本次将约束落实到组件、测量契约和逐 utility 删除回归。
