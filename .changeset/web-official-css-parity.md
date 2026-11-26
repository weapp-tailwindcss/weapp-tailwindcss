---
weapp-tailwindcss: patch
'@weapp-tailwindcss/lynx': patch
---

纯 Web 的显式 Web target 保留 Tailwind CSS 官方 Web 产物语义，与 `@tailwindcss/vite` 和 `@tailwindcss/postcss` 对齐。环境或 preset 推断的 Web 构建以及 uni-app H5 继续保留上一版本的 CSS 兼容默认，避免 H5 产物携带 `@layer`；uni-app H5 仍可通过显式 `generator.webCompat: false` 选择官方产物，旧 WebView 的兼容降级仍可通过 `generator.webCompat` 配置。uni-app、Taro、HBuilderX、uni-app x preset 与 Lynx 适配器的默认行为保持不变。
