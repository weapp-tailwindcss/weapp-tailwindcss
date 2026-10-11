---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1217
baseline: 2fc66317e6783fa085e5f8e631568ee93b67a57e
regressions:
  - packages/postcss/test/syntax-runtime-signature.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-affecting-signature.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-hmr-runtime-signature.unit.test.ts
  - packages/weapp-tailwindcss/test/compiler/runtime-snapshot.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
---

# CSS 运行时签名保留 token 边界

## 症状

主包的 CSS 运行时签名通过全局正则删除注释、标点两侧空白并压缩连续空格。
实际调用发现 `content: "a  b"` 与 `"a b"`、`"/* visible */"` 与空字符串、`.a :hover` 与 `.a:hover` 分别产生相同签名。
`hasFrameworkHmrRuntimeSourceChange` 对 `@theme { --font-label: "A  B" }` 改为 `"A B"` 返回 false。
这些是签名和 HMR 判断入口的复现证据，不代表已经观察到所有设备上的漏刷新现象。

## 根因与纠正

源码级替换没有区分字符串内容、选择器关系、注释和语法空白。将 CSS 签名生成迁入 PostCSS，使用 AST 结构表示声明、规则与 at-rule，保留值、选择器、参数和有意义的 raws。
单独保留 `*color` / `_color` 等由解析器放入 raws 的文本，以及注释分隔的 token；区分空块与无块 at-rule。只忽略结构缩进、末尾分号和独立注释节点。
解析失败时使用带类型标记的原文签名，不丢弃编辑中的内容。

主包继续负责运行时快照和缓存失效，未变化源码仍复用已有哈希。本次没有增加全局源码或 AST 缓存，也不修改 CSS 产物。

## 验证

- 新增的 6 个字符串、选择器和主题 HMR 回归在修改前全部失败。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：95 文件，897 通过，3 个既有跳过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-runtime-affecting-signature.unit.test.ts test/bundlers/vite-hmr-runtime-signature.unit.test.ts test/bundlers/vite-remembered-css-replay.unit.test.ts test/compiler test/ci/architecture-contract.test.ts --update=none`：28 文件，132 通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss build` 与 `CI=1 pnpm --filter weapp-tailwindcss build` 通过。
- 新增 `packages/postcss/test/syntax-runtime-signature.bench.ts`，可用 `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest bench test/syntax-runtime-signature.bench.ts --run` 复测。

独立微基准比较同一输入下旧正则与新 AST 签名的成本：预热各 20 次，交替采样 30 组，每组 10 次，取中位数。10 条规则、379 bytes 为 0.0019 ms / 0.0158 ms；1,000 条规则、41,779 bytes 为 0.172 ms / 1.372 ms。新实现更慢，属于纠正语义碰撞的局部成本，不能宣称整体 HMR 性能改善。实际框架 HMR 与峰值内存影响仍需独立测量，因此本记录保持 partial。

## 适用边界

签名保守保留字段内部排版，可能比旧实现多触发一次失效，不追求所有语义等价 CSS 的归一化。
本次不变更 demo、IDE 用例或 CSS 输出预期，不更新项目 static 基线；没有新增设备验收通过声明。

## 规则评估

不新增 AGENTS 规则。沿用样式语法由 PostCSS 拥有的规则，并将签名入口纳入可执行架构契约。
