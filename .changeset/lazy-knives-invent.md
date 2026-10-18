---
"@weapp-tailwindcss/postcss": patch
---

修复 Lynx 动态颜色变量的级联安全分析，保留存在覆盖、条件或别名依赖的 var()，同时安全静态化稳定颜色。
