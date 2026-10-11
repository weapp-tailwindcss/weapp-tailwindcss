---
title: "CompilerCssTransformOptions"
description: "CompilerCssTransformOptions 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "CompilerCssTransformOptions"
  - "CompilerCssTransformOptions 接口"
  - "CompilerCssTransformOptions 类型定义"
  - "TypeScript"
---

# CompilerCssTransformOptions

## 属性

### isMainChunk?

> 可选 | **isMainChunk**: `boolean`

***

### cssPreflight?

> 可选 | **cssPreflight**: `CssPreflightOptions`

***

### cssInjectPreflight()?

> 可选 | **cssInjectPreflight()**: `InjectPreflight`

#### 返回

`IPropValue[]`

***

### escapeMap?

> 可选 | **escapeMap**: `Record<string, string>`

***

### finalize?

> 可选 | **finalize**: `boolean`

是否在样式兼容转换后执行小程序 CSS 最终化。

***

### appType?

> 可选 | **appType**: `PostcssAppType`

***

### ctx?

> 可选 | **ctx**: `{ variablesScopeWeakMap: WeakMap<object, any>; isVariablesScope: (rule: WeakKey) => boolean; markVariablesScope: (rule: WeakKey) => void; }`

***

### postcssOptions?

> 可选 | **postcssOptions**: `Partial<Omit<Result, "file">>`

***

### cssOptions?

> 可选 | **cssOptions**: `CssOptions`

***

### uniAppX?

> 可选 | **uniAppX**: `boolean`

***

### uniAppXCssTarget?

> 可选 | **uniAppXCssTarget**: `"uvue"`

uni-app x 的 CSS 输出目标；`uvue` 表示原生 uvue/nvue 样式链路，未设置时按 WebView CSS 处理。

***

### uniAppXUnsupported?

> 可选 | **uniAppXUnsupported**: `UniAppXUnsupportedMode`

***

### majorVersion?

> 可选 | **majorVersion**: `4`
