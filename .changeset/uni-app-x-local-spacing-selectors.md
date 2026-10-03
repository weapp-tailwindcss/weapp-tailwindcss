---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复 uni-app x 局部样式将 `space-x`、`space-y` 替换为局部类名后，对应子元素间距规则被错误过滤的问题。统一作者样式与纯 `@apply` 生成结果的选择器归属判断，保留结构后代、条件规则及完整 `:is`、`:where` 分支，同时继续排除独立 utility 后代和仅在否定条件中出现的作者类名。
