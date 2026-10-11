---
title: Mini program multi-theme solution
description: 'For the web, the need for multiple theme colors is very common. For example, dark mode is an extremely common need.'
keywords:
  - quick start
  - Install
  - Configuration
  - Mini program multi-theme solution
  - apply themes
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
  - installation
  - Mini
  - program
  - multi-theme
---

# Mini program multi-theme solution

## Free web solution

For `web`, the need for multiple theme colors is very common. For example, `dark mode` is an extremely common need.

The solution on `web` is nothing more than to dynamically switch the value of the `css` variable to achieve the effect, or use the `.dark / [data-theme]` selector to wrap the style of the page and components in dark mode, and increase the priority of the selector to override the default style, etc...

So how should the small program solution be implemented?

The answer is that when there is a [page-meta page attribute configuration node] (https://developers.weixin.qq.com/miniprogram/dev/component/page-meta.html), its `page-style` attribute is used first to switch the `css` variable.

Without the `page-meta` page attribute configuration node, we can only switch the theme color by configuring the style variable of a single `view` component.

<!-- ## Current limitations of mini programs

First of all, there is no `:root/html` selector in the mini program. It is replaced by the `page` tag selector, because `page` is the root node of each page in the mini program.

Secondly, the small programs themselves are multi-page, and the applications we often write, such as

Moreover, in `web` we can easily modify the value of the `element.style.setProperty` variable through `js api` such as `css`, but the applet cannot.

Let's take `wxml`:

So how should we design the plan? -->

## Design and implementation of the solution

Switching multiple themes mainly relies on `css` variable switching, so we only need to implement it according to this design

### 1. Page attribute configuration node page-meta

Use the `page-meta` page attribute to configure the `page-style` attribute of the node to switch the `css` variable

In addition, we can also switch some native styles through the `page-meta` component

[page-meta page attribute configuration node](https://developers.weixin.qq.com/miniprogram/dev/component/page-meta.html)

### 2. Implement css variable switching component yourself

First of all, since we cannot use the variable switching of the **root** node to achieve the effect, we can achieve the effect through the characteristics of the component, that is, the responsiveness and slots of the data.

We can design an `ConfigProvider` component that has an `dom` node and a slot inside

The `dom` node is the node where our theme-related variables reside, and this component is often used as a root component in each page to wrap our real business page

We can even design a component like `BaseLayout` to include the common parts of each page, then reference `ConfigProvider` in it, and then do a layer of slot transparent transmission.

#### accomplish

> Here I use the syntax of `vue` as an example because I personally think it is easier for novices to understand than `react` and `Native`

Implementation of `ConfigProvider`:

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
default: 'light' // Here you can use a value like store.state.mode to get the user's configuration
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

Among them, `mode`, `prop`, is used to simulate the effect of `<html data-theme="<theme>" class="<theme>"></html>`, while `vars` is used to simulate the effect of `js api` setting the `css` variable.

Through these `2` `props`, you can write multiple themes and corresponding variable values in your own `mode` by switching `css`, and then switch the theme by switching `mode` to trigger the override of the style. This is a static switching.

You can also dynamically override and switch by setting the value of

Now that we have this component, we can use it to wrap each page.

Then the next step is to naturally apply the `css` variables we designed to our pages and components.

For this section, you can refer to the `Dynamically adjust system theme color(4)` solution in `CssVar` in the link below. There are also parts that are combined with `tailwindcss`. You are also welcome to read the `Dynamic adjustmentwebSystem theme` series of articles and discuss them below.

## Dynamically adjust theme reference links

1. [Dynamicly adjust the web system theme? Just read this article] (https://icebreaker.top/articles/2021/12/18-flexible-theme)
2. [Dynamic adjustment of web themes (2) Extraction] (https://icebreaker.top/articles/2022/1/15-custom-theme-2)
3. [Dynamic adjustment of web themes (3): Theme color generation scheme based on tailwindcss plug-in] (https://icebreaker.top/articles/2022/9/26-custom-theme-3)
4. [Dynamic adjustment of system theme color (4): Exploration of CssVar and Variant solutions] (https://icebreaker.top/articles/2023/10/5-custom-theme-4)
