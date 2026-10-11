<p align="center">
  <a href="https://tw.weapp.dev">
    <img src="./assets/logo.png" alt="weapp-tailwindcss logo" width="128">
  </a>
</p>

<h1 align="center">weapp-tailwindcss</h1>

<p align="center">
  <strong>Bring Tailwind CSS to every platform! 把 Tailwind CSS 的原子化开发体验带到全端！</strong>
</p>

<p align="center">
  简体中文 | <a href="./README_en.md">English</a>
</p>

<p align="center">
  <a href="https://tw.weapp.dev">官网</a> ·
  <a href="https://tw.weapp.dev/zh-cn/docs/intro">文档</a> ·
  <a href="https://tw.weapp.dev/zh-cn/docs/quick-start/install">快速开始</a> ·
  <a href="https://tw.weapp.dev/zh-cn/docs/tools/weapp-tw-cli">CLI</a> ·
  <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo">示例</a>
</p>

<p align="center">
  <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/stargazers"><img src="https://badgen.net/github/stars/weapp-tailwindcss/weapp-tailwindcss" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/weapp-tailwindcss"><img src="https://badgen.net/npm/dm/weapp-tailwindcss" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/weapp-tailwindcss"><img src="https://badgen.net/npm/license/weapp-tailwindcss" alt="license"></a>
  <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/workflows/ci.yml"><img src="https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://codecov.io/gh/weapp-tailwindcss/weapp-tailwindcss"><img src="https://codecov.io/gh/weapp-tailwindcss/weapp-tailwindcss/branch/main/graph/badge.svg?token=zn05qXYznt" alt="codecov"></a>
  <a href="https://deepwiki.com/weapp-tailwindcss/weapp-tailwindcss"><img src="https://deepwiki.com/badge.svg" alt="DeepWiki"></a>
</p>

## 项目定位

`weapp-tailwindcss` 是一套面向全端的 Tailwind CSS 工具链：用同一套原子化样式开发体验，覆盖 Web/H5、小程序、App WebView、React Native 和 Lynx。

核心包负责 Tailwind CSS v4 的 CSS 生成、类名转译、平台兼容和构建器生命周期集成；平台包与运行时包负责把这套能力延伸到不同的渲染器和应用框架。

它解决的是“同一套 Tailwind 输入，按目标端生成正确产物”的问题，而不是为每个平台维护一套互不相干的 class 规则。

## 支持范围

| 目标端 | 推荐入口 | 适用场景 |
| --- | --- | --- |
| Web / H5 | `weapp-tailwindcss/vite/web`（CSS-only）或 `weapp-tailwindcss/vite`、`/webpack`、`/rspack`、`/gulp`、Node API | 浏览器 CSS、H5 和普通 Web 构建 |
| 小程序 | 对应构建器入口，或 `@weapp-tailwindcss/cli --target weapp` | 微信、支付宝、抖音、QQ 等小程序 CSS |
| App WebView | `weapp-tailwindcss` 的框架集成 | uni-app、Taro 等框架的 App WebView 构建 |
| uni-app x | `weapp-tailwindcss/vite` | Android、iOS 与 HarmonyOS 原生应用构建 |
| React Native / Expo | `@weapp-tailwindcss/react-native` | Metro、Babel 和 React Native style manifest |
| ReactLynx / Rspeedy | `@weapp-tailwindcss/lynx` | Lynx 普通 CSS 与 Rspeedy 构建 |

当前主线维护 Tailwind CSS v4。平台集成会复用核心 generator，但各目标端仍需以真实运行时支持的 CSS 属性和选择器为准。

## 快速开始

### 1. 安装 Tailwind CSS 与核心包

```bash
pnpm add -D tailwindcss weapp-tailwindcss
```

### 2. 创建 CSS-first 入口

```css
@import "tailwindcss";

@source "./**/*.{html,js,ts,jsx,tsx,vue}";
@source not "../node_modules";
@source not "../dist";
```

入口文件必须被项目实际引入；`cssEntries` 只用于让生成器稳定识别 Tailwind 入口，不会替代 bundler 的模块图。

### 3. 注册构建器插件

以 Vite 为例，纯 Web 项目使用 CSS-only 入口：

```ts
import { defineConfig } from 'vite'
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'

export default defineConfig({
  plugins: [
    WeappTailwindcssWeb(),
  ],
})
```

`vite/web` 只处理 Tailwind CSS 生成、CSS transform、CSS HMR 和 Web CSS 收尾，不注册 JS/template 转译、框架扩展、分包或小程序 finalizer。`styleInjector` 默认关闭，只有显式配置时才启用 Web 适配器。SSR、library mode、`optimizeDeps`、`cssMinify` 和 sourcemap 继续由 Vite 管理；CSS 入口必须实际 import 到 Vite 模块图中。

需要同时支持小程序、框架扩展或多入口时，继续使用 `weapp-tailwindcss/vite` 主入口，并显式指定 `generator.target` 或 `platform`。无标记的 Generic Vite 项目会在 Vite 配置解析后自动复用 Web CSS-only profile。

Webpack、Rspack、Gulp、Taro、uni-app、Mpx 和原生小程序的完整配置见[框架接入指南](https://tw.weapp.dev/zh-cn/docs/quick-start/frameworks/uni-app-vite)。

## Canonical 模板

仓库内提供可独立安装和验证的最小模板：

- [uni-app + Vue 3](./templates/uni-app-tailwindcss-v4)
- [Taro + Vite + React](./templates/taro-vite-tailwindcss-v4)
- [weapp-vite 原生小程序](./templates/weapp-vite-tailwindcss-v4)

这些模板只使用 `weapp-tailwindcss` 生成 Tailwind CSS，不要再叠加 `@tailwindcss/postcss` 或 `@tailwindcss/vite`。完整的自动化支持范围见[支持矩阵](./website/docs/reference/support-matrix.md)。

## CLI

需要独立 CSS 构建、watch 或 canonicalize 时，安装 `@weapp-tailwindcss/cli`：

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss

# 默认生成 Web CSS
pnpm exec weapp-tw -i src/app.css -o dist/output.css

# 显式生成小程序兼容 CSS
pnpm exec weapp-tw -i src/app.css -o dist/app.wxss --target weapp
```

CLI 默认目标是 `web`，支持 stdin/stdout、watch、原生 watcher、`--poll`、minify、optimize、source map 和 `canonicalize`。`--target weapp` 是 CSS-only 转换：不会扫描或改写 WXML、JS、TS、JSX、TSX，也不会替代完整项目的构建器集成。

完整参数表见 [weapp-tw CLI 文档](https://tw.weapp.dev/zh-cn/docs/tools/weapp-tw-cli)。

## 选择正确的包

| 需求 | 包 |
| --- | --- |
| Tailwind CSS 生成、类名转译和构建器接入 | `weapp-tailwindcss` |
| 独立 CSS CLI、watch 和 canonicalize | `@weapp-tailwindcss/cli` |
| PostCSS AST、选择器兼容和 CSS 平台转换 | `@weapp-tailwindcss/postcss` |
| React Native / Expo 编译 | `@weapp-tailwindcss/react-native` |
| ReactLynx / Rspeedy 集成 | `@weapp-tailwindcss/lynx` |
| `twMerge`、`tv`、`cva` 等运行时 class 工具 | `@weapp-tailwindcss/runtime`、`@weapp-tailwindcss/merge`、`@weapp-tailwindcss/variants`、`@weapp-tailwindcss/cva` |
| Typography、主题过渡和跨端 UI | `@weapp-tailwindcss/typography`、`theme-transition`、`@weapp-tailwindcss/ui` |

## 重要边界

- Tailwind CSS v4 的生成由 `weapp-tailwindcss` 接管。小程序构建中不要同时注册 `tailwindcss`、`@tailwindcss/postcss` 或 `@tailwindcss/vite` 作为第二套生成器。
- JS/WXML 类名只转换 Tailwind generator 已确认生成的精确候选集合，不对普通业务字符串做启发式替换。
- 构建器集成通过 Vite、Webpack、Rspack、Gulp 等生命周期 API 维护源码、样式、依赖和 watch 关系，不靠后置扫描项目目录补状态。
- React Native、Lynx 和小程序的 CSS/样式能力并不等同于浏览器；不支持的属性、选择器和运行时能力应以目标端测试结果为准。

## 环境要求

- Node.js `^22.18.0 || >=24.11.0`
- Tailwind CSS `>=4.0.0`
- 使用 HBuilderX 的 `uni-app` / `uni-app x` 项目需要 HBuilderX `>=5.11`

## 文档与示例

- [官网](https://tw.weapp.dev)
- [安装与快速开始](https://tw.weapp.dev/zh-cn/docs/quick-start/install)
- [Tailwind CSS v4 指南](https://tw.weapp.dev/zh-cn/docs/tailwindcss/v4-reference)
- [框架接入](https://tw.weapp.dev/zh-cn/docs/quick-start/frameworks/uni-app-vite)
- [React Native / Expo](https://tw.weapp.dev/zh-cn/docs/quick-start/react-native-expo)
- [ReactLynx / Rspeedy](https://tw.weapp.dev/zh-cn/docs/quick-start/frameworks/lynx)
- [uni-app x 配置参考](https://tw.weapp.dev/zh-cn/docs/config/uni-app-x)
- [ReactLynx / Rspeedy 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-lynx)
- [React Native / Expo 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-native)
- [多端配置](https://tw.weapp.dev/zh-cn/docs/multi-platform)
- [API 参考](https://tw.weapp.dev/zh-cn/docs/api/interfaces/UserDefinedOptions)
- [官方 CLI](https://tw.weapp.dev/zh-cn/docs/tools/weapp-tw-cli)
- [框架示例](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo)
- [React Native 与 Lynx 示例](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/examples)
- [备用文档地址](https://ice-tw.netlify.app/)

## AI Skill

官方 Skill 已拆分为 1 个协调入口和接入、迁移、排障、运行时、自定义构建、React Native、ReactLynx 7 个专用工作流。推荐安装完整套件：

```bash
npx skills add sonofmagic/skills \
  --skill weapp-tailwindcss \
  --skill weapp-tailwindcss-setup \
  --skill weapp-tailwindcss-migrate \
  --skill weapp-tailwindcss-troubleshoot \
  --skill weapp-tailwindcss-runtime \
  --skill weapp-tailwindcss-custom-build \
  --skill weapp-tailwindcss-react-native \
  --skill weapp-tailwindcss-lynx \
  -y
```

旧的单 Skill 命令仍然可用：

```bash
npx skills add sonofmagic/skills --skill weapp-tailwindcss
```

更多说明见 [Skill 文档](https://tw.weapp.dev/zh-cn/docs/ai/basics/skill)。

## 参与贡献

欢迎提交可复现 issue、框架接入示例、文档改进、转译修复和测试用例。提交前请阅读仓库根目录的 `AGENTS.md` 与目标目录下最近的 `AGENTS.md`，并使用 `pnpm` 完成本地验证。

## License

[MIT](./LICENSE)

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=sonofmagic/weapp-tailwindcss&type=Date)](https://github.com/weapp-tailwindcss/weapp-tailwindcss)
