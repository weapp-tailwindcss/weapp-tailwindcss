---
"@weapp-tailwindcss/env": patch
"weapp-tailwindcss": patch
---

修复带行注释或块注释的 Uni manifest 无法识别 uni-app x 的问题，保留严格 package.json 与损坏文件回退行为。Refs #1299。
