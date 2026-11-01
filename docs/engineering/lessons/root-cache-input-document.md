---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f81df4aca83db6c2812792230898984615cb0cf1
regressions:
  - packages/postcss/test/root-cache-document.test.ts
  - packages/postcss/test/root-cache.test.ts
  - packages/postcss/test/handler-cache-preparation.test.ts
---

# Root 缓存不能遗漏完整来源文档

## 症状

同一个 handler 连续处理两个 CSS、文件名和 AST 坐标相同的 Root，仅完整来源文档不同。读取公开 `Input.document` 的纯自定义 stringifier 在第二次调用仍得到第一次缓存的 CSS，尽管输出节点的 Input 已重新绑定到本轮来源。

## 根因与纠正

PostCSS 8.5.32 的 `Input.document` 保存含有 CSS 的完整非 CSS 文档；未配置时默认等于 CSS。节点的 `positionBy`、`positionInside`、`rangeBy` 优先读取它。该字段不在 `Input.toJSON()` 中，因此既有 map 快照也没有间接覆盖它。

Root 快照原本只保存每个 Input 的 CSS、文件、BOM 与 map。命中判断可以接受不同的 document，随后在没有 map 的结果克隆分支直接复制旧 CSS，重新绑定 Input 无法补做已经跳过的序列化。

在 Input 快照中按值保存 document，匹配时比较该值。沿用现有来源分组、逐 Input 绑定和独立输出树，不改 handler、parser、map、消息缓存条件或容量。不可仅保留可变 Input 引用后比较其当前值，否则同一 Input 原地修改仍会漏检。

## 验证

本任务独立依赖、Node 24.22.1/pnpm 12.15.0，基于上述提交验证：

- 新增5项回归先4失败、1对照通过。三个真实 handler 用例分别复现不同 Input、同一 Input 原位变更、第二个 Input 单独变化时返回旧 CSS；另一个失败证明原值快照缺失。等价 document 的新 Input 缓存命中控制原本通过。
- `pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/root-cache-document.test.ts test/handler.root.test.ts test/handler.cache.test.ts test/handler-cache-preparation.test.ts test/user-stage-leading-source.test.ts test/handler-object-shapes.test.ts --update=none --coverage.enabled=false`：6文件25项通过。新结果与全新 handler 精确一致，并验证缓存命中、来源与输出隔离。
- `pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/root-cache.test.ts test/cache-identity.test.ts test/style-result-cache-capacity.test.ts --update=none --coverage.enabled=false`：3文件23项通过，保留其他来源字段、匿名 Input、多来源绑定、容量和消息边界。
- 两个修改的 TypeScript 文件显式 ESLint 通过。原配置 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 仍有2条作者阶段受保护接口错误，未改变检查参数。

原始4失败日志与修复后结果保存在本轮忽略的任务证据中；持久回归直接断言 CSS 和来源身份，不依赖日志或快照更新。

## 适用边界

本次只修复 Input.document 漏检。自定义 stringifier 的闭包状态、opaque parser、完整 Document 输入准备及占位还原/source map 的所有权设计仍独立未完成；本例使用仅依赖输入的纯 stringifier，不能据此宣称所有自定义回调都可缓存。未运行新的全端验收或正式性能基准，也不改变已有 RSS 失败结论。

## 规则评估

沿用现有来源身份和根因回归规则，不新增 AGENTS。输入节点重新绑定正确，不代表命中前缓存资格已完整；两者需要分别验证。
