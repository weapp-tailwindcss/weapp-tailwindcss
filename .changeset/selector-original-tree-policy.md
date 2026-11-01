---
"@weapp-tailwindcss/postcss": patch
weapp-tailwindcss: patch
"@weapp-tailwindcss/native-darwin-arm64": patch
"@weapp-tailwindcss/native-darwin-x64": patch
"@weapp-tailwindcss/native-linux-arm64-gnu": patch
"@weapp-tailwindcss/native-linux-x64-gnu": patch
"@weapp-tailwindcss/native-linux-arm64-musl": patch
"@weapp-tailwindcss/native-linux-x64-musl": patch
"@weapp-tailwindcss/native-win32-arm64-msvc": patch
"@weapp-tailwindcss/native-win32-x64-msvc": patch
---

在原始选择器树上先完成平台分支裁剪，再执行原有转义、间距替换和 `:where` 展开，修复展开克隆遗留嵌套 RTL 与不支持伪类的问题。跳过已脱离当前树的后代，保留有效兄弟分支、单分支原始转义、展开顺序和 uni-app x 原有多分支拒绝资格。

同步 Rust 选择器内核及原生平台包固定版本组，保持真实 ABI 与 JavaScript 回退路径的裁剪结果一致；不改变原生加载优先级、支持范围或声明归一规则。
