---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

兼容 Tailwind CSS 4.3.4 使用 `margin-trim: block` 的变量初始化探针，继续支持旧版 `inline`，确保小程序中的默认变量不受浏览器能力检查限制。探针识别仍要求四项条件同时存在，并完整匹配属性和值，避免展开 `inline-start` 等其他条件或同名后缀的自定义属性分支。
