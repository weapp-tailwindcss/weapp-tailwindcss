---
name: weapp-tailwindcss-setup
description: 为新项目配置当前 weapp-tailwindcss v5 与 Tailwind CSS 4，覆盖 uni-app、uni-app x、Taro、Mpx、原生小程序、weapp-vite、Vite、Webpack 5、Rspack、Gulp、独立 CLI 及小程序/H5/Web/App 多端。Use when setting up, installing, integrating, choosing a framework configuration, or building CSS with `weapp-tw`; 不用于旧版迁移、故障诊断、自研构建器、Expo React Native 或 ReactLynx。
---

# weapp-tailwindcss setup

基于用户真实项目生成最小、可复制、可验证的接入配置。

## 工作流

1. 读取项目的 `package.json`、Tailwind CSS 入口、框架配置和实际运行脚本。
2. 确认框架、构建器、目标端、包版本、Node 版本；HBuilderX 项目同时确认 IDE 版本。
3. 读取 [references/framework-matrix.md](references/framework-matrix.md)，选择唯一匹配的注册位置和入口模式。
4. 如果用户只需要单个 CSS 入口、stdin/stdout 或 canonicalize，选择独立 CLI；完整小程序项目继续使用 bundler 集成。
5. bundler 项目先建立 Tailwind CSS 4 纯 CSS 入口，再让框架实际引入该入口，最后配置绝对路径 `cssEntries`。
6. 只注册一次 `WeappTailwindcss`。保留业务 PostCSS 插件，但不要在同一次受管构建中再注册 Tailwind 官方生成插件。
7. 多端项目保留 H5/Web 链路，让插件自动选择目标；只有明确完全跳过插件的独立目标才使用 `disabled`。
8. 运行开发态和目标端构建，用新增任意值 class 验证生成、转译与 HMR。

## 配置原则

- 当前包 manifest 的 Node engine 是 `^22.18.0 || >=24.11.0`；不要把旧的 `>=22.12.0` 文案当成当前精确约束。
- HBuilderX 使用当前依赖时至少为 5.11，并用绝对路径避免 IDE 改变 `process.cwd()` 的影响。
- Tailwind CSS 入口不要直接放在 Sass/Less/Stylus 文件中。
- 扫描只覆盖业务源码，默认排除 `node_modules`、`dist`、`unpackage`；uni-app 还应避免无差别扫描 `uni_modules`。
- 普通业务项目优先使用官方 bundler 插件；只有自研构建器才转到 `$weapp-tailwindcss-custom-build`。
- Expo/React Native 转到 `$weapp-tailwindcss-react-native`，不要套用小程序 bundler 配置。
- ReactLynx/Rspeedy 转到 `$weapp-tailwindcss-lynx`，不要套用 React Native manifest 或小程序 class 转义。
- CLI 默认 `--target web`；`--target weapp` 只对生成 CSS 做小程序兼容转换，不处理模板、脚本或已有 WXSS。

## 输出要求

输出框架与目标端结论、安装命令、逐文件完整配置、运行命令、预期产物和回滚点。不要只给选项列表。
