# React Native + Expo

这是 `@weapp-tailwindcss/react-native` 的最小 Expo 示例，使用 Tailwind CSS v4 的 source 入口和 Metro virtual manifest。

```bash
pnpm --filter @weapp-tailwindcss/example-react-native-expo start
pnpm --filter @weapp-tailwindcss/example-react-native-expo android
pnpm --filter @weapp-tailwindcss/example-react-native-expo ios
```

示例中的 CSS 规则故意保持为 React Native 可映射的声明；不支持的 CSS 声明会由编译器报告 warning。

完整兼容性实验室复用 Lynx 的 118 项 Tailwind catalog，并提供以下仓库级入口：

```bash
pnpm e2e:react-native-compatibility
pnpm e2e:react-native:web
pnpm e2e:react-native:android
pnpm e2e:react-native:ios
pnpm e2e:react-native:all
pnpm e2e:react-native:update
```

三个运行时入口都会分别修改 TSX class 与 `global.css` 中的 Tailwind `@utility` 探针，并在 `finally` 中还原文件；报告和截图写入已忽略的 `e2e/.artifacts/react-native-*`。
