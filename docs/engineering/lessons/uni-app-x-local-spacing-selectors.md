---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 6d2eb5064f9ffb35429e551a7b57309bd05bc5e4
regressions:
  - packages/postcss/test/author-selector.test.ts
  - packages/postcss/test/uni-app-x-author-apply.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/local-spacing.test.ts
---

# 局部间距样式必须保留作者选择器的结构展开

## 症状

Alpha `5.31.2026093020-alpha` 的 uni-app x 微信 watch 产物中，新增模板 `space-y-2.5` 已替换为 `wtu-1m1136v-1`，但页面 WXSS 没有该别名对应的规则。全局样式仍有原始 `space-y-2_d5 > view + view`，字体别名也正常输出。这表示模板候选和生成引擎已经更新，不能归因于 watch 未发现文件变更。

证据为本轮 `e2e/.artifacts/uni-app-x-alpha/d238a3c8-3e5e-4e35-9af2-1d6b2e183474/watch-first-mutation/` 中保存的源文件、WXML、页面及全局 WXSS。持久回归不依赖这份忽略的产物目录或特定别名。

## 根因与纠正

`retainUniAppXAuthorApplyCss` 调用的作者选择器匹配器仅检查最右侧 compound。`@apply space-y-2.5` 将 `.local` 展开为 `.local > view + view` 后，最右侧只剩元素选择器，因而整条规则被删除。生成管线的纯 `@apply` 过滤另有字符串前缀判断，对同一结构的处理还会随是否出现伪类或自定义属性而变化。

统一两层过滤所消费的 PostCSS 选择器匹配器。匹配完整作者选择器链的 AST token 与组合符，支持标签、属性和多段作者选择器附加状态或主题前缀。作者链可以位于当前元素或结构祖先位置，后续选择器只能继续约束结构；独立类名或 ID 后代不归属于该作者规则。Vue 已声明的同一作用域标识允许出现在结构子元素上。作者显式写出的 `:global(...)`、`:deep(...)` 按完整 token 匹配。

Tailwind CSS `4.3.3` 的 Web 输出还会把完整间距选择器放入 `:where(...)`。正向 `:is`、`:where` 必须每个分支均归属于作者；不能把 `:not(.local)`、`:has(.local)` 中的类名当成作者锚点，但已归属作者的结构后代可以附加这些条件。合并规则 `.local, .generated` 只保留作者分支及其声明，既不泄漏无关 utility，也不删除有效作者样式；Web 运行时变量收集同步采用保留分支。不根据 utility 名称、输出文件名或页面目录特判。

纯 `@apply` 过滤的 `preserveVariables` 契约必须先于普通分支裁剪：`.card, :root { --x: red }` 中的根变量可能由另一条作者规则消费，不能因 `.card` 命中就丢掉 `:root`。默认保留变量规则原有作用域，显式关闭 `preserveVariables` 时再按作者分支裁剪；普通合并规则不因此放宽。

## 验证

- 修复前，最小 matcher、两层过滤和真实 Tailwind/Vite 小程序链路共 4 项失败，均复现间距声明丢失；新增 Web 生成回归进一步确认 `:where` 包裹规则被丢弃。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/author-selector.test.ts test/uni-app-x-author-apply.test.ts test/tailwind-v4-user-css.test.ts --update=none`：3 文件、29 项通过，覆盖完整作者链、结构后代、混合列表、作用域身份、解析失败回退和运行时变量。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x/local-spacing.test.ts test/uni-app-x/author-apply.test.ts test/bundlers/shared/generator-css/user-css.test.ts test/bundlers/uni-app-x-web-runtime-cleanup.test.ts test/uni-app-x/vite.test.ts --update=none`：5 文件、79 项通过。
- 集成回归复用同一 Vite 插件实例，连续生成两组 `space-x`、`space-y` 和任意字体类，分别验证 Web 与小程序的当前模板别名和实际声明对应，且无关 `.flex` 不进入页面样式。未启动浏览器或设备。
- `pnpm --filter @weapp-tailwindcss/postcss build`、`pnpm --filter weapp-tailwindcss build`、ESLint、`git diff --check` 和 `pnpm agents:check` 已通过；`pnpm release status` 已确认中文 intent 覆盖 PostCSS 负责包及主包消费方。
- 后续独立审查补充跨作用域混合变量规则回归；`test/uni-app-x-author-apply.test.ts` 与 `test/tailwind-v4-user-css.test.ts` 共 25 项通过，主包生成过滤与两端局部 spacing 的 3 文件、12 项通过，并重新构建 PostCSS 包。
- 对应 uni-app x VDOM/Vapor demo 的 static 基线和真实 watch 仍由主任务整合后更新；这里不把定向生成链路通过写成真实 HMR 或全端验收通过。

## 适用边界

本次修复聚焦作者规则的结构展开。具有独立类名或 ID 的后代仍需更完整的来源信息才能证明归属，不通过放宽类名搜索来放行。保留预有的变量和原生平台过滤契约。

## 规则评估

不新增 AGENTS。既有“沿输入、转换、产物逐层找到首次偏离”及“CSS 变换由 PostCSS 包拥有”的要求足够，通过两层共享匹配器和真实生成回归落实。
