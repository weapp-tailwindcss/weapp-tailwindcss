---
title: "Compiler"
description: "Compiler 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "Compiler"
  - "Compiler 接口"
  - "Compiler 类型定义"
  - "TypeScript"
---

# Compiler

## 属性

### createSnapshot()

> **createSnapshot()**: `(request: CreateCompilerSnapshotRequest) => CompilerSnapshot`

#### 参数

##### request

[`CreateCompilerSnapshotRequest`](./CreateCompilerSnapshotRequest.md)

#### 返回

[`CompilerSnapshot`](./CompilerSnapshot.md)

***

### dispose()

> **dispose()**: `() => Promise<void>`

#### 返回

`Promise<void>`

***

### finalizeCss()

> **finalizeCss()**: `(css: string, options?: FinalizeMiniProgramCssOptions) => string`

#### 参数

##### css

`string`

##### options?

`any`

#### 返回

`string`

***

### finalizeCssRoot()

> **finalizeCssRoot()**: `(root: Root, options?: FinalizeMiniProgramCssOptions) => Root`

#### 参数

##### root

`Root`

##### options?

`any`

#### 返回

`Root`

***

### generate()

> **generate()**: `(request: CompilerGenerateRequest) => Promise<CompilerGenerateResult>`

#### 参数

##### request

[`CompilerGenerateRequest`](./CompilerGenerateRequest.md)

#### 返回

`Promise<CompilerGenerateResult>`

***

### invalidate()

> **invalidate()**: `(ids: Iterable<string>) => readonly string[]`

#### 参数

##### ids

`Iterable<string>`

#### 返回

`readonly string[]`

***

### mergeSnapshots()

> **mergeSnapshots()**: `(snapshots: Iterable<CompilerSnapshot>) => CompilerSnapshot`

#### 参数

##### snapshots

`Iterable<CompilerSnapshot>`

#### 返回

[`CompilerSnapshot`](./CompilerSnapshot.md)

***

### remove()

> **remove()**: `(id: string) => Promise<void>`

#### 参数

##### id

`string`

#### 返回

`Promise<void>`

***

### transformCss()

> **transformCss()**: `(css: string, snapshot: CompilerSnapshot, options?: CompilerCssTransformOptions) => Promise<PostcssResult<Root | Document>>`

#### 参数

##### css

`string`

##### snapshot

[`CompilerSnapshot`](./CompilerSnapshot.md)

##### options?

[`CompilerCssTransformOptions`](./CompilerCssTransformOptions.md)

#### 返回

`Promise<PostcssResult<Document | Root>>`

***

### transformCssRoot()

> **transformCssRoot()**: `(root: Root, snapshot: CompilerSnapshot, options?: CompilerCssTransformOptions) => Promise<PostcssResult<Root>>`

#### 参数

##### root

`Root`

##### snapshot

[`CompilerSnapshot`](./CompilerSnapshot.md)

##### options?

[`CompilerCssTransformOptions`](./CompilerCssTransformOptions.md)

#### 返回

`Promise<PostcssResult<Root>>`

***

### transformJavaScript()

> **transformJavaScript()**: `(source: string, snapshot: CompilerSnapshot, options?: CreateJsHandlerOptions) => Promise<JsHandlerResult>`

#### 参数

##### source

`string`

##### snapshot

[`CompilerSnapshot`](./CompilerSnapshot.md)

##### options?

`CreateJsHandlerOptions`

#### 返回

`Promise<JsHandlerResult>`

***

### transformTemplate()

> **transformTemplate()**: `(source: string, snapshot: CompilerSnapshot, options?: CompilerTemplateTransformOptions) => Promise<string>`

#### 参数

##### source

`string`

##### snapshot

[`CompilerSnapshot`](./CompilerSnapshot.md)

##### options?

[`CompilerTemplateTransformOptions`](./CompilerTemplateTransformOptions.md)

#### 返回

`Promise<string>`
