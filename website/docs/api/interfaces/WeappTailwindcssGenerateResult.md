---
title: "WeappTailwindcssGenerateResult"
description: "weapp-tailwindcss 生成器的输出结果。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "WeappTailwindcssGenerateResult"
  - "WeappTailwindcssGenerateResult 接口"
  - "WeappTailwindcssGenerateResult 类型定义"
  - "TypeScript"
---

# WeappTailwindcssGenerateResult

weapp-tailwindcss 生成器的输出结果。

## 属性

### css

> **css**: `string`

转换后的 CSS。

***

### rawCss

> **rawCss**: `string`

Tailwind 原始输出 CSS。

***

### incrementalCss?

> 可选 | **incrementalCss**: `string`

本次增量新增的转换后 CSS。

***

### incrementalRawCss?

> 可选 | **incrementalRawCss**: `string`

本次增量新增的 Tailwind 原始 CSS。

***

### target

> **target**: `"weapp" | "web"`

实际生成目标。

***

### classSet

> **classSet**: `Set<string>`

***

### rawCandidates

> **rawCandidates**: `Set<string>`

***

### dependencies

> **dependencies**: `string[]`

***

### sources

> **sources**: `TailwindV4SourcePattern[]`

***

### root

> **root**: `TailwindV4CompiledSourceRoot`
