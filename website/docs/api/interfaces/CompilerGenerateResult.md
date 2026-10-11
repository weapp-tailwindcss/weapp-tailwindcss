---
title: "CompilerGenerateResult"
description: "CompilerGenerateResult 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "CompilerGenerateResult"
  - "CompilerGenerateResult 接口"
  - "CompilerGenerateResult 类型定义"
  - "TypeScript"
---

# CompilerGenerateResult

## 属性

### cache

> **cache**: `Readonly<CompilerCacheReuseState>`

#### source

> **source**: `boolean`

是否命中了上一次解析后的 source 指纹。
#### engine

> **engine**: `boolean`

是否复用了当前 root 的 Tailwind engine 与 Scanner。
#### output

> **output**: `boolean`

是否命中了没有新增 CSS 的增量结果。

***

### classSet

> **classSet**: `ReadonlySet<string>`

***

### dependencies

> **dependencies**: `readonly string[]`

***

### rawCandidates

> **rawCandidates**: `ReadonlySet<string>`

***

### revision

> **revision**: `number`

***

### snapshot

> **snapshot**: [`CompilerSnapshot`](./CompilerSnapshot.md)

#### classSet

> **classSet**: `ReadonlySet<string>`
#### dependencies

> **dependencies**: `readonly string[]`
#### roots

> **roots**: `readonly CompilerSnapshotRoot[]`
#### sources

> **sources**: `readonly TailwindV4SourcePattern[]`
#### target

> **target**: [`CompilerTarget`](./CompilerTarget.md)

***

### sources

> **sources**: `readonly TailwindV4SourcePattern[]`

***

### target

> **target**: [`CompilerTarget`](./CompilerTarget.md)

***

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

### root

> **root**: `TailwindV4CompiledSourceRoot`
