---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

修复小程序样式误删 -webkit-font-smoothing，导致 antialiased 与 subpixel-antialiased 字体平滑声明丢失的问题。新增 cssOptions.preserveWebkitProperties，支持追加需要保留的 WebKit 属性名，并保持默认保留项。Refs #1286
