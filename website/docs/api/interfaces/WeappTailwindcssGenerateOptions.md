---
title: "WeappTailwindcssGenerateOptions"
description: "weapp-tailwindcss 生成器的调用配置。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "WeappTailwindcssGenerateOptions"
  - "WeappTailwindcssGenerateOptions 接口"
  - "WeappTailwindcssGenerateOptions 类型定义"
  - "TypeScript"
---

# WeappTailwindcssGenerateOptions

weapp-tailwindcss 生成器的调用配置。

## 属性

### target?

> 可选 | **target**: [`WeappTailwindcssGeneratorTarget`](./WeappTailwindcssGeneratorTarget.md)

生成目标。`weapp` 输出小程序兼容 CSS，`web` 保留 Web 形态，`tailwind` 返回 Tailwind 原始输出。

***

### styleOptions?

> 可选 | **styleOptions**: `Partial<IStyleHandlerOptions>`

传给小程序 CSS 兼容转换器的额外配置。

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
