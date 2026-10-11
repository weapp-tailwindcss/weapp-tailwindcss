---
title: UnoCSS 写法兼容
description: 说明如何在 weapp-tailwindcss 中开启部分 UnoCSS class 写法兼容，以及当前支持边界。
keywords:
  - weapp-tailwindcss
  - unocss
  - tailwindcss
  - 小程序
  - class
  - arbitrary values
  - 裸任意值
  - 写法兼容
  - 小程序转义
  - bg-#fff
  - p-10%
  - text-rgb
---

# UnoCSS 写法兼容

`weapp-tailwindcss` 仍然使用 Tailwind CSS 作为样式生成引擎。`unocss` 配置只负责兼容一部分常见的 UnoCSS class 写法，默认关闭。

## 1. 启用方式

```ts
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

export default {
  plugins: [
    WeappTailwindcss({
      unocss: true,
    }),
  ],
}
```

开启后会同时做两件事：

| 能力 | 说明 |
| --- | --- |
| 裸任意值生成 | 将 `p-10%`、`bg-#fff`、`text-rgb(255,0,0)` 等候选交给 Tailwind CSS v4 运行时生成链路处理。 |
| class 名称转义 | 继续使用 `weapp-tailwindcss` 现有的 `customReplaceDictionary` 转义链路，例如默认会把 `:`、`[`、`#` 转为小程序安全字符。 |

> 注意：JS 转译仍然遵循 `classNameSet` 精确命中原则，不会对普通字符串做启发式猜测。

## 2. 支持的写法

开启 `unocss: true` 后，Tailwind CSS v4 生成链路可以识别下面这类写法：

| 类型 | 示例 |
| --- | --- |
| 尺寸与间距 | `p-10%`、`p-2.5px`、`m-4rem`、`w-100px`、`h-50vh`、`m-10rpx`、`rounded-10px` |
| 颜色 | `bg-#fff`、`text-#f00`、`border-#123456`、`from-#123`、`via-#456`、`to-#789` |
| 函数值 | `text-rgb(255,0,0)`、`bg-rgba(0,0,0,0.5)`、`w-calc(100%-1rem)`、`bg-var(--brand)` |
| 部分变体组合 | `hover:!-mt-2rem`、`dark:bg-#000`、`group-hover:bg-#fff` |

原本 Tailwind 支持的任意值写法仍然可用：

```html
<view class="w-[10%] bg-[#fff] text-[rgb(255,0,0)]"></view>
```

## 3. 当前不支持的写法

`unocss` 配置不是 UnoCSS 引擎，也不会加载 UnoCSS preset。下面这些写法不属于当前兼容范围：

| 写法 | 原因 |
| --- | --- |
| `i-carbon-add` | 这是 UnoCSS Icons preset 语法，Tailwind CSS 不会生成对应图标规则。 |
| `~mt-2/4` | 这是 UnoCSS/Windi shortcut 风格，当前不会展开。 |
| `bg-$color` | 当前不支持这种变量简写。 |
| `sm:-top-1.5rem` | 小程序目标会过滤不支持的响应式变体。 |

## 4. 自定义转义规则

需要自定义 `:`、`[`、`#` 等 class 字符替换时，使用 `customReplaceDictionary`：

```ts
WeappTailwindcss({
  unocss: true,
  customReplaceDictionary: {
    ':': '-c-',
  },
})
```

这样可以确保 class 转义只有 `customReplaceDictionary` 一个配置入口。
