---
"@weapp-tailwindcss/css-compat": patch
"@weapp-tailwindcss/debug-uni-app-x": patch
"@weapp-tailwindcss/engine": patch
"@weapp-tailwindcss/lynx": patch
"@weapp-tailwindcss/postcss": patch
"@weapp-tailwindcss/postcss-calc": patch
"@weapp-tailwindcss/react-native": patch
"@weapp-tailwindcss/ui": patch
weapp-tailwindcss: patch
wetw: patch
---

升级兼容范围内的编译、样式、测试和开发工具依赖，同步 catalog 与锁文件。

- 对齐 Babel 8、Oxc parser/types 和 PostCSS 的兼容版本，更新单位转换依赖。
- 将 Vitest、覆盖率与 UI 统一到 5.0.4，更新 Lynx、Storybook 及相关开发依赖。
- 保留需要补丁迁移或完整框架、IDE 与设备验证的版本组。

升级范围、模板兼容修正、审计结果和本地验证见 docs/engineering/lessons/dependency-upgrade-2026-10.md。
