---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/commit/baf8a7320d49ca3c5ae936d0cb6fe6de11e5704b
baseline: 94c4d8d6b15fc2d85d4d22135f8de69cb8f9cfcd
regressions:
  - website/scripts/content-metadata.test.ts
  - website/scripts/generate-api-docs.test.mjs
---

# 网站类型声明必须反映内容插件的真实契约

## 症状

字体修复后的扩展类型检查首次报告 14 条诊断：Docusaurus 结构化数据 hook 看似未导出，API 文档生成器对可能的 WriterFunction 调用 `trim()`，Playwright 用例错误提取 Page 类型并使用不存在的设备字段、Document 方法参数。首次诊断保存于 `.tmp/website-typecheck-first.log`。

沿真实数据契约检查后发现运行时问题：官方文档更新时间被重复乘以 1000，2026 年的 JSON-LD 时间变成 `+058724`；零时间被丢弃，越界数值令 SSR 抛出 `RangeError`；文档和博客忽略已解析的图片资源路径；博客读取不存在的 metadata 字段，错误的自定义分类可能输出为 `[object Object]`。

## 根因与纠正

`website/env.d.ts` 在脚本作用域重新声明两个官方 client 模块，以手写子集遮蔽完整 API。Docusaurus 3.10.2 实际仍公开导出两个结构化数据 hook；错误来自本地影子类型。删除两段替代声明，保留官方公共入口，不转向内部导入或继续补手抄声明。

官方 `lastUpdatedAt` 使用毫秒，自定义文档 front matter 的数字日期此前使用秒。转换函数要求调用者明确单位，不按数字大小猜测；同时检查未知字段与无效日期，保留 epoch 零值。文档 JSON-LD 与 Open Graph 复用同一转换结果；博客更新时间消费官方字段，缺失时维持发布日期回退。

图片优先取内容插件的 `assets.image`，再回退 front matter 与站点默认图片。博客描述直接消费已包含 excerpt 回退的 `metadata.description`，文档关键词从 front matter 读取。自定义分类和语言在消费处通过 `in` 与 `typeof` 收窄，不把未知数据伪装成官方接口成员。

ts-morph 的通用结构允许 WriterFunction 写入，但已解析的 JSDoc 结构实际提供字符串。对 `getStructure().text` 做字符串收窄，保留完整标签原文优先及原有 comment 回退。不能直接改成只读 `getCommentText()`，否则 TypeScript 单独解析的 `@see` 符号或 URL 首段可能丢失；已有真实内存 Project 回归继续验证完整 URL。

Playwright 辅助函数直接使用官方 `Page` 类型，不从重载 `test()` 的第一个参数提取；设备描述不包含 `colorScheme`，移除原本值为 undefined 的字段。`Document.getAnimations()` 已包含文档动画，不传仅属于 Element 方法的 subtree 参数。

## 验证

- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/content-metadata.test.ts --update=none`：初次 6 项失败、1 项通过，实际 SSR 输出和异常保存于 `.tmp/website-metadata-before.log`；修复后 7 项通过。
- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run --update=none`：14 个文件、73 项测试通过，包含原字体压缩和 API 文档生成回归。
- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website typecheck`：通过。没有降低 TypeScript 检查等级或引入 any 绕过。
- 修改文件的 ESLint 检查通过。
- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website build`：完整依赖构建及中英文站点均通过，重新生成网站静态产物。读取两种语言的 `docs/intro.html` 与 `blog/2025/9/v4.3-release.html`，确认 JSON-LD 类型、已有日期和图片与 meta 一致；构建日志没有 CSS 压缩错误或 `Missing font size`。
- `pnpm agents:check`、`git diff --check`：通过。

回归通过官方 DocMetadata、PropBlogPostContent 与结构化数据 hook 返回类型构造数据，渲染真实本地 Metadata、StructuredData 组件。仅替换 Docusaurus 上下文与 Head/原主题外壳；不模拟被测日期函数。文档 JSON-LD 与 meta 精确验证毫秒/秒边界、零值与非法输入；博客用独立的官方 ImageObject/日期 fixture，比较实际 JSON-LD 与页面 meta，避免仅检查类型存在或自造字段。

## 适用边界

修复范围为 Docusaurus 3.10.2、当前 ts-morph 与 Playwright 契约下的私有网站，无公开包发布或 change intent。保持自定义数字日期的秒约定，新增来源应显式声明单位。当前构建配置的文档 metadata 没有非空 `lastUpdatedAt`，因此毫秒、零值和非法输入边界由真实组件 SSR fixture 验证；抽样 HTML 验证现有页面，不将字段缺省误报为边界覆盖。没有更改内容路由、可见正文或设备配置，也没有以单测替代浏览器、设备视觉验收。

## 规则评估

不新增 AGENTS 规则。使用官方类型、在数据消费边界验证自定义字段及真实 SSR 输出，落实既有根因与回归要求。全面流程将网站 typecheck 作为独立扩展质量步骤执行，避免只通过 Docusaurus 构建而遗漏类型契约错误。
