---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复 uni-app x 小程序和 WebView 局部样式将 Tailwind 运行时变量误当作固定主题值的问题。保留 `--tw-leading` 等变量及其间接依赖的动态引用，使同节点、空值和条件覆盖继续生效；仅限制 preset 的变量静态化步骤，保持单位转换、其他兼容处理和原生 UVUE 静态降级契约。
