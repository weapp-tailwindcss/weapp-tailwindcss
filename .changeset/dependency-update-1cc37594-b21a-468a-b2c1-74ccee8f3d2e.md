---
"@weapp-tailwindcss/css-compat": patch
"@weapp-tailwindcss/debug-uni-app-x": patch
"@weapp-tailwindcss/engine": patch
"@weapp-tailwindcss/lynx": patch
"@weapp-tailwindcss/postcss": patch
"@weapp-tailwindcss/postcss-calc": patch
"@weapp-tailwindcss/react-native": patch
"@weapp-tailwindcss/typography": patch
"@weapp-tailwindcss/ui": patch
tailwindcss-config: patch
weapp-style-injector: patch
weapp-tailwindcss: patch
wetw: patch
---

统一升级仓库、示例和模板的依赖版本，刷新锁文件并同步 pnpm 工具链；同时保留 Sass、Tailwind 生态及历史框架样例所需的兼容版本，并更新 Lynx、Storybook、Vite、PostCSS、Oxc、Playwright 等正式版依赖。website 为避免 Docusaurus peer 图产生重复上下文，继续固定 `postcss@8.5.32`，其余 workspace 使用 `postcss@8.5.33`。
