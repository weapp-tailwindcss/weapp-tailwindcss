---
"@weapp-tailwindcss/env": patch
"weapp-tailwindcss": patch
---

将 Taro 的 Harmony Hybrid 识别为 WebView 平台，使生成器、框架样式策略和 Taro preset 一致保留 Web rem 单位，避免进入 Taro 自身转换前先转为 rpx 而导致不同来源的样式尺寸不一致。该平台别名仅属于 Taro，继续保留 Harmony 原生、小程序、显式 target 和通用单位转换配置的既有边界。
