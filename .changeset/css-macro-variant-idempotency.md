---
"@weapp-tailwindcss/postcss": patch
---

修复普通样式与自定义 variant 共用外层条件注释时，重复准备 Tailwind CSS 4 来源会不断嵌套同一条件的问题。仅沿覆盖整个 variant 的单节点条件链识别已有条件，保留不同方向、不同表达式、多分支以及普通样式的外层注释。
