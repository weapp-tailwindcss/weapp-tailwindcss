---
name: weapp-tailwindcss-react-native
description: 为 Expo/React Native 配置 @weapp-tailwindcss/react-native 0.2.5 的 Tailwind CSS 4 编译器、Metro virtual module、Babel JSX transform、style manifest、tw runtime、dark/ios/android/native variants。Use for Expo SDK 54+, React Native 0.81+, Metro, native className, Android/iOS style compilation；不用于 uni-app App、ReactLynx 或普通小程序构建。
---

# weapp-tailwindcss React Native

使用独立 Native 编译器把 Tailwind CSS 4 候选编译为 React Native style manifest，不套用小程序 CSS 产物链。

完整的 Metro 配置字段和 manifest 参考见站点的 [React Native / Expo 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-native)。

## 工作流

1. 确认项目是 Expo/React Native，而不是 uni-app App、Taro RN 或 App WebView。
2. ReactLynx/Rspeedy 项目转到 `$weapp-tailwindcss-lynx`；它保留 className 并生成原生 CSS，不使用 RN manifest。
3. 检查 Expo、React、React Native、Node 和 Tailwind CSS 版本。
4. 读取 [references/expo-integration.md](references/expo-integration.md)，建立 `global.css`、Metro 包装和类型入口。
5. Expo 默认只配置一次 `withWeappTailwindcss()`；它负责 source、manifest 和 Babel JSX transform，不维护第二份 class set。
6. 静态 `className` 走预生成 StyleSheet lookup；动态完整字符串才使用受控 `tw()`。
7. 检查 `manifest.warnings`，不把不支持的 CSS 声明当作成功。
8. Web 仅做 smoke test，最终在 Android/iOS 模拟器或真机验证布局、颜色模式和平台变体。

## 边界

- 不引入 NativeWind 或 `react-native-css` 运行时作为隐式依赖。
- 不注册 `@tailwindcss/vite` 或 `@tailwindcss/postcss` 生成第二份 Tailwind CSS。
- 普通 inline `style` 覆盖 Tailwind class；`!important` class 覆盖 inline style，测试时保留该优先级。
- 自定义组件需要接收 `className` 和 `style`；不要自动猜测第三方组件 prop 映射。
- `dark:`、`ios:`、`android:`、`native:` 由注入的环境选择，未支持的 CSS 以 warning 暴露。

## 输出要求

输出安装、完整 Metro/CSS/类型配置、支持边界、manifest warning 检查，以及 Android/iOS 验证步骤。
