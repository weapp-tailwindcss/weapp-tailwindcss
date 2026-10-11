---
title: React Native / Expo
description: 使用 @weapp-tailwindcss/react-native 将 Tailwind CSS v4 编译为 React Native styles。
keywords:
  - React Native
  - Expo
  - Tailwind CSS v4
  - Metro
  - Babel
  - "@weapp-tailwindcss/react-native"
  - React 19
  - React Native 0.81
  - Expo SDK 54
  - Tailwind CSS
  - className
  - dark mode
---

# React Native / Expo

`@weapp-tailwindcss/react-native` 是独立的 React Native 编译器包。它复用 `weapp-tailwindcss` 的 Tailwind CSS v4 source 扫描和候选集合，将生成的原始 CSS 编译为内存中的 RN style manifest；运行时不依赖 NativeWind 或 `react-native-css`。

Metro 输入模式、manifest 字段和自定义 Metro 配置见 [React Native / Expo 配置参考](../config/react-native)。

## 安装

```bash
pnpm add @weapp-tailwindcss/react-native
pnpm add -D tailwindcss
```

首个版本面向 Expo SDK 54+、React 19、React Native 0.81+。项目仍然使用 `pnpm` 和仓库要求的 Node 版本。

## CSS 入口

```css title="global.css"
@import "tailwindcss";

@source "./src/**/*.{js,jsx,ts,tsx}";
```

## Metro 与 Babel

```js title="metro.config.js"
const { getDefaultConfig } = require('expo/metro-config')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  input: './global.css',
  sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}'],
})
```

```js title="babel.config.js"
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
```

Expo 只配置一次 Metro；它会把 source 扫描、manifest 生成和 Babel JSX transform 自动接起来，不再手写第二份 `classNameSet`。静态 `className="flex items-center"` 会编译为预生成的 StyleSheet lookup，不会在 render 中调用通用 `tw()`；动态 `className={condition ? "bg-red-500" : "bg-blue-500"}` 才会保留为受控的 `tw(...)` 调用。普通 inline `style` 覆盖 Tailwind class，`!important` class 覆盖 inline style。非 Expo 或定制 Metro 场景仍可显式使用 `@weapp-tailwindcss/react-native/babel`。

Android 与 iOS bundle 中的 `react`、`react-native` 会从应用 `projectRoot` 解析，避免 linked workspace 包带入与原生二进制不一致的第二份 React Native runtime。Web 端仍使用 Expo 原有的平台 resolver，不会绕过 `react-native-web` 映射。

## 运行时与边界

Metro virtual module 会把 manifest、`Platform.OS` 和 `Appearance` 颜色模式注入 runtime，因此 `dark:`、`ios:`、`android:`、`native:` 变体可以按当前环境选择规则。编译器覆盖常用 layout、flex、spacing、sizing、colors、typography、border、radius、opacity、transform、shadow 和 arbitrary values；浏览器 preflight 默认忽略。只有明确识别的 React Native style 属性会进入 manifest，不支持或未知的 CSS 声明会产生中文 warning，不会原样透传给 `StyleSheet.create`。

状态、响应式、结构等依赖浏览器 selector 的变体不会在 React Native 中降级为无条件样式，而是进入 warning。manifest 的静态 StyleSheet ID 由 class 与条件规则身份稳定生成，因此修改其他 class 或 CSS 值时，Metro HMR 不会让 Babel 的静态 lookup 指向错误样式。

类型增强从 `@weapp-tailwindcss/react-native/env` 引入；普通自定义组件只要接收 `className` 和 `style` 就可以复用同一套写法，不需要第三方组件 prop 映射。

```ts
import { tw } from '@weapp-tailwindcss/react-native/runtime'

const style = tw(condition ? 'bg-red-500' : 'bg-blue-500')
```

Tailwind 仍由 `weapp-tailwindcss` generator 生成，不要同时注册 `@tailwindcss/vite` 或 `@tailwindcss/postcss`。仓库内的 118 项兼容性实验室同时验证 Expo Web、Android 与 iOS；原生端需要完整运行时报告、系统截图、结构 marker 和 HMR 前后证据，Metro export 通过不能替代原生验收。

## 验证

在自己的 Expo 项目中运行 `package.json` 提供的开发或构建命令，然后确认：

- CSS 入口被 Metro 加载，静态 `className` 能命中生成的 StyleSheet lookup。
- `manifest.warnings` 中的 warning 已被检查，未知 CSS 不会被误认为 RN 样式。
- Expo Web 只作为 smoke test；Android 和 iOS 模拟器或真机都能正确渲染布局、颜色模式和平台变体。
- 修改 CSS 或源码后 HMR 能刷新 manifest，动态 class 仍只解析已生成的候选集合。
