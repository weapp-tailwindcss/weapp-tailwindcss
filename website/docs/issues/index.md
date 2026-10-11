---
title: 常见问题
description: >-
  目前微信开发者工具会默认开启代码自动热重载 compileHotReLoad 功能，这个功能在原生开发中表现良好，但在 uni-app 和 taro 等的框架中，存在一定的问题，参见
  issues#37，所以如果你遇到了此类问题，建议关闭 compileHotReLoad 功能。
keywords:
  - 常见问题
  - 故障排查
  - 兼容性
  - issues
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 常见问题

:::info 组件外部样式类必读
自定义组件使用 `externalClasses` 时样式被拆分？请先查看《[组件外部样式类（externalClasses）的支持](/docs/issues/externalClasses)》，按照文档里的 `customAttributes` 配置即可解决。
:::

:::tip 先运行诊断命令
接入失败、样式未生成、Tailwind CSS v4 PostCSS 报错或 JS 字符串 class 未转义时，可以先运行 `pnpm exec weapp-tailwindcss doctor`。详见《[使用 doctor 命令诊断项目配置](/docs/issues/doctor)》。
:::

## 为什么我更改了 class 保存重新打包的时候热更新失效？

[[#93](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/93)]

目前微信开发者工具会默认开启代码自动热重载 `compileHotReLoad` 功能，这个功能在原生开发中表现良好，但在 `uni-app` 和 `taro` 等的框架中，存在一定的问题，参见 [issues#37](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/37)，所以如果你遇到了此类问题，建议关闭 `compileHotReLoad` 功能。

## `disabled:opacity-50` 这类的 `tailwindcss` 工具类不生效?

这是由于微信小程序 `wxss` 选择器的原生限制，无法突破。参见 [issue#33](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/33)。

## `background-image` 为什么不能使用本地路径？

微信小程序在 `wxss` 中禁止 `background-image` 引用本地文件，解析时会直接报 `do-not-use-local-path` 错误。因此像 <code>bg-&#91;url('/images/homebg.png')&#93;</code> 这样的写法无法生效。请改用以下任一方式：

- 使用线上可访问的远程图片地址，例如 `bg-[url('https://example.com/bg.png')]`
- 将资源转成 `base64` 后内联到 `background-image`
- 改用 `<image>` 组件渲染背景效果

选择合适方案后再通过 `tailwindcss` 编写样式，即可避免编译报错。

## 和原生组件一起使用注意事项

假如出现原生组件引入报错的情况，可以参阅 [issue#35](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/35)，忽略指定目录下的文件，跳过插件处理，例如 `uni-app` 中的 `wxcomponents`。

如何更改？在传入的配置项 `cssMatcher`，`htmlMatcher` 这类配置，来过滤指定目录或文件。

## uni-app + Tailwind CSS 4 扫描 `src/uni_modules` 后生成异常 CSS

### 问题现象

当 CSS 入口使用下面这种过宽的 `@source` 配置：

```css
@import "tailwindcss";
@source "./src/**/*.{html,js,ts,jsx,tsx,vue}";
```

并且项目里存在 `src/uni_modules/**/*` 第三方包时，Tailwind 可能扫描到依赖源码中的正则片段或示例文本，例如 `[a-zA-Z:_]`，并把它当成 arbitrary property class 提取。

在小程序场景下，再经过 `weapp-tailwindcss` 转译后，最终可能出现类似：

```css
._ba-zA-Z_c__B {
  a-z-a--z:;
}
```

这样的异常产物。

### 根因

这类问题的根因不是业务代码真的写了这个 class，而是扫描范围过宽，误扫了第三方目录中的源码、文档或构建产物。

### 推荐配置

请显式排除 `src/uni_modules`：

```css title="src/app.css"
@import "tailwindcss";
@source "./src/**/*.{html,js,ts,jsx,tsx,vue}";
@source not "./src/uni_modules";
```

### 最佳实践

- `@source` 应尽量只覆盖业务源码目录
- 默认应排除 `uni_modules`、`node_modules`、`dist`、`unpackage`、文档和生成产物
- 如果必须扫描某个 `uni_modules` 包，应只精确包含其中真正承载模板类名的文件，而不是整个目录全量扫描

## 编译到 h5 / app 注意事项

有些用户通过 `uni-app` 等跨端框架，不止开发成各种小程序，也开发为 `H5` 或 App。从 v5 开始，H5/Web 与普通 uni-app App WebView 构建不再需要禁用 `WeappTailwindcss`：插件会根据 `UNI_PLATFORM=h5/app/app-plus` 自动把生成器目标切到 `web`，输出浏览器原生 Tailwind CSS。

```js
// 我们以 uni-app-vue3-vite 这个 demo为例
// vite.config.ts
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { WeappTailwindcss } from "weapp-tailwindcss/vite";
// vite 插件配置
const vitePlugins = [uni(),WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
  },
})];

export default defineConfig({
  plugins: vitePlugins
});

// Tailwind CSS 由 WeappTailwindcss 生成模式接管。
// 如果项目已有 PostCSS 配置，只保留 autoprefixer、业务自定义插件等非 Tailwind 插件。
```

如果自定义构建环境没有注入 `UNI_PLATFORM=h5/app/app-plus`，可以显式指定 Web 输出：

```js
WeappTailwindcss({
  generator: {
    target: "web",
  },
  cssOptions: {
    rem2rpx: true,
  },
});
```

`disabled` 只适合完全不希望插件参与的 RN、Harmony、独立原生或自定义构建，不是 H5 / 普通 App WebView 的常规配置。

## 报错 TypeError: Cannot use 'in' operator to search for 'CallExpression' in undefined

遇到这个问题是由于 `babel` 相关的包之间的版本产生了冲突导致的，这种时候可以删除掉 `lock` 文件（`yarn.lock`、`pnpm-lock.yaml`、`package-lock.json`），然后重新安装即可。

## taro webpack5 环境下，这个插件和外置额外安装的 `terser-webpack-plugin` 一起使用，会导致插件转义功能失效

相关 issue：[#142](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/142)

例如：`.h-4/6`、`!w-full` 正常会转义为`.h-4s6`、`.iw-full`，本插件失效后小程序开发者工具报编译错误 `.h-4\/6`、`.\!w-full`。

请压缩代码并不要使用[链接](https://docs.taro.zone/docs/config-detail/#terserenable)中的方法，太老旧了。

使用 `taro` 配置项里的的 `terser` 配置项，参见 [`terser` 配置项](https://docs.taro.zone/docs/config-detail#terser)。

> `terser` 配置只在生产模式下生效。如果你正在使用 `watch` 模式，又希望启用 `terser`，那么则需要设置 `process.env.NODE_ENV` 为 `production`。

也就是说，直接在开发 `watch` 模式的时候，设置环境变量 `NODE_ENV` 为 `production` 就行。

另外也可以不利用 `webpack` 插件压缩代码，去使用微信开发者工具内部的压缩代码选项。

## 为什么 space-y-1 这类写法不起作用?

相关 issue：[#108](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/108)

考虑到小程序的组件 `shadow root` 实现方式，默认情况下 `space` 这一类带有子选择器的，只对 `view` 元素生效。

即选择器变成了 `.space-y-1 > view + view`

这时候解决方案有 3 种：

- 组件外层套一层 `<view>` 元素。
- `virtualHost` 解决方案，在自定义组件中添加 `options: { virtualHost: true }` 即可解决此问题。
- [`cssOptions.cssChildCombinatorReplaceValue`](/docs/api/options/important#cssoptions) 配置项

## 使用 uni-app vite vue 注册插件时，发行到 h5 环境出现: [plugin:vite-plugin-uni-app-weapp-tailwindcss-adaptor] 'import' and 'export' may appear only with 'sourceType: "module"' (1:0) 错误

解决方案：

```js
import { WeappTailwindcss } from "weapp-tailwindcss/vite";
const vitePlugins = [uni(), WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
  },
})];
```

即 H5 与普通 uni-app App WebView 环境继续保留插件，由生成器自动切到 `web` 目标。自定义构建环境没有注入平台变量时，可以显式设置 `generator: { target: "web" }`。

## 使用 pnpm@8 插件注册失败问题

pnpm 8 这个版本改变了一些默认值，其中 `resolution-mode` 默认值变成了 `lowest-direct`。

这会导致所有的依赖，会被安装成你在 `package.json` 里注册的最低版本，这可能会造成一些问题。如何解决？

目录下创建一个 `.npmrc`，设置 `resolution-mode` 为 `highest`，然后重新安装，

或者，使用 `pnpm up -Li` 升级一下你 `package.json` 里的依赖包版本到最新即可。

## uni-app 在从v1升级到v2的过程中，如果使用了云函数相关功能，编译到小程序会出现问题

解决方案参见：<https://ask.dcloud.net.cn/question/170057>

相关 issue：[#74](https://github.com/sonofmagic/weapp-tailwindcss/issues/74#issuecomment-1573033475)

## uni-app vue2 中的 css 使用 @import 引入其他 css，导致在 `rpx` 在H5下不生效

需要添加并配置 `postcss-import`，参见 [issues/75](https://github.com/sonofmagic/weapp-tailwindcss/issues/75#issuecomment-1574592907)。

你可以参考仓库中的 `demo/uni-app-vue3-vite` 来进行配置。

## 为什么在 Taro JSX / JS 里写类名不生效？

在 `weapp-tailwindcss@5` 中，不再需要执行 `weapp-tw patch`。JS/JSX 里的类名能否转译，主要看这些类名是否已经进入 Tailwind 的扫描范围，并出现在构建时收集到的 `classNameSet` 中。

排查顺序：

- 检查 CSS 入口里的 `@source` 是否覆盖对应源码目录
- 检查项目是否还把官方 Tailwind PostCSS/Vite 插件和 `weapp-tailwindcss` 同时用于小程序目标；小程序生成链路应由 `weapp-tailwindcss` 接管
- 任意值类名如果写在动态拼接字符串里，Tailwind 可能扫描不到；这种场景需要改成完整字面量，或加入 safelist / `@source`

## monorepo 项目中 arbitrary values 写法无效？

这通常是 Tailwind 上下文定位不准，或源码没有被扫描到。可以先检查两件事：

- 配置 [tailwindcssBasedir](https://tw.weapp.dev/docs/api/interfaces/UserDefinedOptions#tailwindcssbasedir)，让插件从正确的项目目录解析 Tailwind

- 检查 `@source` / `cssEntries`

如果 monorepo 的依赖提升导致不同包拿到的 Tailwind 版本不一致，再考虑限制 `tailwindcss` 包提升。具体配置取决于包管理器。
