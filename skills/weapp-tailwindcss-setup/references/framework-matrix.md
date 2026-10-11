# 框架接入矩阵

## 通用 Tailwind CSS 4 入口

入口必须是纯 CSS，并由业务入口实际引入。推荐关闭默认自动扫描后显式声明 source：

```css
@import "tailwindcss" source(none);
@source "../src";
@source not "../src/uni_modules";
@source not "../node_modules";
@source not "../dist";
@source not "../unpackage";
```

`cssEntries` 指向该文件的绝对路径。它让插件读取 `@source`、`@config` 和 Tailwind 指令，但不会替代 `import './app.css'` 或框架全局样式导入。

## 选择表

| 项目 | 注册入口 | 关键点 |
| --- | --- | --- |
| uni-app CLI Vue3 Vite | `vite.config.ts`，位于 `uni()` 后 | `weapp-tailwindcss/vite`；显式绝对 `cssEntries` |
| HBuilderX Vue3 Vite | 项目 `vite.config.[jt]s` | HBuilderX 5.11+；基于配置文件位置解析绝对路径 |
| uni-app x | Vite + `uniAppX()` preset | 纯 CSS 入口；Android/iOS/Harmony 不是 Web target；详见 [uni-app x 配置参考](https://tw.weapp.dev/zh-cn/docs/config/uni-app-x) |
| Taro Webpack 5 | `config/index` 的 `mini.webpackChain` 与 `h5.webpackChain` | 两端都注册；复用同一 options |
| Taro Vite | `config/index` 的 `compiler.vitePlugins` | 不放在只被小程序加载的独立 `vite.config.ts` |
| Mpx | Webpack 配置 | 设置 `appType: 'mpx'`；显式入口 |
| weapp-vite/普通 Vite | Vite plugins | `weapp-tailwindcss/vite` |
| Rspack | Rspack plugins | 使用 `weapp-tailwindcss/rspack` |
| 原生流式构建 | Gulp/Vinyl | 使用 `weapp-tailwindcss/gulp`，不要绕开 stream graph |
| 单 CSS 入口/脚本 | `@weapp-tailwindcss/cli` | 默认 Web；`--target weapp` 仅转换生成 CSS |
| 自研构建器 | Core/generator | 改用 `$weapp-tailwindcss-custom-build` |
| Expo/React Native | Metro | 改用 `$weapp-tailwindcss-react-native`，详见 [React Native / Expo 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-native) |
| ReactLynx/Rspeedy | Rspeedy plugin | 改用 `$weapp-tailwindcss-lynx`，详见 [ReactLynx / Rspeedy 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-lynx) |

## Vite 与 uni-app

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      cssEntries: [resolve(projectRoot, 'src/app.css')],
      cssOptions: { rem2rpx: true },
    }),
  ],
})
```

在 `src/App.vue` 的全局 `<style>` 或应用入口中实际导入 `./app.css`。

## uni-app x

```ts
import { uniAppX } from 'weapp-tailwindcss/presets'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

WeappTailwindcss(uniAppX({
  base: projectRoot,
  cssEntries: [resolve(projectRoot, 'main.css')],
  cssOptions: { rem2rpx: true },
}))
```

运行到 App 时记录实际输出目录和设备 WebView/原生运行环境，不把 H5 成功作为 App 验收。

## Taro Webpack 5

```js
const path = require('node:path')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

const projectRoot = path.resolve(__dirname, '..')
const options = {
  tailwindcssBasedir: projectRoot,
  cssEntries: [path.resolve(projectRoot, 'src/app.css')],
  cssOptions: { rem2rpx: true },
}

function register(chain) {
  chain.plugin('weapp-tailwindcss').use(WeappTailwindcss, [options])
}

module.exports = {
  mini: { webpackChain: register },
  h5: { webpackChain: register },
}
```

Taro Vite 将同一 `WeappTailwindcss(options)` 放到 `config/index` 的 `compiler.vitePlugins`。Taro Vite 新项目不是默认推荐路径；已有项目需同时验证小程序和 H5。

## Mpx

```js
const path = require('node:path')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

module.exports = {
  configureWebpack(config) {
    config.plugins.push(new WeappTailwindcss({
      appType: 'mpx',
      cssEntries: [path.resolve(__dirname, 'src/app.css')],
      cssOptions: { rem2rpx: true },
    }))
  },
}
```

## 多端行为

- `UNI_PLATFORM=h5/app/app-plus`、常见 Web UTS/Taro/Mpx 环境会自动选择 Web 输出。
- uni-app x 的 `app-android`、`app-ios`、`app-harmony` 不应被当成 Web。
- 只有插件完全不应参与的独立 RN、Harmony 或原生构建才使用 `disabled`。
- 独立纯 Web 应用可以使用官方 Tailwind 集成；同一次由 `WeappTailwindcss` 管理的构建不可重复生成。

## 独立 CLI

CLI 适合一个 Tailwind CSS 入口、stdin/stdout、watch、source map 或 class 排序，不替代完整小程序 bundler：

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch
pnpm exec weapp-tw -i src/input.css -o dist/output.css --target weapp
pnpm exec weapp-tailwindcss canonicalize "py-3 p-1 px-3"
```

- `weapp-tw` 与 `weapp-tailwindcss` 是等价命令入口。
- 默认原生 watch；需要轮询时使用 `--poll` 或 `--poll=500`。
- source map 只支持 Web target。
- `--target weapp` 不扫描或改写 WXML、JavaScript、TypeScript、JSX、TSX 或已有 WXSS。

## 最小验收

1. 基础类：`flex px-4`。
2. 任意值：`w-[173px] text-[length:22rpx] bg-[#102938]`。
3. 变体：`dark:`、伪类或平台条件。
4. 在开发进程中新增一次任意值，确认 HMR 刷新。
5. 检查真实平台后缀和输出目录，不假设只有 `app.wxss`。
