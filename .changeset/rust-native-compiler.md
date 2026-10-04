---
"weapp-tailwindcss": minor
"@weapp-tailwindcss/postcss": minor
---

将 WXML tokenize、JavaScript 完整字面量转换与运行时签名计算接入 Rust Node-API 内核，保留 JavaScript/Babel 兼容路径与公开 TypeScript API。原生与回退路径共享 UTF-16 位置、精确类名命中和条件测试保护语义，并支持显式关闭或要求原生内核的验证模式。

修复快速路径的模板正文边界与显式 class 上下文语义，避免模板正文中的括号被错误覆盖。原生转换实例按集合和转义映射的实际内容更新，原生不支持的语义直接交给 Babel。

PostCSS 接入 Rust 选择器与声明值计算，合并 Tailwind v4 变量及渐变 fallback 解析，并批量处理 uvue translate 参数。保留 PostCSS AST 与用户插件契约，修复原生包加载顺序和自定义映射原地更新的缓存边界。
