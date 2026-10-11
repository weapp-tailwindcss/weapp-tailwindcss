---
title: uni-app CLI Vue3 Vite
description: The uni-app CLI Vue3 Vite project integrates Tailwind CSS 4 and weapp-tailwindcss.
keywords:
  - quick start
  - Install
  - Configuration
  - uni-app
  - cli
  - vue3
  - vite
  - frameworks
  - uni app vite
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - taro
  - installation
  - Tailwind CSS 4
---

# uni-app CLI Vue3 Vite

:::warning
This is a Vue3 Vite project created by `uni-app cli`. If you use `HBuilderX` to create your project, please see [How to use uni-app HBuilderX](/docs/quick-start/frameworks/hbuilderx).
:::

## Tailwind entrance

The current documentation is for `tailwindcss@4`. The current documentation only maintains Tailwind CSS 4 access instructions.

Tailwind CSS generation is taken over by `WeappTailwindcss`. Do not register `tailwindcss`, `@tailwindcss/postcss` or `@tailwindcss/vite` in the mini program build.

```css title="src/app.css"
@import "tailwindcss";
@source "./**/*.{html,js,ts,jsx,tsx,vue}";
@source not "./uni_modules";
@source not "../node_modules";
@source not "../dist";
@source not "../unpackage";
```

Please put the entry of Tailwind 4 in a pure `.css` file. You can still use Sass/Less in your business, but don’t write `@import "tailwindcss"` directly into the preprocessing entry.

The entry CSS also needs to be actually introduced by the project, such as in the global `src/App.vue` of `<style>`, or imported through the global style entry recommended by the framework. `@import "./app.css";` is responsible for allowing `cssEntries` to stably recognize the Tailwind entry and will not replace the framework to include this CSS file into the build graph.

## Register plugin

Place `vite.config.ts` after `WeappTailwindcss` in `uni()`:

```ts title="vite.config.ts"
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
      cssEntries: [
        resolve(projectRoot, 'src/app.css'),
      ],
      cssOptions: {
        rem2rpx: true,
      },
    }),
  ],
})

```

Tailwind CSS 4 projects should explicitly configure `cssEntries`, but the corresponding CSS files still need to be actually imported by the project. Multiple entries, common subcontract entries, and independent subcontract entries must be written into the array:

```ts title="vite.config.ts"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))

WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
  },
  cssEntries: [
    resolve(projectRoot, 'src/app.css'),
    resolve(projectRoot, 'src/sub-normal/pages/index.css'),
    resolve(projectRoot, 'src/sub-independent/pages/index.css'),
  ],
})
```

```vue title="src/App.vue"
<style>
@import "./app.css";
</style>
```

## Scan range reminder

### Problem phenomenon

If the project puts third-party plug-ins or dependencies into `src/uni_modules` and scans the entire `src` at the same time, Tailwind may misidentify the regular fragments, README examples or products in the dependent source code as classes, and ultimately generate abnormal CSS.

In mini program products, you may see something like:

```css
._ba-zA-Z_c__B {
  a-z-a--z:;
}
```

### Root cause

This is not because the business code actually writes such class names, but because the scanning scope is too wide, and third-party source code, documents or built products are also included in the extraction scope. Use `@source not` to exclude these directories.

### Best Practices

- The scanning scope only covers the business source code, do not scan the entire `src` indiscriminately
- Exclude `uni_modules`, `node_modules`, `dist`, `unpackage` by default
- If a certain `uni_modules` package must be included, only include exactly the file that actually holds the template class name

## Create project reference

The project can be created through the `cli` command. The specific parameters are subject to [uni-app official website document] (https://uniapp.dcloud.net.cn/quickstart-cli.html):

- JavaScript projects:

```bash
npx degit dcloudio/uni-preset-vue#vite my-vue3-project
```

- TypeScript project:

```bash
npx degit dcloudio/uni-preset-vue#vite-ts my-vue3-project
```

## Video demonstration

<iframe src="//player.bilibili.com/player.html?aid=326378691&bvid=BV14w411773C&cid=1409199088&p=1&autoplay=0" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"> </iframe>
