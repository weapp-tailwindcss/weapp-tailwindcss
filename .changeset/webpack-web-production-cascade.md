---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

Webpack 的 Web 样式在生产压缩前完成生成，已通过框架 CSS loader 的资产保留实际转换结果，不再插回转换前的注册表内容，避免基础样式晚于深色变体并覆盖其效果。清理生成样式时逐项处理混有业务规则的条件容器，保留业务规则及独立嵌套层的归属。
