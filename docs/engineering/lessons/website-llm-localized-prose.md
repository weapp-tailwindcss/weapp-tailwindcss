---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 14bd2ee5d186586b6359caa2ca374db37e996b38
regressions:
  - website/scripts/seo-geo.test.mjs
---

# 本地化正文必须同时支持页面和 LLM 导出

## 症状

网站真实浏览器验收中，英文 LLM 资源检查发现 `/llms-full.txt` 含有中文。浏览器里的英文 Mpx 文档没有显示这段中文，原有文档文件的语言检查也通过。

## 根因与纠正

中英 Mpx 页面共用 `ExternalClassesReminder.mdx`。该片段导出 React 函数，根据运行时 locale 选择文本。`docusaurus-plugin-llms@0.6.1` 在移除 import 前展开 MDX 源文，既不执行函数也不计算条件分支，最终把两种语言、函数实现和未求值的参数一起写入文本资源。

提示只在这两页使用，因此改为各自本地化文档中的静态 admonition，删除无用组件。保留 `customAttributes` 配置说明、类值示例和文档链接。相对 Markdown 链接指向各语言自己的 issues 文档，不依赖运行时 locale。

回归直接使用当前 LLM 插件的 `processMarkdownFile` 处理真实文档，验证两种语言都保留提示、示例和链接，不泄漏函数实现，并要求英文结果不含中文。既有浏览器断言继续覆盖最终生成的完整资源，没有删除内容或放宽语言断言。

## 验证

macOS、Node 24.18.0、pnpm 12.9.1，基线上叠加本次修复：

- 新回归在修复前两项失败，修复后 `pnpm exec vitest run --project=@weapp-tailwindcss/website website/scripts/seo-geo.test.mjs --update=none` 的 10 项测试全部通过。
- `pnpm --filter @weapp-tailwindcss/website build` 重新生成中英文网站、独立 Markdown 和 LLM 产物，通过；英文 `llms-full.txt` 不再含中文。
- 在本轮独立 Wrangler 服务上，使用本地三浏览器命令限定 `English LLM assets` 用例，Chromium、Firefox、WebKit 共 3 项通过，保持 `CI=1`、headless 和禁止快照更新。

这份记录验证内容根因及定向修复；全站截图与完整扩展矩阵另行验收，不将定向结果视为全端通过。

## 适用边界

这是私有网站正文修复，不改变公开包行为，无需 change intent。没有新增 demo 或改变样式生成；网站静态产物已通过网站 build 重新生成。网站被忽略的截图基线属于本地验收资源，不能用缺失基线或自动更新结果代替比较。

## 规则评估

不新增 AGENTS。由真实导出器回归补齐纯源文件语言检查的盲区，继续保留最终资源的浏览器断言。
