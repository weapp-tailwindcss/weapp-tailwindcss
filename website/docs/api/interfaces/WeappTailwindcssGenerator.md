---
title: "WeappTailwindcssGenerator"
description: "weapp-tailwindcss 统一生成器实例。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "WeappTailwindcssGenerator"
  - "WeappTailwindcssGenerator 接口"
  - "WeappTailwindcssGenerator 类型定义"
  - "TypeScript"
---

# WeappTailwindcssGenerator

weapp-tailwindcss 统一生成器实例。

## 属性

### generate()

> **generate()**: `(options?: WeappTailwindcssGenerateOptions) => Promise<WeappTailwindcssGenerateResult>`

生成目标 CSS。

#### 参数

##### options?

[`WeappTailwindcssGenerateOptions`](./WeappTailwindcssGenerateOptions.md)

#### 返回

`Promise<WeappTailwindcssGenerateResult>`

***

### source

> **source**: `TailwindV4ResolvedSource`

解析后的 Tailwind v4 source。

#### cwd?

> 可选 | **cwd**: `string`
#### projectRoot

> **projectRoot**: `string`
#### cssSources?

> 可选 | **cssSources**: `TailwindV4CssSource[]`
#### sources?

> 可选 | **sources**: `TailwindV4SourcePattern[]`

***

### dispose()?

> 可选 | **dispose()**: `() => void`

释放生成会话及其缓存。

#### 返回

`void`

***

### loadDesignSystem()

> **loadDesignSystem()**: `() => Promise<TailwindV4DesignSystem>`

#### 返回

`Promise<TailwindV4DesignSystem>`

***

### validateCandidates()

> **validateCandidates()**: `(candidates: Iterable<string>) => Promise<Set<string>>`

#### 参数

##### candidates

`Iterable<string>`

#### 返回

`Promise<Set<string>>`
