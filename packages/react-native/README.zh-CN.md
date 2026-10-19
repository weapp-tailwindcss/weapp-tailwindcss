# @weapp-tailwindcss/react-native

> [English](./README.md) | 简体中文

面向 React Native 与 Expo 的 Tailwind CSS v4 编译器。它复用 `weapp-tailwindcss` 的源码扫描与候选生成，将 CSS 编译为可序列化的 React Native style manifest，不引入 NativeWind 或 `react-native-css` 运行时。

## 安装

```bash
pnpm add @weapp-tailwindcss/react-native tailwindcss
```

## Expo 与 Metro

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  input: './global.css',
  sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}'],
})
```

Metro 会扫描源码、生成精确候选集合和 manifest，并把 Babel JSX transform 接入现有 Expo transformer。无需维护第二份 `classNameSet`。

`withWeappTailwindcss` 支持 `projectRoot`、`input`、`css`、`manifest`、`classSet`、`sourceGlobs` 和 `watchFiles`。完整字段、manifest 结构和非 Expo Metro 用法见 [React Native / Expo 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-native)。

在 Android 与 iOS 上，Metro 集成会从应用 `projectRoot` 解析 `react` 和 `react-native`，避免 linked workspace 包把与原生二进制不一致的第二份 React Native runtime 打入 bundle。Web 端继续保留 Expo 原有的平台 resolver 行为。

## 运行模型

- 静态 `className` 编译为预生成的 StyleSheet lookup，不在 render 中调用 `tw()`。
- 动态 class 才通过 `tw(value)` 在运行时解析。
- 普通 inline `style` 覆盖 Tailwind class，`!important` class 覆盖 inline style。
- 不支持的 CSS 声明会记录在 manifest `warnings` 中，不会静默生成错误样式。
- 编译器只输出明确识别的 React Native style 属性；浏览器专属或未知声明不会透传到 `StyleSheet.create`。
- `dark:`、`ios:`、`android:`、`native:` 是原生条件变体；状态、响应式、结构等浏览器 selector 变体会明确报告为不支持，不会被错误地无条件应用。
- 静态 StyleSheet ID 在无关 class 增删和 CSS 值变化时保持稳定，Metro CSS HMR 不会让已有 Babel lookup 串到其他规则。

`tw()` 与 `getStaticStyle()` 返回 React Native 的 `StyleProp`，可以直接传给 View、Text、Image 的 style。返回值可能含已注册的 StyleSheet ID 或数组；需要读取具体属性时使用 `StyleSheet.flatten()`。`composeStyle()` 保留内联样式类型，包括 `false`、`null` 和嵌套数组。

无单位、百分比和 `em` 行高在 class 与内联样式完成级联后，按最终字号计算；倍率保存在规则元数据中，不写入静态 StyleSheet。字号来自父元素时，可通过 `tw(value, { fontSize })` 或 `getStaticStyle(ids, { fontSize })` 显式提供已知继承字号；字号未知时不会猜测平台默认值。自定义运行时接入可把 `StyleSheet.flatten` 作为 `setStyleSheetFactory` 的第二个参数，使已注册的内联样式也参与计算；Metro 会自动接入。

阴影使用现代 React Native `boxShadow` 数组，保留所有层的模糊、spread、颜色与 inset。宿主需要启用新架构并满足平台要求：Android 外阴影要求 Android 9+，内阴影要求 Android 10+。不支持的宿主可向 `compileNativeStylesheet()` 或 `generateNativeStylesheet()` 传入 `boxShadow: false`；相关声明会产生告警，不会静默降级为丢失层或 spread 的旧阴影属性。

阴影变量和颜色 modifier 在选中 class 与 `!important` 声明完成级联后计算，全透明占位层会被省略。`currentColor` 和省略颜色的阴影使用最终 class 或内联文字颜色；需要继承颜色时，可通过运行时环境的 `{ color }` 提供已知值。继承颜色未知时保留未解析状态，不猜测黑色。颜色函数会规范化为 React Native 与 React Native Web 都接受的写法。

## 公开入口

包提供 `compiler`、`tailwind`、`babel`、`metro`、`runtime` 与中性类型入口 `env`。非 Expo 或定制 Metro 场景可以显式组合这些入口。

没有安装可选 React Native peer 的纯 Node 工具应直接导入 `compiler`、`tailwind` 或 `metro`。根入口和 `runtime` 暴露原生 `StyleProp`，TypeScript 项目需要 React Native 类型。

## 边界

本包生成 React Native 样式清单，不输出 Web CSS 或小程序 WXSS，也不把 NativeWind 或浏览器 CSS 运行时引入应用。

## 文档

完整接入说明见 [React Native / Expo 指南](https://tw.weapp.dev/zh-cn/docs/quick-start/react-native-expo)。

仓库兼容性实验室在 Expo Web、Android、iOS 三端复用同一份 118 项 Tailwind catalog。运行 `pnpm e2e:react-native:all` 可执行完整三端门禁；也可分别运行 `pnpm e2e:react-native-compatibility`、`pnpm e2e:react-native:web`、`pnpm e2e:react-native:android` 和 `pnpm e2e:react-native:ios` 复现静态、运行时、截图以及独立的 TSX/CSS HMR 门禁。只有明确要刷新静态证据时才运行 `pnpm e2e:react-native:update`。
