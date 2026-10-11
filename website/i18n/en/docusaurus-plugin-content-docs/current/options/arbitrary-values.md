---
title: Use arbitrary values
description: Arbitrary values are a core Tailwind CSS v4 capability for cross-platform styles.
keywords:
  - Configuration items
  - Plug-in parameters
  - Options
  - use
  - arbitrary
  - values
  - arbitrary values
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
  - plugin options
  - configuration
---

# Use arbitrary values

`arbitrary values` are a core Tailwind CSS v4 capability. With a CSS-first entry, you can use typed arbitrary values in templates and `@apply`.

for example:

```html
<view :class="[flag?'bg-red-900':'bg-[#fafa00]']">bg-[#fafa00]</view>
<view :class="{'bg-[#098765]':flag===true}">bg-[#098765]</view>
<view class="p-[20px] -mt-2 !mb-[-20px] ">p-[20px] -mt-2 mb-[-20px] margin jit cannot be written like this -m-[20px]</view>
<view class="space-y-[1.6rem]">
  <view class="w-[300rpx] text-black text-opacity-[0.19]">w-[300rpx] text-black text-opacity-[0.19]</view>
  <view class="min-w-[300rpx] max-h-[100px] text-[20px] leading-[0.9]">min-w-[300rpx] max-h-[100px] text-[20px] leading-[0.9]</view>
  <view class="max-w-[300rpx] min-h-[100px] text-[#dddddd]">max-w-[300rpx] min-h-[100px] text-[#dddddd]</view>
  <view class="flex items-center justify-center h-[100px] w-[100px] rounded-[40px] bg-[#123456] bg-opacity-[0.54] text-[#ffffff]">Hello</view>
  <view class="border-[10px] border-[#098765] border-solid border-opacity-[0.44]">border-[10px] border-[#098765] border-solid border-opacity-[0.44]</view>
  <view class="grid grid-cols-3 divide-x-[10px] divide-[#010101] divide-solid">
    <view>1</view>
    <view>2</view>
    <view>3</view>
  </view>
</view>
```

or `@apply`

```html
<template><view class="hello">world</view></template>
<style lang="scss">
.hello {
  @apply flex items-center justify-center h-[100px] w-[100px] rounded-[40px] bg-[#123456] bg-opacity-[0.54] text-[#ffffff] #{!important};
}
</style>
```

See [tailwindcss/using-arbitrary-values chapter](https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values) for details
