---
"@weapp-tailwindcss/cli": patch
"@weapp-tailwindcss/cn": minor
"@weapp-tailwindcss/debug-uni-app-x": patch
"@weapp-tailwindcss/engine": patch
"@weapp-tailwindcss/init": patch
"@weapp-tailwindcss/lynx": patch
"@weapp-tailwindcss/postcss": patch
"@weapp-tailwindcss/postcss-calc": patch
"@weapp-tailwindcss/react-native": patch
"@weapp-tailwindcss/reset": patch
"@weapp-tailwindcss/ui": patch
"@weapp-tailwindcss/variants": minor
tailwindcss-injector: patch
theme-transition: patch
weapp-tailwindcss: patch
wetw: patch
---

升级依赖并完成配套迁移。

- `@weapp-tailwindcss/cn` 升级至 `cn@0.5.2`，最低 Node.js 版本调整为 22.12.0。
- `@weapp-tailwindcss/variants` 与 UI 消费链迁移至 `tailwind-variants@4.0.1`；空聚合统一返回空字符串，保留 `twMergeConfig` 并支持函数形式的 `twMerge`，同步公开类型和回归。
- Tailwind CSS 4 生成链升级至 4.3.4，保留 v3 兼容样例和独立平台转换边界。
- PostCSS 更新颜色解析和 preset-env；将 `autoprefixer: false` 的最小声明补丁迁移至 11.6.2。
- CLI、init 和主包同步 semver、local-pkg、OXC parser/walker 配套类型；Lynx、React Native、reset、injector、theme-transition 和 wetw 更新对应依赖解析。
- Vitest、coverage 与 UI 统一至 5.1.0；Taro 保留其配置要求的 ESLint 8.57.1。
- weapp-vite 7.8.0 对齐 devframe/agentic 1.3.0，迁移发行包行为契约；Nuxt 的 Nitro 路径补丁迁移至 2.13.6。
