---
title: Web 直接使用
description: 在纯 Web / Vite 项目中直接使用 weapp-tailwindcss 生成浏览器原生 Tailwind CSS。
keywords:
  - Web
  - H5
  - Vite
  - Tailwind CSS
  - weapp-tailwindcss
  - generator target web
  - cssEntries
  - 浏览器原生 CSS
  - Web 直接使用
  - vite plugin
---

# Web 直接使用

`weapp-tailwindcss` 可以直接用于纯 Web 项目。它适合小程序、H5/Web 共用同一套 Tailwind CSS 生成链路，或者在普通 Vite Web 项目里验证浏览器原生输出。

## 安装依赖

如果项目已经安装过 `tailwindcss` 和 `weapp-tailwindcss`，可以跳过这一步。

```bash npm2yarn
npm install -D tailwindcss weapp-tailwindcss
```

## 准备 CSS 入口

入口 CSS 仍然要被 Web 项目实际引入。`cssEntries` 只负责让 `weapp-tailwindcss` 稳定读取这个入口里的 `@import "tailwindcss"`、`@source` 与 `@config`，不会替代 Vite 生成 CSS 资产。

```ts title="src/main.ts"
import './style.css'
```

```css title="src/style.css"
@import "tailwindcss";

@source "./**/*.{html,js,ts,jsx,tsx,vue}";
```

## 注册 Vite 插件

纯 Vite Web 项目推荐使用专用入口。它固定 Web target，不会继承 monorepo 上层的小程序框架标记；入口 CSS 仍需由应用实际导入。

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'

export default defineConfig({
  plugins: [WeappTailwindcssWeb()],
})
```

`vite/web` 是 CSS-only 入口：它只处理 Tailwind CSS 生成、CSS transform、CSS HMR、入口诊断和 Web CSS 收尾，不会注册 JavaScript/template 转译、框架扩展、分包或小程序产物处理。内置 `styleInjector` 默认关闭；只有显式传入 `styleInjector` 时才启用 Web 适配器。

SSR、library mode、`optimizeDeps`、`cssMinify` 和 sourcemap 继续由 Vite 管理。只有实际进入 Vite CSS 模块图的样式才会生成 Tailwind CSS，`cssEntries` 不能替代应用对 CSS 的 import。

也可以继续使用主入口。无框架、平台标记的 Generic Vite 项目会在 Vite 配置解析后自动使用 Web target，入口 CSS 会从 Vite 模块图发现：

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

export default defineConfig({
  plugins: [WeappTailwindcss()],
})
```

需要兼容小程序、框架扩展或显式多入口时，仍可在同一入口中手动指定配置。历史 Generic 小程序项目应显式配置 `generator.target: 'weapp'` 或 `platform`，以保留小程序语义。

```ts title="vite.config.ts"
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    WeappTailwindcss({
      generator: {
        target: 'web',
      },
      cssEntries: [
        path.resolve(__dirname, 'src/style.css'),
      ],
    }),
  ],
})
```

选择这条链路后，不要再同时注册 `@tailwindcss/vite` 或 `@tailwindcss/postcss` 来生成同一份 Tailwind CSS。Taro H5、uni-app H5、Mpx Web、Weapp-vite Web 等多端框架会按环境变量自动切到 `web` 目标；自定义 Web 构建或纯 Vite 项目建议显式配置。更多目标判断规则见 [跨多端开发 CSS 兼容](/docs/multi-platform)。

可直接运行的 Generic Vite、uni-app、Taro 和 weapp-vite 样例见[仓库 canonical 模板](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/templates)，实际构建与 HMR 覆盖见[支持矩阵](/docs/reference/support-matrix)。
