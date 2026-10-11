---
title: Adapted `tailwindcss` plugin
description: 'Although, quite a few tailwindcss plug-ins can be used directly in weapp-tailwindcss.'
keywords:
  - Community
  - template
  - Case
  - Adaptable
  - tailwindcss
  - plug-in
  - plugins
  - weapp-tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
  - templates
  - case studies
  - Adapted
---

# Adapted `tailwindcss` plug-in

Although, quite a few `tailwindcss` plug-ins can be used directly in `weapp-tailwindcss`.

However, the `wxss` subset such as `css` in the mini program does not natively support many `css` writing methods and selectors, so it is inevitable that errors will be reported when using certain plug-ins.

For example, `tailwindcss/typography`, `daisyui`, etc.

So many times it is inevitable to develop migrated/castrated versions of them.

For example, the adapted version of `tailwindcss/typography` is `@weapp-tailwindcss/typography`

And [`IceStack`](https://ui.icebreaker.top/zh-CN/docs/usage) also contains the WeChat applet adaptation of `daisyui`.
