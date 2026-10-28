---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复开启 `px2rpx` 时 CSS `var()` 回退长度中的 `px` 漏转换问题，嵌套回退值按配置倍率转换，同时保留变量名、变量引用关系、字符串和 URL。可通过 `transformVarFallbacks: false` 恢复跳过整段 `var()` 的旧行为。
