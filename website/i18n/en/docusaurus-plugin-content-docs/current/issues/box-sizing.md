---
title: Default box model (box-sizing) problem
description: Tailwindcss sets the box model of all elements to border-box by default.
keywords:
  - FAQ
  - Troubleshooting
  - compatibility
  - Default box model
  - box-sizing
  - question
  - issues
  - box sizing
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# Default box model (box-sizing) problem

`Tailwindcss` will set the box model of all elements to `border-box` by default

However, some component libraries, such as `wot-design-uni`, are implemented using `content-box`. Once switched to `border-box`, the height collapses, so some display effects will be disordered.

> `box-sizing: border-box;` This line of style is in 'tailwindcss/base', so if you disable this line of code, it seems to take effect, but this is not a good solution.

If you want to solve the problem from the plug-in level, just make the following changes:

```js
WeappTailwindcss({
// Just add this line of configuration
  cssOptions: {
    cssPreflight: {
      'box-sizing': false,
    },
  },
}),
```

In this way, the `box-sizing` style can be removed, but you will have to evaluate whether the original styles that rely on the box model will be affected:

For example, `w-2`, `h-4` are all potential impacts of the box model.

## Reference documentation

https://tw.weapp.dev/docs/api/options/important#cssoptions

https://github.com/sonofmagic/weapp-tailwindcss/issues/604
