---
title: How to use uni-app HBuilderX
description: >-
  How to configure the HBuilderX Vue3 Vite project to access Tailwind CSS 4 and weapp-tailwindcss, as well as
  suggestions for processing Vue2 Webpack stock projects.
keywords:
  - quick start
  - Install
  - Configuration
  - uni-app
  - HBuilderX
  - Usage
  - frameworks
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - taro
  - mpx
  - installation
  - How
  - to
---

# uni-app HBuilderX usage

:::caution
This article contains both `HBuilderX` routes:

- `HBuilderX Vue3 Vite`: Recommended
- `HBuilderX Vue2 Webpack`: only for maintenance of existing projects
  :::

## HBuilderX Vue3 Vite

This route is suitable for Vue3 Vite projects created by HBuilderX. HBuilderX will change `process.cwd()` at runtime, so it is recommended to use absolute paths for both scan paths and `cssEntries`.

The current documentation is for `tailwindcss@4`. The current documentation only maintains Tailwind CSS 4 access instructions.

### CSS entry

```css title="src/app.css"
@import "tailwindcss";
@source "../pages/**/*.{html,js,ts,jsx,tsx,vue}";
@source "../components/**/*.{html,js,ts,jsx,tsx,vue}";
@source not "../uni_modules";
@source not "../unpackage";
```

The entry of Tailwind 4 should only be placed in the pure `.css` file. Do not write directly into the `scss`, `less`, and `sass` entries. VS Code IntelliSense can point `tailwindCSS.experimental.configFile` to this CSS file when needed.

The entry CSS still has to be actually introduced by the project, such as `src/App.vue` in the global `<style>` of `@import "./app.css";`. `cssEntries` is the entry recognition configuration for `weapp-tailwindcss` and will not replace HBuilderX / uni-app to include the CSS file into the build graph.

### vite.config.[tj]s

Pass in the absolute path of the entry CSS when registering `WeappTailwindcss`:

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

`UNI_PLATFORM=h5`, `app` or `app-plus`, the generator default target will automatically switch to `web`, and there is no need to write If your custom build environment does not inject these variables, you can specify web output explicitly:

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

`disabled` is only suitable for standalone native or custom builds that do not want plugins to be involved at all, and is not a general configuration for H5/normal App WebView.

Do not register the Tailwind official build plug-in in build mode, and do not register `@tailwindcss/postcss` or `@tailwindcss/vite`. When the project already has PostCSS configuration, only keep the non-Tailwind plug-ins required by the framework or business needs.

The current documentation only maintains the HBuilderX Vue3 Vite workflow. HBuilderX Vue2 projects based on Webpack4 / PostCSS7 are outside the current support scope; migrate to Vue3 Vite or a Webpack5 workflow managed by uni-app CLI.
