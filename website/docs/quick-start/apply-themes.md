---
title: 小程序多主题方案
description: 对于 web 来说，多主题色的需求是非常常见的，比如 暗黑模式 就是一个极其常见的需求，
keywords:
  - 快速开始
  - 安装
  - 配置
  - 小程序多主题方案
  - quick start
  - apply themes
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 小程序多主题方案

## 自由的 web 方案

对于 `web` 来说，多主题色的需求是非常常见的，比如 `暗黑模式` 就是一个极其常见的需求，

`web` 上的解决方案无非就是，通过动态切换 `css` 变量的值达成效果，或者通过 `.dark / [data-theme]` 选择器，包裹暗黑模式下页面和组件的样式，通过增加选择器的优先级，来覆盖默认的样式等等...

那么小程序的方案应该怎么去实现呢？

答案就是有 [page-meta 页面属性配置节点](https://developers.weixin.qq.com/miniprogram/dev/component/page-meta.html) 的情况下，优先使用它的 `page-style` 属性，进行 `css` 变量的切换

没有 `page-meta` 页面属性配置节点的情况下，我们只能通过配置单个 `view` 组件的样式变量，来进行主题色的切换

<!-- ## 目前小程序存在的限制

首先，小程序中是没有 `:root/html` 选择器的，取而代之的是 `page` 标签选择器，因为小程序中 `page` 才是每个页面的根节点。

其次小程序本身都是多页面的，而我们经常写的 `vue/react` 等等`spa`应用都是单页应用(可以做多页，我只是举个大多数的情况，不要钻牛角尖哈)。

而且 `web` 中我们可以通过 `element.style.setProperty` 这样的 `js api` 轻而易举的修改 `css` 变量的值，但是小程序不行，

我们以微信小程序中选取 `wxml` 的 `api`: `wx.createSelectorQuery` 为例，它甚至都无法选中 `page` 标签，更何况即使选中了，目前也没有能力动态的通过 `js api` 的方式去设置`css` 变量的值。

那么我们究竟应该怎么设计方案呢？ -->

## 方案的设计和实现

切换多主题主要依赖 `css` 变量切换，所以我们只要依照这个设计去实现即可

### 1. 页面属性配置节点 page-meta

利用 `page-meta` 页面属性配置节点的 `page-style` 属性，来进行 `css` 变量的切换

另外我们也可以通过 `page-meta` 组件的，来切换一些原生的样式

[page-meta 页面属性配置节点](https://developers.weixin.qq.com/miniprogram/dev/component/page-meta.html)

### 2. 自己实现 css 变量切换组件

首先既然我们无法利用**根**节点的变量切换来达成效果，但是我们可以通过组件的特性，即数据的响应式和插槽来达成效果。

我们可以设计一个 `ConfigProvider` 组件，它拥有一个`dom`节点，内部是一个插槽

其中那个`dom`节点就是我们主题相关变量寄居在的节点，而这个组件往往会作为一个根组件，在每个页面中被使用，去包裹我们真正的业务页面

甚至我们可以再设计一个 `BaseLayout` 这样的组件，去包含每个页面公共的部分，再在其中去引用 `ConfigProvider`，然后做一层插槽的透传即可。

#### 实现

> 这里我以 `vue` 的语法作为示例，因为我个人认为它比 `react` 和 `原生` 更容易让新手看懂

`ConfigProvider`的实现：

```html
<template>
  <view :class="[mode]" :style="styleObj">
    <slot></slot>
  </view>
</template>

<script lang="ts">
import { defineComponent, computed, PropType } from 'vue'
// import store from '@/store'
export default defineComponent({
  props: {
    vars: {
      type: [Object]
    },
    mode: {
      type: [String] as PropType<'light' | 'dark'>,
      default: 'light' // 这里你可以使用 store.state.mode 这样的值来获取用户的配置
    }
  },
  setup(props) {
    const styleObj = computed(() => {
      return Object.assign({}, props.vars)
    })
    return {
      styleObj
    }
  }
})
</script>
```

其中，`mode` 这个 `prop` 用来模拟实现了 `<html data-theme="<theme>" class="<theme>"></html>` 的效果，而 `vars` 则用来模拟实现 `js api` 设置 `css` 变量的效果。

通过这 `2` 个 `props`，你既可以通过 `mode` 的切换，把多个主题以及对应的变量值全部给写在你自己的 `css`中，然后通过切换`mode`，触发样式的覆盖来切换主题，这种是为静态的切换。

又可以通过设置 `vars`的值去动态的覆盖和切换，比如从服务端获取`css`变量的值，然后`set`进组件中，这显然是非常灵活的，这种是为动态的切换。

现在有了这个组件，我们就可以用它去包裹每一个页面了。

然后下一步，自然是要我们的页面和组件，都去应用那些我们设计的 `css` 变量了。

这一块可以参考下方链接中的`动态调整系统主题色(4)`中的`CssVar`方案，里面也有和 `tailwindcss` 相结合的部分，也欢迎阅读`动态调整web系统主题` 系列文章，并与在下进行探讨。

## 动态调整主题参考链接

1. [动态调整web系统主题? 看这一篇就够了](https://icebreaker.top/articles/2021/12/18-flexible-theme)
2. [动态调整web主题(2) 萃取篇](https://icebreaker.top/articles/2022/1/15-custom-theme-2)
3. [动态调整web主题(3): 基于tailwindcss插件的主题色生成方案](https://icebreaker.top/articles/2022/9/26-custom-theme-3)
4. [动态调整系统主题色(4): CssVar 与 Variant 方案的探索](https://icebreaker.top/articles/2023/10/5-custom-theme-4)
