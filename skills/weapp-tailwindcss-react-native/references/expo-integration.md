# Expo / React Native 接入

## 支持基线

- `@weapp-tailwindcss/react-native` 0.2.5。
- Expo SDK 54+、React 19、React Native 0.81+。
- Tailwind CSS 4。
- 业务项目按该包 manifest 使用 Node `>=22.12.0`；只有参与本 monorepo 开发时才遵守根 manifest 的更严格版本。
- ReactLynx/Rspeedy 使用 `$weapp-tailwindcss-lynx`，不共享 Metro、Babel transform、manifest 或 `tw()` runtime。

## 安装

```bash
pnpm add @weapp-tailwindcss/react-native
pnpm add -D tailwindcss
```

## CSS 入口

```css
@import "tailwindcss";
@source "./app/**/*.{js,jsx,ts,tsx}";
@source "./src/**/*.{js,jsx,ts,tsx}";
```

先检查项目真实目录。Expo Router 常见根级 `app/`，普通项目可能只有 `src/`；删除不存在的 glob，并让 CSS 的 `@source` 与 Metro 的 `sourceGlobs` 保持一致。

## Metro

```js
const { getDefaultConfig } = require('expo/metro-config')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  input: './global.css',
  sourceGlobs: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
})
```

保持标准 Expo Babel preset。包装器会把 source 扫描、manifest 和 JSX transform 接入现有 Metro transformer；非 Expo 或定制 Metro 才显式使用 `@weapp-tailwindcss/react-native/babel`。

## 类型与运行时

通过项目已被 `tsconfig.json` include 覆盖的声明文件启用 `className` 类型：

```ts
// native-env.d.ts
import '@weapp-tailwindcss/react-native/env'
```

自定义组件同时接收 `className` 与 `style`。

```ts
import { tw } from '@weapp-tailwindcss/react-native/runtime'

const style = tw(active ? 'bg-red-500' : 'bg-blue-500')
```

- 静态 `className` 编译为 StyleSheet lookup。
- 动态完整 class 值使用 `tw()`。
- `Platform.OS` 与 `Appearance` 驱动 `ios:`、`android:`、`native:`、`dark:`。
- inline style 默认覆盖 Tailwind；`!important` Tailwind rule 覆盖 inline style。

## Manifest 验证

检查 `version`、`classSet`、`rules`、`styleSheet`、`staticLookup`、`variables` 和 `warnings`。不支持的 CSS 必须产生 warning，而不是静默输出错误 style。

应用或 CI 可以直接调用公开生成 API，不需要读取 Metro 临时目录：

```js
// scripts/check-native-manifest.mjs
import process from 'node:process'
import { resolve } from 'node:path'
import { generateNativeStylesheet } from '@weapp-tailwindcss/react-native'

const projectRoot = process.cwd()
const manifest = await generateNativeStylesheet({
  projectRoot,
  cssEntries: [resolve(projectRoot, 'global.css')],
  sourceGlobs: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
})

if (manifest.warnings.length) {
  console.error(manifest.warnings)
  process.exitCode = 1
}
```

脚本中的 glob 同样按真实目录删减。除 `warnings` 外，再断言代表性 class 存在于 `classSet` 和 `staticLookup`。

首版覆盖常用 layout、flex、spacing、sizing、colors、typography、border、radius、opacity、transform、shadow 和 arbitrary values；浏览器 preflight 默认忽略。

## 验收

1. 静态和动态 class。
2. inline style 与 `!important` 优先级。
3. light/dark。
4. `ios:`、`android:`、`native:`。
5. `manifest.warnings`。
6. Android/iOS 模拟器或真机；Expo Web 仅做 smoke test。
