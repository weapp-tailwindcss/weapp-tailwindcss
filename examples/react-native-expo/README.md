# React Native + Expo

这是 `@weapp-tailwindcss/react-native` 的最小 Expo 示例，使用 Tailwind CSS v4 的 source 入口和 Metro virtual manifest。

```bash
pnpm --filter @weapp-tailwindcss/example-react-native-expo start
pnpm --filter @weapp-tailwindcss/example-react-native-expo android
pnpm --filter @weapp-tailwindcss/example-react-native-expo ios
```

示例中的 CSS 规则故意保持为 React Native 可映射的声明；不支持的 CSS 声明会由编译器报告 warning。

兼容性实验室与 Lynx、CSS Web 和小程序复用 `@weapp-tailwindcss/test-catalog` 的候选与声明目录。React Native/Expo Web 的原生样式映射能力单独判断，不能将普通浏览器的 CSS 支持结论直接套用。

每项报告分别记录 Tailwind 原始 CSS 生成、原生完整编码、运行时样式、几何和截图像素。文字用例使用 `Text`，布局用例使用 `View`；每个可支持的候选与独立 inline style 参考节点同屏比较。条件变体还检查 light/dark 恢复、平台包含与排除、动态数组/对象、未知 token 和 inline/important 优先级。宿主重新读取每项截图与坐标，核对文件哈希并重算像素检查。

仓库级入口：

```bash
pnpm e2e:react-native-compatibility
pnpm e2e:react-native:web
pnpm e2e:react-native:android
pnpm e2e:react-native:ios
pnpm e2e:react-native:all
pnpm e2e:react-native:update
```

全端验收须先通过本轮多端环境预检与当前会话 computer use 门禁，再生成静态基线和运行设备。静态基线只证明生成与编码，运行时项目保持 `unverified`，不能代替设备验收。旧 schema v1 报告仅用于历史展示，fresh gate 会拒绝旧目录、旧依赖版本、缺图和预期支持退化为 unsupported 的结果。

`RN_WEB_BROWSER=chromium|firefox|webkit` 可选择 Expo Web 浏览器，默认 Chromium，均后台运行。每个运行时入口还会分别修改 TSX class 与 `global.css` 中的 Tailwind `@utility` 探针，并在 `finally` 中还原文件。报告、逐项截图和坐标写入已忽略的 `e2e/.artifacts/react-native-*`；显式设置 `RN_UPDATE_BASELINE=1` 时才将新 schema 报告写入 `e2e/react-native/reports/v2/`，保留旧历史文件。

原生 HMR 每轮保留完整的 37 项语义阶段和连续两帧验证。客户端累计等待预算仍为 120 秒；已认证的当前 run/revision 唯一用例，其宿主截图、坐标与像素采集时间单独记账，每项最多 10 秒，本轮总上限为登记阶段数乘以 10 秒。采集超过期限会取消本任务的截图命令并失败，旧回执、重复请求、空转和下一轮 HMR 不能重复抵扣。构建与启动仍按独立墙钟期限验证，宿主完成采集后缺少报告也会耗尽客户端预算。
