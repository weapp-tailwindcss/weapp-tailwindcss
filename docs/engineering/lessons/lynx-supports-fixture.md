---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 4417a0601e1ff0e31b5741db5431660a6d27aa64
regressions:
  - examples/react-lynx/src/compatibility/grid-geometry.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-reports.test.ts
  - e2e/lynx-evidence.test.ts
---

## 症状

`supports-[display:grid]:grid` 生成了正确的条件规则，但普通单列 view 没有能区分 grid 与默认布局的探针。原生截图相同不能直接说明 SDK 不支持 `@supports`。

## 根因与纠正

固定 Lynx 4.0.1 存在 SupportsEvaluator，encoder 输入也保留 SupportsRule。首次偏离在测试场景及取证方式：标准浏览器中，实际 CaseCard 的子项横向偏移只有默认 padding 的 8px，新回归要求的第二列 44px 无法出现。

复用 grid 夹具，显式两列轨道和第二个被测子项。有效条件使子项进入第二列；对照消费 `supports-[display:weapp-invalid]:grid`，必须保持默认 flex 纵向布局。无效条件被意外展平时，对照几何失效并阻断，不能因为出现某个像素差异就宣称支持。

保持共享 catalog 不变，由 Lynx evidence strategy 切换为六矩形取证。实时采集、报告读取和基线更新共用同一个几何契约。旧的 pixel checkpoint 不满足新门禁；像素单测的合成 fixture 同步到当前策略，不改写历史原生报告。

## 验证

- 旧 CaseCard 在真实 encoder CSS 下先失败；修复后真实场景通过。删除条件 utility 必须返回不支持；强制让无效条件变成 grid 必须返回 `not-tested`。
- TASM 规则树同时保留 `display:grid` 和 `display:weapp-invalid` 的 SupportsRule 及各自 selector，防止仅有普通 display 声明的伪覆盖。
- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx test --update=none`：100 项通过。根目录 Lynx 回归按构建/编码 21 项与其余协议/像素 103 项执行，合计 124 项通过。
- `CI=1 pnpm e2e:lynx:static:update`：限定 React Lynx 的 118 项 static 结果与 catalog hash 不变，仅生成时间更新；随后不更新验证通过。
- 严格报告回归拒绝旧截图 checkpoint 及无效条件的错误两列几何；类型、ESLint、Stylelint、规则与 diff 检查通过。

## 适用边界

浏览器只证明夹具与 utility 语义有效，不代替固定 SDK 的双端原生验收。此提交尚待原生报告，支持基线不变，复盘保持 `partial`。无效条件对照属于验收场景，不向用户产物注入测试 CSS。

## 规则评估

现有真实对照和原始证据要求足够，不增加根规则；通过可观察的布局、真/假条件及严格报告回归落实。
