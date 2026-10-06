---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复用户 PostCSS 插件先生成厂商前缀或动态变量声明后，透明十六进制颜色因误判已有回退而遗漏 rgba 兼容转换的问题。保留浏览器目标、显式开关与 preserve 配置，并避免声明去重跨过作者覆写或 shorthand 边界，保证最终渐变和颜色层叠一致。
