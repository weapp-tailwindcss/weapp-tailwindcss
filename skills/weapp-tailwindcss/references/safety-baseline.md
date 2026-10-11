# 当前安全基线

仅在专用 skill 未安装时读取。

## 先收集

- 框架与构建器。
- 小程序、H5/Web、App WebView 或 React Native 目标。
- `weapp-tailwindcss`、Tailwind CSS、Node 和 HBuilderX 版本。
- Tailwind 入口文件、实际 import 位置、`cssEntries` 与 `@source`。

## 当前结论

- 当前主线仅维护 Tailwind CSS 4。
- 当前 `weapp-tailwindcss` manifest 要求 Node `^22.18.0 || >=24.11.0`。
- 当前 `@weapp-tailwindcss/cli` 为 5.x 独立包，`weapp-tw` 与 `weapp-tailwindcss` 是等价命令入口。
- Tailwind 入口使用纯 CSS，并通过框架真实入口进入构建图。
- `cssEntries` 使用绝对路径，且列出所有普通分包和独立分包入口。
- 同一次受管构建只由 `WeappTailwindcss` 生成 Tailwind CSS。
- H5/Web 通常保留插件，由 generator 自动选择 `web` target。
- JS class 只转换 `classNameSet` 精确命中的候选。
- CLI 默认生成 Web CSS；`--target weapp` 不等于完整小程序项目构建。
- ReactLynx 使用 `@weapp-tailwindcss/lynx`，不要套用 React Native manifest 或小程序 safe class 流程。

## 选择下一步

- 配置问题：安装并使用 `$weapp-tailwindcss-setup`。
- 升级问题：安装并使用 `$weapp-tailwindcss-migrate`。
- 故障：安装并使用 `$weapp-tailwindcss-troubleshoot`。
- 动态 class：安装并使用 `$weapp-tailwindcss-runtime`。
- 自研构建：安装并使用 `$weapp-tailwindcss-custom-build`。
- Expo：安装并使用 `$weapp-tailwindcss-react-native`。
- ReactLynx：安装并使用 `$weapp-tailwindcss-lynx`。
