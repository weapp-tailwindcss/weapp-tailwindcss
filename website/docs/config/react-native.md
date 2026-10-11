---
title: React Native / Expo 配置参考
description: React Native、Expo、Metro 与 @weapp-tailwindcss/react-native 的配置职责、输入模式和 manifest 运行模型。
keywords:
  - React Native
  - Expo
  - Metro
  - Babel
  - Tailwind CSS 4
  - NativeStyleManifest
  - sourceGlobs
  - HMR
---

# React Native / Expo 配置参考

本页逐项说明 `withWeappTailwindcss()` 的 Metro 配置。首次接入请先看 [React Native / Expo 快速开始](../quick-start/react-native-expo)。

## 支持基线

- `@weapp-tailwindcss/react-native` `0.2.5`
- Expo `>=54`
- React `>=19`
- React Native `>=0.81`
- Tailwind CSS `4.x`
- Node.js `>=22.12.0`

本包把 Tailwind CSS 编译为 React Native style manifest，不输出 Web CSS 或小程序样式，也不引入 NativeWind 或 `react-native-css` runtime。

## 最小配置

```js title="metro.config.js"
const { getDefaultConfig } = require('expo/metro-config')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  projectRoot: __dirname,
  input: './global.css',
  sourceGlobs: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
})
```

包装器会注册 CSS 扩展、virtual manifest module、Metro transformer 和文件监听。Expo 继续使用标准 `babel-preset-expo`，不需要再添加一套 Tailwind Babel 配置。

## 配置索引

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| [`projectRoot`](#projectroot) | `string` | `process.cwd()` | 应用根目录与依赖解析锚点 |
| [`input`](#input) | `string` | 无 | Tailwind CSS 入口文件 |
| [`css`](#css) | `string` | `''` | 直接输入待编译 CSS |
| [`manifest`](#manifest) | `NativeStyleManifest` | 无 | 直接使用预生成 manifest |
| [`classSet`](#classset) | `Iterable<string>` | 无 | 显式候选与静态转换契约 |
| [`sourceGlobs`](#sourceglobs) | `string[]` | 入口扫描 | Tailwind 源码扫描范围 |
| [`watchFiles`](#watchfiles) | `string[]` | `[]` | 额外 manifest 刷新依赖 |

`manifest`、`input`、`css` 是三种互斥的输入模式。实现优先级为 `manifest > input > css`，但业务配置应只选择一种，避免表面配置与实际生效来源不一致。推荐普通项目使用 `input`。

## 配置详情

### `projectRoot` {#projectroot}

**作用** 为 CSS 入口、扫描 glob、监听文件和临时 manifest 提供统一路径基准，同时让 Metro 从应用根解析 `react` 与 `react-native` 单例。

**使用场景** 单仓库可依赖默认值，但 Expo monorepo、workspace symlink 或从其他目录启动 Metro 时应显式传入。

**用法** 在 CommonJS Metro 配置中使用应用目录：

```js
projectRoot: __dirname
```

**注意事项** 配错根目录可能同时表现为入口找不到、监听不刷新或加载两份 React；不要只修其中一个症状。

### `input` {#input}

**作用** 指定 Tailwind CSS 4 入口。路径相对 `projectRoot` 解析，Metro 会生成 manifest 并监听该文件。

**使用场景** 这是应用项目的首选模式，适合使用 `@import "tailwindcss"`、`@source` 和主题变量的真实 CSS 入口。

**用法** 指向纯 CSS 文件：

```js
input: './global.css'
```

```css title="global.css"
@import "tailwindcss";
@source "./src/**/*.{js,jsx,ts,tsx}";
```

**注意事项** 不要同时传 `manifest`；后者优先并会跳过 `input` 的生成流程。

### `css` {#css}

**作用** 直接把 CSS 字符串交给原生样式编译器，不读取 Tailwind 入口文件。

**使用场景** 适合编译器测试、代码生成结果或已经在内存中取得 CSS 的自定义工具，不推荐普通 Expo 应用长期维护内联 CSS。

**用法** 直接提供可编译规则，并配套候选集合：

```js
css: '.text-red { color: #ef4444; }',
classSet: ['text-red'],
```

**注意事项** `input` 的优先级高于 `css`；同时配置时内联字符串不会生效。

### `manifest` {#manifest}

**作用** 直接注册已有 `NativeStyleManifest`，跳过 Tailwind 生成和 CSS 编译。

**使用场景** 适合构建前已经生成并校验 manifest、需要完全可复现输入，或由外部构建系统提供样式表的项目。

**用法** 导入符合当前 `version: 1` 结构的 manifest：

```js
const manifest = require('./native-style-manifest.json')
withWeappTailwindcss(config, { projectRoot: __dirname, manifest })
```

**注意事项** 它具有最高输入优先级。传入后 `input`、`css` 和它们的生成 warning 都不会参与当前注册项。

### `classSet` {#classset}

**作用** 提供明确的 Tailwind token 集合，供 CSS 编译、manifest 的 `classSet` 和 Babel 静态 `className` 转换共同使用。

**使用场景** CSS 字符串模式需要限定规则时，或生成器无法从源码静态发现某些完整候选时使用。

**用法** 只传完整、真实的候选：

```js
classSet: ['p-4', 'dark:bg-black', 'ios:pt-8', 'android:pt-6']
```

**注意事项** 不要传启发式片段或维护第二份与 `@source` 不同步的清单。使用 `input + sourceGlobs` 时优先修正扫描范围。

### `sourceGlobs` {#sourceglobs}

**作用** 指定 Tailwind 生成器扫描哪些 JS、TS 和 JSX/TSX 文件，并把 glob 的静态根目录加入 Metro 监听。

**使用场景** Expo Router、`src` 目录、workspace 共享组件或 CSS 入口中的 `@source` 无法完整描述运行项目时显式配置。

**用法** glob 相对 `projectRoot`：

```js
sourceGlobs: [
  './app/**/*.{js,jsx,ts,tsx}',
  './src/**/*.{js,jsx,ts,tsx}',
  './packages/ui/**/*.{js,jsx,ts,tsx}',
]
```

**注意事项** 动态拼接如 `` `bg-${color}-500` `` 仍无法被扫描；应枚举完整 token 或加入精确 `classSet`。

### `watchFiles` {#watchfiles}

**作用** 将候选扫描之外的文件或目录加入 manifest 刷新依赖。

**使用场景** 主题 JSON、设计 token、生成器输入或外部配置发生变化也应重新生成 manifest 时使用。

**用法** 路径相对 `projectRoot`，文件和目录都支持：

```js
watchFiles: ['./theme/tokens.json', './config/native-theme.ts']
```

**注意事项** `input` 和 `sourceGlobs` 的根目录已经自动监听，不要重复加入。watch 只触发重新生成，不会让未扫描文件自动产生候选。

## CSS、Babel 与运行模型

在工程中引入类型增强：

```ts title="native-env.d.ts"
import '@weapp-tailwindcss/react-native/env'
```

- 静态完整 `className` 编译为稳定的 `StyleSheet` lookup。
- 动态 class 使用 `tw(value)`，只解析 manifest 中存在的精确候选。
- `dark:`、`ios:`、`android:`、`native:` 根据 `Appearance` 与 `Platform.OS` 选择。
- 普通 inline `style` 覆盖 Tailwind；`!important` Tailwind 规则覆盖 inline style。
- 不支持的 CSS 声明进入 `manifest.warnings`，不会静默传给 `StyleSheet.create`。

自定义组件仍需自行接收并处理 `className` 与 `style`。不要注册 `@tailwindcss/vite` 或 `@tailwindcss/postcss` 生成第二份样式。

## 验证

- Metro 能加载入口并生成 manifest，代表性 token 同时出现在 `classSet` 和 `staticLookup`。
- 修改 `input`、源码或 `watchFiles` 后，HMR 刷新的 manifest 不再引用旧 style ID。
- CI 检查 `manifest.warnings` 并对每个不支持声明作出明确取舍。
- Expo Web 只用于 smoke test；Android 与 iOS 模拟器或真机都要验证布局、颜色模式、平台变体和 inline style 优先级。
