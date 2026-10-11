---
title: Taro
description: The Taro Webpack / Vite project integrates Tailwind CSS 4 and weapp-tailwindcss.
keywords:
  - quick start
  - Install
  - Configuration
  - Taro
  - All frames
  - frameworks
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - mpx
  - installation
  - Tailwind CSS 4
  - cross-platform
  - mini app
---

# Taro

Taro v4 can use Webpack or Vite. For new projects, Webpack is preferred, as it has fewer problems; Taro Vite can be used, but it is more suitable for troubleshooting existing projects.

:::caution
If the `tailwindcss` tool class does not take effect, first check whether `Code automatic hot reloading` is enabled in the WeChat developer tools. Close it and preview again.

If you use `NutUI` at the same time, or enable `@tarojs/plugin-html`, please read this [Note] first (/docs/issues/use-with-nutui).

`node_modules`

:::

The configuration below is for Taro's `react` / `preact` / `vue2` / `vue3`. The document defaults to placing your source code in the `src` directory, which is also the default structure of the Taro template.

## Tailwind CSS entry

The current documentation is for `tailwindcss@4`. The current documentation only maintains Tailwind CSS 4 access instructions.

The applet build only registers `WeappTailwindcss`. Do not register `tailwindcss` or `@tailwindcss/postcss` again in PostCSS, nor `@tailwindcss/vite` for Taro Vite.

```css title="src/app.css"
@import "tailwindcss" source(none);
@source "../src";
```

There is no need to write `pages` and `components` separately here. Taro's default source codes are all in `src`. It is easier to scan `../src`, and it can also cover directories such as `src/features`, `src/utils`, and `src/widgets` that you add later.

`source(none)` will turn off the default automatic scanning of Tailwind 4, and only scan the source code according to the `@source "../src"` we wrote. This will not bring in directories such as `dist` and `node_modules`.

Please put the entry of Tailwind 4 in a pure `.css` file. Business styles can continue to use Sass/Less, but do not write `@import "tailwindcss"` directly into the preprocessing entry. Remember to include this CSS file in `src/app.ts` or `src/app.js`:

```ts title="src/app.ts"
import './app.css'
```

## Use Webpack as a packaging tool

### Register plugin

Registered in the project's configuration file `config/index`. Both mini programs and H5 need to register `WeappTailwindcss`: the mini program target will output the CSS available for the mini program, and when `TARO_ENV=h5` is used, it will automatically switch to the web target.

```js title="config/index.[jt]s"
const path = require('node:path')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')
// When using ts configuration, you can use the following import writing method instead
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

Then run the project normally. Tailwind CSS 4 projects should explicitly configure `cssEntries` while still including `src/app.ts` in `src/app.js` or `./app.css`.

If you put the Tailwind entry in another directory, or the project has multiple Tailwind entries, write these pure `.css` entries into `cssEntries`:

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

`cssEntries` points to the Tailwind entry file, please point to pure `.css`.

Don't write `disabled: process.env.TARO_ENV === 'h5'` in H5. Both mini programs and H5 register plug-ins, and `weapp-tailwindcss` will process them according to the target side.

:::info
The recommended plug-in name `weapp-tailwindcss/webpack` corresponding to `WeappTailwindcss` is applicable to `webpack@5`

When using `Taro`, check the configuration item `config/index` in the `compiler` file to confirm your version of `webpack`. The current version no longer has a built-in Webpack4 entry, and it is recommended to use `'webpack5'`

If you are using [`taro-plugin-compiler-optimization`](https://www.npmjs.com/package/taro-plugin-compiler-optimization), it is recommended to remove it. It can clutter the packaging results. For details, see [issues/123](https://github.com/sonofmagic/weapp-tailwindcss/issues/123) [issues/131](https://github.com/sonofmagic/weapp-tailwindcss/issues/131)

https://github.com/sonofmagic/weapp-tailwindcss/issues/142

`taro` of `prebundle` can also easily interfere with troubleshooting. If the project starts abnormally and the reason is unknown, you can turn off this configuration first.

<!--
**Also do not enable the secondary compilation cache!**

```js
// Disable secondary compilation caching
cache: {
  enable: false
},
```

Enabling it will cause the plug-in escaping to be skipped directly during secondary compilation. There is another one -->

`taro`

:::

## Use Vite as a packaging tool

:::danger
`Taro Vite` currently has poor overall stability, has many known issues and style link bugs, and is not recommended for use in new projects.

If you are not strongly dependent on `Taro Vite`, give priority to more stable solutions such as `Taro Webpack`, `uni-app`, and `weapp-vite`.
:::

Taro Vite needs to register `WeappTailwindcss` to `config/index` of `compiler.vitePlugins`, so that both the mini program and H5 can use the same plug-in configuration. Tailwind CSS is generated by `WeappTailwindcss`, and there is no need to register the Tailwind official Vite or PostCSS plug-in.

### Register the plug-in in `config/index.ts`

```ts title="config/index.[jt]s"
import type { Plugin } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const baseConfig: UserConfigExport<'vite'> = {
// ...other configuration
  // highlight-start
  compiler: {
    type: 'vite',
    vitePlugins: [
      WeappTailwindcss({
        cssOptions: {
//rem to rpx
          rem2rpx: true,
// Taro Vite may remove Tailwind CSS variables and need to re-inject the variable scope
          injectAdditionalCssVarScope: true,
        },
      })
] as Plugin[] //Introduce type from vite, for smart prompts
  },
  // highlight-end
// ...other configuration
}
```

Tailwind CSS generation is taken over by `weapp-tailwindcss`, and there is no need to register the Tailwind official generation plug-in into the PostCSS or Vite configuration. `src/app.css` Click above to write the Tailwind 4 entry.

Taro Vite should also explicitly configure `cssEntries`. It is only responsible for allowing `weapp-tailwindcss` to stably read the Tailwind CSS entry. The entry CSS still has to be actually introduced through the Taro entry.

`TARO_ENV=h5`, the default target of the generator will automatically switch to `web`, and there is no need to write `disabled: process.env.TARO_ENV === 'h5'`. If your RN or Harmony build does not want the plugin to be involved, you can explicitly set `disabled` only for those targets.

> `vite.config.ts` will only be loaded when running the applet, `h5` will not. For mini program + h5 dual-end compatibility, please register the plug-in in `config/index` of `compiler.vitePlugins`.
> `Taro Vite` is currently still unstable. This part of the content is only used as a historical solution and troubleshooting reference, and is not recommended as the default selection for new projects.

## Video demonstration

<iframe src="//player.bilibili.com/player.html?aid=966499437&bvid=BV1UW4y1w7VM&cid=1411385502&p=1&autoplay=0" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"> </iframe>
