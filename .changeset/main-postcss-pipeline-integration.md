---
"weapp-tailwindcss": minor
---

更新内部样式管线的消费方式。常规 Vite、Webpack 等插件集成、用户配置与 Core API 调用方式保持，普通用户无需迁移；底层 `@weapp-tailwindcss/postcss` 的公开管线 API 独立按 major 发布。

直接通过插件实例的 `options.styleHandler.getPipeline()` 扩展内部管线的调用方，需要改用 `await pipeline.process(input, options, after)` 执行；只有 `kind` 为 `flat` 时才能继续读取 `plugins`。
