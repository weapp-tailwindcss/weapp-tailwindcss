---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
"@weapp-tailwindcss/lynx": patch
---

修复 Tailwind v4 的百分比透明度在 Lynx 原生端不生效的问题：将明确的 `opacity: 50%` 等声明转换为原生数字 `opacity: 0.5`，覆盖关键帧和条件规则，保留动态变量、其它属性的百分比及无效输入。普通 Web 输出保持原语义。
