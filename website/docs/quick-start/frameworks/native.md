---
title: 原生开发（weapp-vite）
description: 使用 weapp-vite 与 Tailwind CSS 4 构建原生小程序
keywords:
  - 快速开始
  - 安装
  - 配置
  - 原生开发
  - 打包方案
  - quick start
  - frameworks
  - native
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 原生开发（weapp-vite）

:::warning
这是原生开发的打包方案。如果你需要纯原生方案，请查看 [快速开始（纯原生）](/docs/quick-start/native/install)。
:::

> 由于原生小程序没有 `webpack/vite/gulp` 工具链暴露出来，所以我们要添加这一套机制，来整个前端社区接轨，以此来实现更强大的功能。

:::tip
给原生小程序加入编译时这块 `webpack/vite/gulp` 等等工具，思路都是一样的，然而实现起来比较复杂，损耗精力，在此不提及原理。

更改模板工具链流程前，请确保你比较熟悉工具链开发（到我这样的水平就差不多了）。

另外这些模板，只需要稍微改一下产物后缀，调整 `@source` 扫描范围就可以适配百度，头条，京东...各个平台。
:::

## weapp-vite

原生小程序推荐使用 [weapp-vite 官网](https://vite.icebreaker.top/)，通过下面的命令创建项目：

```bash
pnpm create weapp-vite
```

创建项目后，再按官网文档接入 Tailwind CSS 4 和 `weapp-tailwindcss/vite`。

然后在 `vite.config.ts` 中注册 `weapp-tailwindcss/vite`：

```ts title="vite.config.ts"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'weapp-vite/config'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    WeappTailwindcss({
      cssEntries: [
        resolve(projectRoot, 'app.css'),
      ],
      cssOptions: {
        rem2rpx: true,
      },
    }),
  ],
})
```

生成模式会接管 Tailwind CSS 生成和小程序转译，不需要再注册 `tailwindcss` PostCSS 插件，也不需要执行 `weapp-tw patch`。
Tailwind CSS 4 项目应显式配置 `cssEntries`，让 `WeappTailwindcss` 稳定读取入口 CSS 里的 `@source` 与 Tailwind 指令。`cssEntries` 只负责入口识别，入口 CSS 仍然要通过项目入口实际引入。

Tailwind CSS 4 的入口 CSS：

```css title="app.css"
@import "tailwindcss";
@source "./src/**/*.{wxml,js,ts,vue}";
@source "./app.{js,ts,json}";
@source not "./dist";
```

Tailwind 4 的入口只放在纯 `.css` 文件里。完整写法见 [纯原生 weapp-vite 接入](/docs/quick-start/native/install)。

## 组件样式的隔离性

:::tip
发现很多用户，在使用原生开发的时候，经常会问，为什么样式不生效。

这可能有以下几个原因:

1. 代码文件不在 `@source` 扫描范围内
2. 原生小程序组件是默认开启 **组件样式隔离** 的，默认情况下，自定义组件的样式只受到自定义组件 wxss 的影响。而 `tailwindcss` 生成的工具类，都在 `app.wxss` 这个全局样式文件里面。不属于组件内部，自然不生效。

这时候可以使用:

```js
/* 组件 custom-component.js */
Component({
  options: {
    addGlobalClass: true,
  }
})
```

来让组件应用到 `app.wxss` 里的样式。

[微信小程序相关开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html#%E7%BB%84%E4%BB%B6%E6%A0%B7%E5%BC%8F%E9%9A%94%E7%A6%BB)

:::

## vscode tailwindcss 智能提示设置

我们知道 `tailwindcss` 最佳实践，是要结合 `vscode`/`webstorm`提示插件一起使用的。

如果在 `vscode` 的 `wxml` 文件中写 `class` 没有智能提示，可以按下面步骤处理。

这里我们以 `vscode` 为例:

1. 安装 [`WXML - Language Services 插件`](https://marketplace.visualstudio.com/items?itemName=qiu8310.minapp-vscode)(一搜 wxml 下载量最多的就是了)

2. 安装 [`Tailwind CSS IntelliSense 插件`](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

接着找到 `Tailwind CSS IntelliSense` 的 `扩展设置`

在 `include languages` 里，把 `wxml` 标记为 `html`。

![如图所示](./img/vscode-setting.png)

智能提示就出来了:

![智能提示](./img/wxml-i.png)
