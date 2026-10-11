---
title: "CompilerGenerateRequest"
description: "CompilerGenerateRequest 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "CompilerGenerateRequest"
  - "CompilerGenerateRequest 接口"
  - "CompilerGenerateRequest 类型定义"
  - "TypeScript"
---

# CompilerGenerateRequest

## 属性

### styleOptions?

> 可选 | **styleOptions**: `Partial<IStyleHandlerOptions>`

传给小程序 CSS 兼容转换器的额外配置。

***

### id

> **id**: `string`

调用方定义的逻辑样式 root ID；core 不会规范化该值。

***

### target?

> 可选 | **target**: [`CompilerTarget`](./CompilerTarget.md)

***

### source?

> 可选 | **source**: `TailwindV4ResolvedSource`

#### cwd?

> 可选 | **cwd**: `string`
#### projectRoot

> **projectRoot**: `string`
#### cssSources?

> 可选 | **cssSources**: `TailwindV4CssSource[]`
#### sources?

> 可选 | **sources**: `TailwindV4SourcePattern[]`

***

### sourceOptions?

> 可选 | **sourceOptions**: `TailwindV4SourceOptions`

***

### incrementalCache?

> 可选 | **incrementalCache**: `boolean`

是否启用增量生成缓存。

***

### bareArbitraryValues?

> 可选 | **bareArbitraryValues**: `boolean | { units?: string[]; }`

是否启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。

***

### scanSources?

> 可选 | **scanSources**: `boolean | TailwindV4SourcePattern[]`

是否扫描文件系统中的源码入口。

***

### candidates?

> 可选 | **candidates**: `Iterable<string>`

***

### sources?

> 可选 | **sources**: `TailwindV4CandidateSource[]`
