---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 327efe6f82f7f4b6983b7997607a4f83fde94a71
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-text-flow.test.ts
  - e2e/lynx-pixel-evidence.test.ts
---

## 症状

`align-middle whitespace-pre-wrap` 放在普通 view 上，夹具既没有行内对齐对象，也没有连续空格、换行和限宽长句。原来的六矩形只观察容器变化，无法证明两个文字流属性。新增组件回归首先在旧实现复现缺少行内标记。

## 根因与纠正

- 上区将普通 view 嵌入 text，按 Lynx 原生文本附件语义参与行内布局；显式基态为 top，被测类覆盖为 middle。`inline-view` 是 SDK 内部语义名称，不是 JSX 注册标签；不要用类型扩展掩盖错误元素。
- 下区由独立 text 消费空白 utility，包含双空格、硬换行和必须软换行的长句。基态显式 nowrap，避免 SDK 默认保留换行使被忽略的属性看似有效。
- 三帧分别记录 utility、无 utility 控制组和显式对照。reference 用 NBSP 与三个独立 text 手工排成 2/4/2 字，不依赖 SDK 自身实现 pre-wrap。因此已知属性限制可以留下完整证据并报告不支持。
- 先校验控制组首字、参考三行的字形、原点、行距、双空格和宽度条件，再独立比较标记位置与文字。审查提出 probe/reference 同步右移仍能通过；先复现该反例，再将参考首字绑定控制组首字，并逐字校验。横移、纵移均有持久负例。另复现同步使用不均匀单空格的假阳性，补充全部单空格 advance 一致性校验。
- 采集和验收共用三帧契约。原始报告只提交待判定状态，最终结论须从原始 PNG 重算；旧几何 checkpoint、缺帧、坏对照和伪造支持均拒绝。

## 验证

- `CI=1 pnpm e2e:lynx:static:update` 限定 React Lynx，118 项生成/编码结论和共享 catalog hash 不变，仅时间戳更新；之后运行 `CI=1 pnpm e2e:lynx` 不更新验收。
- 实际组件与 encoder 输入 CSS 在 DPR 1、2.625、3 及 serif、sans-serif、system-ui 下验证；分别删除两个 utility，以及错误替换为 normal、pre-line、pre、nowrap 均不能通过。
- 完整定向验收曾通过 116 个示例测试及 185 个构建/证据测试，无跳过；最后的单空格反例修复另验证受影响的像素算法、真实构建、像素报告和完整证据测试。
- 示例 TypeScript、变更文件 ESLint、Stylelint、`pnpm agents:check` 与 `git diff --check` 作为提交前检查。

## 适用边界

浏览器只证明夹具能够触发目标效果，不替代原生运行。新报告需 26 项几何证据和 63 张 PNG，原生支持基线尚未更新。固定 SDK 仍为 Lynx 4.0.1。

垂直对齐证明的是同一宿主上 utility 与显式 middle 声明一致，并相对 top 控制产生变化；没有声称从像素独立识别字体基线和 x-height。软换行对照限定本夹具的系统字体和尺寸，墨色边界不等于任意字体的排版 advance；参考条件失败时应保留截图排查字体环境，不调整阈值制造通过。缺少原始双端截图时不得冻结运行时结论。

## 规则评估

不新增 AGENTS 规则。真实消费节点、有效对照和缺证阻断已有要求，本次通过回归落实。
