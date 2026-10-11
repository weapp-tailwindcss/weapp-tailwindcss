---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 8e2fb20fd87a7c435610982bb407130658452b44
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-uni-rule-removal.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-removed-rules.unit.test.ts
---

# uni-app Vite 监听验收的条件规则合同

## 症状

PR #1269 的 `8e2fb20fd` 在 macOS 微信监听任务中完成了新增源码后的构建，却在 `complex-corpus` 等待七分钟后失败：`[@supports(display:grid)]:grid` 没有对应 CSS 证据。首次失败位于断言层，不能仅凭外层的“产物未更新”提示判定监听失效。

## 根因与纠正

Tailwind v4 生成的小程序 CSS 会移除不支持的条件规则。监听工具已有显式负向合同，同时验证原始类名仍被消费、条件规则确实消失，以及其他 utility 的 CSS 仍存在；uni-app x 和 weapp-vite 已配置它。uni-app Vite 的主包模板、脚本与两个分包漏掉了配置，其四个平台派生用例继承同一缺口，仍要求被移除的规则存在。

修复将现有合同传入这些小程序用例及分包构造器，不删除语料，不根据缺失结果猜测预期，不改变等待时间或性能阈值。Web 继续使用独立的浏览器样式验收。

## 验证

`watch-hmr-uni-rule-removal.unit.test.ts` 使用真实 Tailwind v4 引擎生成原始和小程序 CSS，确认 `@supports` 从生成结果中移除后，再将结果交给实际监听断言。覆盖默认用例、微信、支付宝、QQ、抖音的主包模板、脚本、普通分包和独立分包，共 20 个场景。反向检查保留正常 utility CSS、原始消费 token 和“条件规则意外残留”三类失败。

修复前 20 个场景全部复现同类错误；修复后执行：

```bash
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-uni-rule-removal.unit.test.ts test/watch-hmr-removed-rules.unit.test.ts test/watch-hmr-coverage-matrix.unit.test.ts --update=none
```

结果为 3 文件、57 项通过。

## 适用边界

上述证据验证 uni-app Vite 小程序的断言合同修复；当前提交的远端监听任务和本地完整扩展验收仍须独立通过。其他项目不能仅凭 CSS 缺失套用此配置，必须核对各自平台与生成选项。

## 规则评估

现有规则已要求预期来自真实平台语义，继续由可执行回归守住边界，不新增根规则。后续新增平台派生用例时，应同时验证配置继承和实际生成结果。
