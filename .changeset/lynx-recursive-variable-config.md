---
"@weapp-tailwindcss/lynx": minor
---

通过 ReactLynx 构建器公开的模板编码 hook，默认启用原生递归 CSS 变量解析，避免嵌套的 Tailwind utility 变量仍走单次占位符替换路径。保留用户显式页面配置和动态变量依赖，不改变目标 SDK；缺少宿主模板 API 时明确报错，同时保持 ESM 与 CJS 公共入口可用。

此变更收紧旧构建器支持范围：ReactLynx 构建插件至少需要 0.12.4 提供宿主模板 API，递归变量解析要求 Lynx runtime 3.6 以上；更旧的项目需要先升级。当前固定 4.0.1 原生矩阵仍需重新验收。
