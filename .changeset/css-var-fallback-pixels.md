---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复开启 `px2rpx` 时 CSS `var()` 回退长度中的 `px` 漏转换问题，嵌套回退值按配置倍率转换，同时保留变量名、变量引用关系、字符串和 URL。可通过 `transformVarFallbacks: false` 恢复跳过整段 `var()` 的旧行为。

升级到已包含上游修复的 `postcss-pxtrans@1.1.0` 与 `postcss-rule-unit-converter@0.3.0` 正式版，无需额外安装临时依赖补丁。
