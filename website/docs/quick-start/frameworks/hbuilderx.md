---
title: uni-app HBuilderX 使用方式
description: HBuilderX Vue3 Vite 项目接入 Tailwind CSS 4 与 weapp-tailwindcss 的配置方式，以及 Vue2 Webpack 存量项目的处理建议。
keywords:
  - 快速开始
  - 安装
  - 配置
  - uni-app
  - HBuilderX
  - 使用方式
  - quick start
  - frameworks
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - taro
  - mpx
---
# uni-app HBuilderX 使用方式

:::caution
本文同时包含两条 `HBuilderX` 路线：

- `HBuilderX Vue3 Vite`：推荐
- `HBuilderX Vue2 Webpack`：仅供存量项目维护
:::

## HBuilderX Vue3 Vite

这条路线适合 HBuilderX 创建的 Vue3 Vite 项目。HBuilderX 会改变运行时的 `process.cwd()`，所以扫描路径和 `cssEntries` 都建议使用绝对路径。

当前文档面向 `tailwindcss@4`。当前文档仅维护 Tailwind CSS 4 接入说明。

### CSS 入口

```css title="src/app.css"
@import "tailwindcss";
@source "../pages/**/*.{html,js,ts,jsx,tsx,vue}";
@source "../components/**/*.{html,js,ts,jsx,tsx,vue}";
@source not "../uni_modules";
@source not "../unpackage";
```

Tailwind 4 的入口只放在纯 `.css` 文件里，不要直接写进 `scss`、`less`、`sass` 入口。VS Code IntelliSense 需要时，可以把 `tailwindCSS.experimental.configFile` 指向这个 CSS 文件。

入口 CSS 仍然要被项目实际引入，例如在 `src/App.vue` 的全局 `<style>` 中 `@import "./app.css";`。`cssEntries` 是给 `weapp-tailwindcss` 的入口识别配置，不会替代 HBuilderX / uni-app 把该 CSS 文件纳入构建图。

### vite.config.[tj]s

注册 `WeappTailwindcss` 时传入入口 CSS 的绝对路径：

```js title="vite.config.[tj]s"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      cssOptions: {
        rem2rpx: true,
      },
      tailwindcssBasedir: projectRoot,
      cssEntries: [
        resolve(projectRoot, 'src/app.css'),
      ],
    })
  ],
})
```

```vue title="src/App.vue"
<style>
@import "./app.css";
</style>
```

`UNI_PLATFORM=h5`、`app` 或 `app-plus` 时，生成器默认目标会自动切换为 `web`，不再需要写 `disabled: WeappTailwindcssDisabled`。如果自定义构建环境没有注入这些变量，可以显式指定 Web 输出：

```js
WeappTailwindcss({
  generator: {
    target: "web",
  },
  cssOptions: {
    rem2rpx: true,
  },
  tailwindcssBasedir: projectRoot,
  cssEntries: [
    resolve(projectRoot, "src/app.css"),
  ],
});
```

`disabled` 只适合完全不希望插件参与的独立原生或自定义构建，不是 H5 / 普通 App WebView 的常规配置。

生成模式下不要再注册 Tailwind 官方生成插件，不要注册 `@tailwindcss/postcss` 或 `@tailwindcss/vite`。项目已有 PostCSS 配置时，只保留框架或业务需要的非 Tailwind 插件。

当前文档只维护 HBuilderX Vue3 Vite 链路。使用 Webpack4 / PostCSS7 的 HBuilderX Vue2 项目不在当前版本支持范围内，请迁移到 Vue3 Vite 或由 uni-app CLI 管理的 Webpack5 链路。
