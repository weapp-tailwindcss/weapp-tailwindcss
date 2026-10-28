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
tailwindcss-injector: patch
weapp-tailwindcss: patch
wetw: patch
---

更新公开包的直接依赖及配套开发工具链，保留 catalog 和 workspace 关系。React 18 UI 包的类型声明与现有运行时配对；React Native 包的开发构建使用 Babel 7 与 TypeScript 5.9.3，保持 Expo/Metro 既有配套。框架 peer 支持范围保持现有契约。

### @weapp-tailwindcss/css-compat

- 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。

### @weapp-tailwindcss/debug-uni-app-x

- 更新 `devDependencies` 的 `vite`：`7.2.7` → `7.3.7`。

### @weapp-tailwindcss/engine

- 更新 `dependencies` 的 `postcss`：`^8.5.30` → `^8.5.32`。

### @weapp-tailwindcss/lynx

- 更新 `devDependencies` 的 `@lynx-js/rspeedy`：`^0.18.1` → `^0.18.3`。

### @weapp-tailwindcss/postcss

- 更新 `dependencies` 的 `autoprefixer`：`^10.6.1` → `^10.6.2`。
- 更新 `dependencies` 的 `postcss`：`^8.5.30` → `^8.5.32`。
- 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。

### @weapp-tailwindcss/postcss-calc

- 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。
- 更新 `devDependencies` 的 `eslint`：`^10.12.0` → `^10.13.0`。
- 更新 `devDependencies` 的 `postcss`：`^8.5.30` → `^8.5.32`。

### @weapp-tailwindcss/react-native

- 更新 `dependencies` 的 `@babel/types`：`^8.0.6` → `^8.0.8`。
- 更新 `devDependencies` 的 `@babel/core`：`^8.0.7` → `^7.29.7`。
- 更新 `devDependencies` 的 `@types/react`：`^19.2.18` → `^19.3.0`。
- 更新 `devDependencies` 的 `react`：`^19.2.8` → `^19.3.1`。
- 更新 `devDependencies` 的 `typescript`：未声明 → `^5.9.3`。

### @weapp-tailwindcss/typography

- 更新 `dependencies` 的 `magic-string`：`^1.4.3` → `^1.4.5`。
- 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。

### @weapp-tailwindcss/ui

- 更新 `devDependencies` 的 `@storybook/addon-a11y`：`^10.6.2` → `^10.6.5`。
- 更新 `devDependencies` 的 `@storybook/react`：`^10.6.2` → `^10.6.5`。
- 更新 `devDependencies` 的 `@storybook/react-vite`：`^10.6.2` → `^10.6.5`。
- 更新 `devDependencies` 的 `@types/react`：`^19.2.18` → `^18.3.31`。
- 更新 `devDependencies` 的 `@types/react-dom`：`^19.2.5` → `^18.3.7`。
- 更新 `devDependencies` 的 `storybook`：`^10.6.2` → `^10.6.5`。
- 更新 `devDependencies` 的 `vite`：`^7.3.6` → `^7.3.7`。

### tailwindcss-config

- 更新 `dependencies` 的 `lilconfig`：`^3.1.3` → `^3.1.4`。

### tailwindcss-injector

- 更新 `dependencies` 的 `magic-string`：`^1.4.3` → `^1.4.5`。

### weapp-tailwindcss

- 更新 `dependencies` 的 `@babel/parser`：`^8.0.7` → `^8.0.8`。
- 更新 `dependencies` 的 `@babel/types`：`^8.0.6` → `^8.0.8`。
- 更新 `dependencies` 的 `@vue/compiler-dom`：`^3.5.41` → `^3.5.44`。
- 更新 `dependencies` 的 `magic-string`：`^1.4.3` → `^1.4.5`。
- 更新 `dependencies` 的 `oxc-parser`：`^0.154.0` → `^0.156.0`。
- 更新 `devDependencies` 的 `vite`：`^7.3.6` → `^7.3.7`。
- 更新 `devDependencies` 的 `webpack`：`5.105.4` → `5.112.2`。

### wetw

- 更新 `dependencies` 的 `@inquirer/prompts`：`^8.7.3` → `^8.7.5`。
