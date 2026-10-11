---
title: 默认盒模型(box-sizing)问题
description: Tailwindcss 默认会把所有的元素的盒模型，设置为 border-box
keywords:
  - 常见问题
  - 故障排查
  - 兼容性
  - 默认盒模型
  - box-sizing
  - 问题
  - issues
  - box sizing
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 默认盒模型(box-sizing)问题

`Tailwindcss` 默认会把所有的元素的盒模型，设置为 `border-box`

但是一些组件库，比如 `wot-design-uni`，实现使用的是 `content-box` ，一切换到 `border-box` 高度塌陷了， 所以会导致部分显示效果错乱。

> `box-sizing: border-box;` 这行样式是在 'tailwindcss/base' 中的，所以你禁用这行代码，感觉上生效了，但是这样不是很好的解决方案。

假如你要从插件层面解决问题，只要做出如下修改:

```js
WeappTailwindcss({
  // 添加这一行配置即可
  cssOptions: {
    cssPreflight: {
      'box-sizing': false,
    },
  },
}),
```

这样就可以把 `box-sizing` 这个样式给去掉，但是你这样就要去评估原先那些依赖盒模型的样式是否会受到影响：

比如 `w-2`, `h-4` 都是盒子模型潜在的影响。

## 参考文档

https://tw.weapp.dev/docs/api/options/important#cssoptions

https://github.com/sonofmagic/weapp-tailwindcss/issues/604
