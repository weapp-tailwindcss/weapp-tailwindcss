---
weapp-tailwindcss: patch
---

保护仍在生成的 uni-app x 样式作用域，避免并发样式任务超过缓存容量时丢失生成结果；原生 `@apply` 缺少有效生成结果时显式报错。

Refs #1340
