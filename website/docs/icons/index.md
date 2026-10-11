---
title: 小程序 `icon` 解决方案
description: 这里介绍一种在小程序里，开箱即用的 icon 解决方案：iconify
keywords:
  - 小程序
  - icon
  - 解决方案
  - icons
  - weapp-tailwindcss
  - tailwindcss
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 小程序 `icon` 解决方案

这里介绍一种在小程序里，开箱即用的 icon 解决方案：[`iconify`](https://iconify.design/)

很高兴，我们已经有这样的能力，为小程序提供大量的 `icon`, 供我们开发者自己进行选择。

## 立即开始

首先，在已经安装和配置完本插件之后，安装 [`@egoist/tailwindcss-icons`](https://www.npmjs.com/package/@egoist/tailwindcss-icons)

```sh npm2yarn
npm i -D @egoist/tailwindcss-icons
```

:::tip
**Iconify for Tailwind CSS** 其实给我们提供了两种选择：
`@iconify/tailwind` 和 `@egoist/tailwindcss-icons`

个人用下来，感觉 `@egoist/tailwindcss-icons` 更好用一点，智能提示也更好一些。

因为它是直接把全部的 `icon` 生成在 `components` 里, 然后再交给 `Tailwind CSS` 从里面进行挑选再输出到我们的 `css` 文件中的。

而 `@iconify/tailwind` 走的是 `jit` 动态加载生成，但是没有智能提示加 `<span class="icon-[mdi-light--home]"></span>` 不好用啊，笑～。

详见 <https://iconify.design/docs/usage/css/tailwind/>
:::

然后在 `tailwind.config.js` 注册插件:

```js
const { iconsPlugin, getIconCollections } = require("@egoist/tailwindcss-icons")

module.exports = {
  plugins: [
    iconsPlugin({
      // Select the icon collections you want to use
      collections: getIconCollections(["mdi", "lucide"]),
    }),
  ],
}
```

然后你还要安装你挑选的 `icon` 集合包，比如你选择了 `"mdi"` 和 `"lucide"`

那你就要安装: `@iconify-json/mdi` 和 `@iconify-json/lucide` (包名的规则就是：`@iconify-json/{collection_name}`)

当然你也可以直接安装 `@iconify/json`，这里面包含了所有的 `icon`,不过代价就是，这个包比较大（50MB+）

然后你回到你的页面，输入 `i-` 智能提示就出来了，然后就可以这么写了：

`<view class="i-mdi-home text-3xl text-red-600"></view>`

## Tailwindcss v4

在 `Tailwindcss@4` 中，不会自动读取 `tailwind.config.js` 文件，所以你需要使用 [@config](https://tailwindcss.com/docs/functions-and-directives#config-directive) 指令，手动引入 `tailwindcss` 的配置文件。

Iconify 推荐使用 `@iconify/tailwind4`，并且直接在 Tailwind 入口 CSS 中注册：

```css
@import "tailwindcss";
@plugin "@iconify/tailwind4";

/* 添加下面这一行，路径为你创建的 tailwind.config.js 文件路径 */
/* highlight-next-line */
@config "../tailwind.config.js";
```

> **注意**：`tailwindcss@4` + `weapp-tailwindcss@5` 的实际运行时入口推荐直接写 `@import 'tailwindcss'`。构建器会在 Tailwind v4 小程序生成链路中解析到目标 CSS。Iconify v4 插件也应该跟随入口 CSS 注册，不再写到 `tailwind.config.js` 的 `plugins` 中。

这样在 `tailwindcss@4` 中才能起效果

## icon预览挑选网站

https://icon-sets.iconify.design/

<https://icones.js.org>

## 生成结果

我们以 `i-mdi-home` 这个类的`css` 生成结果为例：

```css
.i-mdi-home{
  display: inline-block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  -webkit-mask-image: var(--svg);
  mask-image: var(--svg);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  --svg: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 width=%2724%27 height=%2724%27%3E%3Cpath fill=%27black%27 d=%27M10 20v-6h4v6h5v-8h3L12 3L2 12h3v8h5Z%27/%3E%3C/svg%3E");
}
```

是的，它是通过 `css var` 的方式，把 `svg` 给内联了（`inline`）了进来，然后通过 `mask-image` 来把图形给显示出来的。 显然，这用多了 `icon` 之后会造成生成的 `css` 体积大的问题。

对此还有 `mask-image` 和 `css var` 在部分机器上不兼容的问题。

对此有解决方案吗？显然是有的，比如我们可以把它做成一个 `webfont`，更改每一个 `icon component class`，把里面换成字体，达到类似 `iconfont` 的效果，最后再生成一份 `ttf/woff` 等文件上传到自己的 `cdn`去，然后这里再引用即可。

这样小程序体积又小，兼容性也好，就是多了些网络请求罢了,我们自己取舍吧。
