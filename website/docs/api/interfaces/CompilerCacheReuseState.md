---
title: "CompilerCacheReuseState"
description: "CompilerCacheReuseState 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "CompilerCacheReuseState"
  - "CompilerCacheReuseState 接口"
  - "CompilerCacheReuseState 类型定义"
  - "TypeScript"
---

# CompilerCacheReuseState

## 属性

### source

> **source**: `boolean`

是否命中了上一次解析后的 source 指纹。

***

### engine

> **engine**: `boolean`

是否复用了当前 root 的 Tailwind engine 与 Scanner。

***

### output

> **output**: `boolean`

是否命中了没有新增 CSS 的增量结果。
