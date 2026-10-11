---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复小程序生成样式交给框架 PostCSS 前未转换通配选择器，导致 Taro 的复杂 group 变体样式丢失的问题。

在同一 PostCSS AST 中完成嵌套展开、选择器准备和裁剪，避免生成样式重复序列化及重建整棵 AST 的瞬时分配。
