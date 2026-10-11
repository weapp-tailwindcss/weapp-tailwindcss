---
title: "WeappTailwindcssPostcssPluginOptions"
description: "weapp-tailwindcss PostCSS 插件配置。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "WeappTailwindcssPostcssPluginOptions"
  - "WeappTailwindcssPostcssPluginOptions 接口"
  - "WeappTailwindcssPostcssPluginOptions 类型定义"
  - "TypeScript"
---

# WeappTailwindcssPostcssPluginOptions

`weapp-tailwindcss` PostCSS 插件配置。

## 属性

### projectRoot?

> 可选 | **projectRoot**: `string`

***

### base?

> 可选 | **base**: `string`

***

### css?

> 可选 | **css**: `string`

***

### packageName?

> 可选 | **packageName**: `string`

***

### generator?

> 可选 | **generator**: `WeappTailwindcssPostcssGeneratorUserOptions`

生成器配置，用于控制目标端和 Tailwind 配置路径。

***

### config?

> 可选 | **config**: `string`

Tailwind 配置文件路径。

***

### postcssPlugin?

> 可选 | **postcssPlugin**: `string`

Tailwind PostCSS 插件名称。

***

### candidates?

> 可选 | **candidates**: `Iterable<string>`

额外传入的候选类名。

***

### scanSources?

> 可选 | **scanSources**: `boolean`

是否扫描 Tailwind v4 源码入口中的候选类名。

***

### sources?

> 可选 | **sources**: `TailwindCandidateSource[]`

额外传入的 Tailwind v4 内联候选来源。

***

### styleOptions?

> 可选 | **styleOptions**: `Partial<IStyleHandlerOptions>`

传给小程序 CSS 兼容转换器的额外配置。
