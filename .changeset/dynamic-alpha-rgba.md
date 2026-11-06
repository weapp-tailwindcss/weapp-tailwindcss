---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

增加 `cssOptions.colorMixDynamicAlpha`，小程序默认使用 `'rgba'` 动态透明度兼容模式，保留不透明固定底色的完整变量权重与 fallback，贯通 Core 生成、转换及最终清理；可显式选择 `'strict'` 保持严格颜色语义；Web、Lynx、React Native 不应用该模式。

Refs #1332。
