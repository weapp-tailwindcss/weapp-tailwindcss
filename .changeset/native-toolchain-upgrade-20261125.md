---
weapp-tailwindcss: patch
"@weapp-tailwindcss/cli": patch
"@weapp-tailwindcss/native-darwin-arm64": patch
"@weapp-tailwindcss/native-darwin-x64": patch
"@weapp-tailwindcss/native-linux-arm64-gnu": patch
"@weapp-tailwindcss/native-linux-x64-gnu": patch
"@weapp-tailwindcss/native-linux-arm64-musl": patch
"@weapp-tailwindcss/native-linux-x64-musl": patch
"@weapp-tailwindcss/native-win32-arm64-msvc": patch
"@weapp-tailwindcss/native-win32-x64-msvc": patch
---

将原生解析器升级到 Oxc 0.160.0，并同步 N-API 依赖至 `napi` 3.16.3、`napi-derive` 3.7.2 和 `napi-build` 2.7.0。原生构建最低 Rust 版本提升至 1.98。
