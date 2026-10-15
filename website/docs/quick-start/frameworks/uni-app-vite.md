---
title: uni-app CLI Vue3 Vite
description: uni-app CLI Vue3 Vite 项目接入 Tailwind CSS 4 与 weapp-tailwindcss。
keywords:
  - 快速开始
  - 安装
  - 配置
  - uni-app
  - cli
  - vue3
  - vite
  - quick start
  - frameworks
  - uni app vite
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - taro
---
# uni-app CLI Vue3 Vite

:::warning
这是 `uni-app cli` 创建的 Vue3 Vite 项目。如果你使用 `HBuilderX` 创建项目，请看 [uni-app HBuilderX 使用方式](/docs/quick-start/frameworks/hbuilderx)。
:::

## Tailwind 入口

当前文档面向 `tailwindcss@4`。当前文档仅维护 Tailwind CSS 4 接入说明。

Tailwind CSS 生成由 `WeappTailwindcss` 接管，不要在小程序构建里再注册 `tailwindcss`、`@tailwindcss/postcss` 或 `@tailwindcss/vite`。

```css title="src/app.css"
@import "tailwindcss";
@source "./**/*.{html,js,ts,jsx,tsx,vue}";
@source not "./uni_modules";
@source not "../node_modules";
@source not "../dist";
@source not "../unpackage";
```

Tailwind 4 的入口请放在纯 `.css` 文件里。业务里仍然可以使用 Sass/Less，但不要把 `@import "tailwindcss"` 直接写进预处理入口。

入口 CSS 还需要被项目实际引入，例如在 `src/App.vue` 的全局 `<style>` 中 `@import "./app.css";`，或通过框架推荐的全局样式入口导入。`cssEntries` 负责让 `weapp-tailwindcss` 稳定识别 Tailwind 入口，不会替代框架把这个 CSS 文件纳入构建图。

## 注册插件

在 `vite.config.ts` 中把 `WeappTailwindcss` 放在 `uni()` 后面：

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

Tailwind CSS 4 项目应显式配置 `cssEntries`，但对应 CSS 文件仍然要被项目实际引入。多个入口、普通分包入口、独立分包入口都要写进数组：

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

## 扫描范围提醒

### 问题现象

如果项目把第三方插件或依赖放进 `src/uni_modules`，同时扫描整个 `src`，Tailwind 可能会把依赖源码里的正则片段、README 示例或产物误识别为 class，最终生成异常 CSS。

在小程序产物中，可能会看到类似：

```css
._ba-zA-Z_c__B {
  a-z-a--z:;
}
```

### 根因

这不是业务代码真的写了这样的类名，而是扫描范围太宽，把第三方源码、文档或构建产物也纳入了提取范围。使用 `@source not` 排除这些目录。

### 最佳实践

- 扫描范围只覆盖业务源码，不要无差别扫整个 `src`
- 默认排除 `uni_modules`、`node_modules`、`dist`、`unpackage`
- 如果必须包含某个 `uni_modules` 包，只精确包含其中真正承载模板类名的文件

## 创建项目参考

可以通过 `cli` 命令创建项目，具体参数以 [uni-app 官网文档](https://uniapp.dcloud.net.cn/quickstart-cli.html) 为准：

- JavaScript 项目：

```bash
npx degit dcloudio/uni-preset-vue#vite my-vue3-project
```

- TypeScript 项目：

```bash
npx degit dcloudio/uni-preset-vue#vite-ts my-vue3-project
```

## 视频演示

<details>
<summary>加载视频演示</summary>

<iframe loading="lazy" title="uni-app Vite 视频演示" src="//player.bilibili.com/player.html?aid=326378691&bvid=BV14w411773C&cid=1409199088&p=1&autoplay=0" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"> </iframe>

</details>

[在哔哩哔哩观看](https://www.bilibili.com/video/BV14w411773C/)
