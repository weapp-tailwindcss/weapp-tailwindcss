---
title: Taro
description: Taro Webpack / Vite 项目接入 Tailwind CSS 4 与 weapp-tailwindcss。
keywords:
  - 快速开始
  - 安装
  - 配置
  - Taro
  - 所有框架
  - quick start
  - frameworks
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - mpx
---
# Taro

Taro v4 可以走 Webpack，也可以走 Vite。新项目优先选 Webpack，问题少一些；Taro Vite 可以用，但更适合已有项目排障。

:::caution
如果 `tailwindcss` 工具类不生效，先检查微信开发者工具是否开启了 `代码自动热重载`。关闭它后再重新预览。

如果你同时使用 `NutUI`，或启用了 `@tarojs/plugin-html`，请先看这个[注意事项](/docs/issues/use-with-nutui)。

<!-- 有群友遇到了转义特殊字符失败，之后变成了空格的文件，结果 `node_modules` 删了重新安装就好了。 -->

:::

下面的配置适用于 Taro 的 `react` / `preact` / `vue2` / `vue3`。文档默认你的源码都放在 `src` 目录下，这也是 Taro 模板的默认结构。

## Tailwind CSS 入口

当前文档面向 `tailwindcss@4`。当前文档仅维护 Tailwind CSS 4 接入说明。

小程序构建只注册 `WeappTailwindcss`。不要再在 PostCSS 中注册 `tailwindcss` 或 `@tailwindcss/postcss`，也不要为 Taro Vite 注册 `@tailwindcss/vite`。

```css title="src/app.css"
@import "tailwindcss" source(none);
@source "../src";
```

这里不用再单独写 `pages`、`components`。Taro 默认源码都在 `src` 里，扫 `../src` 更简单，也能覆盖你后面新增的 `src/features`、`src/utils`、`src/widgets` 这类目录。

`source(none)` 会关掉 Tailwind 4 的默认自动扫描，只按我们写的 `@source "../src"` 扫源码。这样不会把 `dist`、`node_modules` 这类目录带进来。

Tailwind 4 的入口请放在纯 `.css` 文件里。业务样式可以继续使用 Sass/Less，但不要把 `@import "tailwindcss"` 直接写进预处理入口。记得在 `src/app.ts` 或 `src/app.js` 里引入这个 CSS 文件：

```ts title="src/app.ts"
import './app.css'
```

## 使用 Webpack 作为打包工具

### 注册插件

在项目的配置文件 `config/index` 中注册。小程序和 H5 都需要注册 `WeappTailwindcss`：小程序目标会输出小程序可用 CSS，`TARO_ENV=h5` 时会自动切到 Web 目标。

```js title="config/index.[jt]s"
const path = require('node:path')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')
// 使用 ts 配置时，可以改用下方 import 写法
// import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'

const projectRoot = path.resolve(__dirname, '..')
const weappTailwindcssOptions = {
  cssOptions: {
    rem2rpx: true,
  },
  tailwindcssBasedir: projectRoot,
  cssEntries: [
    path.resolve(projectRoot, 'src/app.css'),
  ],
}

function registerWeappTailwindcss(chain) {
  chain.merge({
    plugin: {
      install: {
        plugin: WeappTailwindcss,
        args: [weappTailwindcssOptions],
      },
    },
  })
}

{
  mini: {
    webpackChain(chain, webpack) {
      // highlight-start
      registerWeappTailwindcss(chain)
      // highlight-end
    }
  },
  h5: {
    webpackChain(chain, webpack) {
      // highlight-start
      registerWeappTailwindcss(chain)
      // highlight-end
    }
  }
}
```

然后正常运行项目即可。Tailwind CSS 4 项目应显式配置 `cssEntries`，同时仍要在 `src/app.ts` 或 `src/app.js` 里引入 `./app.css`。

如果你把 Tailwind 入口放到了别的目录，或者项目有多个 Tailwind 入口，把这些纯 `.css` 入口都写进 `cssEntries`：

```js title="config/index.[jt]s"
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const weappTailwindcssOptions = {
  cssOptions: {
    rem2rpx: true,
  },
  tailwindcssBasedir: projectRoot,
  cssEntries: [
    path.resolve(projectRoot, 'src/app.css'),
  ],
}
```

`cssEntries` 指向的是 Tailwind 入口文件，请指向纯 `.css`。

不要在 H5 里写 `disabled: process.env.TARO_ENV === 'h5'`。小程序和 H5 都注册插件，`weapp-tailwindcss` 会按目标端处理。

:::info
`weapp-tailwindcss/webpack` 对应的推荐插件名 `WeappTailwindcss` 适用于 `webpack@5`

在使用 `Taro` 时，检查一下 `config/index` 文件的配置项 `compiler`，来确认你的 `webpack` 版本。当前版本不再内置 Webpack4 入口，推荐使用 `'webpack5'`

如果你使用了 [`taro-plugin-compiler-optimization`](https://www.npmjs.com/package/taro-plugin-compiler-optimization)，建议移除。它会让打包结果变得混乱。详见 [issues/123](https://github.com/sonofmagic/weapp-tailwindcss/issues/123) [issues/131](https://github.com/sonofmagic/weapp-tailwindcss/issues/131)

<!-- 还有不要和 `terser-webpack-plugin` 一起注册使用，这会导致转义功能失效 详见 [**常见问题**](/docs/issues#taro-webpack5-环境下这个插件和-terser-webpack-plugin-一起使用会导致插件转义功能失效) 和 [issues/142](https://github.com/sonofmagic/weapp-tailwindcss/issues/142) -->

`taro` 的 `prebundle` 也容易干扰排查。如果项目启动异常且原因不明，可以先关闭这个配置。

<!--
**另外不要开启二次编译缓存!**

```js
// 禁止二次编译缓存
cache: {
  enable: false
},
```

开启它会导致二次编译时，直接跳过插件的转义。另外还有一个 -->

<!-- `taro` 开发时热更新的问题，开发中保存 `tailwind.config.js` 文件，触发热更新会导致所有样式挂掉，此时重新保存任意 `jsx/tsx` 文件恢复正常。 -->

:::

## 使用 Vite 作为打包工具

:::danger
`Taro Vite` 目前整体稳定性较差，已知问题和样式链路 bug 较多，不推荐在新项目里使用。

如果你没有强依赖 `Taro Vite`，优先选择 `Taro Webpack`、`uni-app`、`weapp-vite` 等更稳定的方案。
:::

Taro Vite 需要把 `WeappTailwindcss` 注册到 `config/index` 的 `compiler.vitePlugins`，这样小程序和 H5 都能走同一份插件配置。Tailwind CSS 由 `WeappTailwindcss` 生成，不需要再注册 Tailwind 官方 Vite 或 PostCSS 插件。

### 在 `config/index.ts` 中注册插件

```ts title="config/index.[jt]s"
import type { Plugin } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const baseConfig: UserConfigExport<'vite'> = {
  // ... 其他配置
  // highlight-start
  compiler: {
    type: 'vite',
    vitePlugins: [
      WeappTailwindcss({
        cssOptions: {
          // rem转rpx
          rem2rpx: true,
          // Taro Vite 可能移除 Tailwind CSS 变量，需要重新注入变量作用域
          injectAdditionalCssVarScope: true,
        },
      })
    ] as Plugin[] // 从 vite 引入 type, 为了智能提示
  },
  // highlight-end
  // ... 其他配置
}
```

Tailwind CSS 生成由 `weapp-tailwindcss` 接管，不需要再把 Tailwind 官方生成插件注册到 PostCSS 或 Vite 配置里。`src/app.css` 按上方写 Tailwind 4 入口。

Taro Vite 也应显式配置 `cssEntries`。它只负责让 `weapp-tailwindcss` 稳定读取 Tailwind CSS 入口，入口 CSS 仍然要通过 Taro 入口实际引入。

`TARO_ENV=h5` 时，生成器默认目标会自动切换为 `web`，不再需要写 `disabled: process.env.TARO_ENV === 'h5'`。如果 RN 或 Harmony 构建不希望插件参与，可以只针对这些目标显式设置 `disabled`。

> `vite.config.ts` 只有在运行小程序时才会加载，`h5` 不会。小程序 + h5 双端兼容请把插件注册放在 `config/index` 的 `compiler.vitePlugins` 中。
> `Taro Vite` 当前仍然不稳定，这部分内容仅作为历史方案和排障参考，不建议作为新项目默认选型。

## 视频演示

<details>
<summary>加载视频演示</summary>

<iframe loading="lazy" title="Taro 视频演示" src="//player.bilibili.com/player.html?aid=966499437&bvid=BV1UW4y1w7VM&cid=1411385502&p=1&autoplay=0" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"> </iframe>

</details>

[在哔哩哔哩观看](https://www.bilibili.com/video/BV1UW4y1w7VM/)
