---
title: "CompilerTemplateTransformOptions"
description: "CompilerTemplateTransformOptions 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "CompilerTemplateTransformOptions"
  - "CompilerTemplateTransformOptions 接口"
  - "CompilerTemplateTransformOptions 类型定义"
  - "TypeScript"
---

# CompilerTemplateTransformOptions

## 属性

### keepEOL?

> 可选 | **keepEOL**: `boolean`

***

### customAttributesEntities?

> 可选 | **customAttributesEntities**: `ICustomAttributesEntities`

***

### escapeMap?

> 可选 | **escapeMap**: `Record<string, string>`

***

### inlineWxs?

> 可选 | **inlineWxs**: `boolean`

***

### jsHandler()?

> 可选 | **jsHandler()**: `JsHandler`

#### 参数

##### rawSource

`string`

##### set?

`Set<string>`

##### options?

`CreateJsHandlerOptions`

#### 返回

`JsHandlerResult`

***

### disabledDefaultTemplateHandler?

> 可选 | **disabledDefaultTemplateHandler**: `boolean`

***

### quote?

> 可选 | **quote**: `string | null`

***

### ignoreHead?

> 可选 | **ignoreHead**: `boolean`

***

### wrapExpression?

> 可选 | **wrapExpression**: `boolean`

***

### filename?

> 可选 | **filename**: `string`

当前正在转换的模板模块标识。
