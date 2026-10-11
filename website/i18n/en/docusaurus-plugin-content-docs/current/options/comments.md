---
title: Exact conversion and ignoring in js
description: >-
  By default, all tailwindcss runtime tool classes appearing in jsx, js, wxml, and wxss are converted. If conversion is
  not required, you can use the weappTwIgnore identifier to ignore it:
keywords:
  - Configuration items
  - Plug-in parameters
  - Options
  - js
  - Exact conversion and ignoring in
  - comments
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
  - plugin options
  - configuration
  - Exact
---

# Exact conversion and ignoring in js

By default, all `jsx` runtime tool classes appearing in `js`, `wxml`, `wxss`, and

For example:

```js
<view :class="classArray">classArray</view>

// weappTwIgnore is String.raw, so its result is the result of the following string
const weappTwIgnore = String.raw
const classArray = [
  'text-[30rpx]',
  weappTwIgnore`bg-[#00ff00]`
]

```

At this time, only `'text-[30rpx]'` will be converted, and `'bg-[#00ff00]'` will be ignored.

> By default, only tag templates that are directly related to `weappTwIgnore` will be ignored, such as renaming after importing from a package, or aliasing all the way in the same file. The simple `String.raw` alias will continue to participate in translation to prevent accidental killing.

If you need to customize an alias, you can wrap a function and explicitly add the alias to the configuration, for example:

```js
const alias = (...args) => String.raw(...args)
// Add 'alias' to ignoreTaggedTemplateExpressionIdentifiers
```

Or directly use the `ignoreTaggedTemplateExpressionIdentifiers` configuration to append other identifiers.
