---
title: "✅ 重要配置"
sidebar_label: "✅ 重要配置"
sidebar_position: 1
description: "✅ 重要配置：20 个 UserDefinedOptions 配置项，包含类型、默认值和源码说明。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "重要配置"
  - "✅ 重要配置"
  - "重要配置 配置"
  - "插件参数"
---

本页收录 20 个配置项，来源于 `UserDefinedOptions`。

## 配置一览

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| [supportCustomLengthUnits](#supportcustomlengthunits) | <code>boolean &#124; LengthUnitsRuntimeOptions</code> | — | 控制 Tailwind 自定义长度单位支持。 |
| [appType](#apptype) | <code>AppType</code> | — | 声明所使用的框架类型。 |
| [arbitraryValues](#arbitraryvalues) | <code>IArbitraryValues</code> | — | TailwindCSS 任意值的相关配置。 |
| [unocss](#unocss) | <code>boolean &#124; IUnocssCompatibilityOptions</code> | <code>false</code> | 启用部分 UnoCSS class 写法兼容。 |
| [jsPreserveClass](#jspreserveclass) | <code>(keyword: string) => boolean &#124; undefined</code> | — | 控制 JS 字面量是否需要保留。 |
| [replaceRuntimePackages](#replaceruntimepackages) | <code>boolean &#124; Record<string, string></code> | — | 是否替换运行时依赖包名。 |
| [disabled](#disabled) | <code>boolean &#124; { plugin?: boolean &#124; undefined; }</code> | — | 是否禁用此插件。 |
| [rewriteCssImports](#rewritecssimports) | <code>boolean</code> | <code>false</code> | 是否把 CSS 中的 Tailwind 包入口改写到 `weapp-tailwindcss` 内部样式入口。 |
| [generator](#generator) | <code>WeappTailwindcssGeneratorUserOptions</code> | — | 控制 Tailwind CSS 直接生成目标端 CSS 的策略。 |
| [customAttributes](#customattributes) | <code>ICustomAttributes</code> | — | 自定义 `wxml` 标签属性的转换规则。 |
| [customReplaceDictionary](#customreplacedictionary) | <code>Record<string, string></code> | <code>MappingChars2String</code> | 自定义 class 名称的替换字典。 |
| [styleInjector](#styleinjector) | <code>WeappTailwindcssStyleInjectorUserOptions</code> | <code>false</code> | 开启构建产物样式入口注入。 |
| [ignoreTaggedTemplateExpressionIdentifiers](#ignoretaggedtemplateexpressionidentifiers) | <code>(string &#124; RegExp)[]</code> | <code>['weappTwIgnore']</code> | 忽略指定标签模板表达式中的标识符。 |
| [ignoreCallExpressionIdentifiers](#ignorecallexpressionidentifiers) | <code>(string &#124; RegExp)[]</code> | — | 忽略指定调用表达式中的标识符。 |
| [disabledDefaultTemplateHandler](#disableddefaulttemplatehandler) | <code>boolean</code> | <code>false</code> | 禁用默认的 `wxml` 模板替换器。 |
| [tailwindcssBasedir](#tailwindcssbasedir) | <code>string</code> | — | 指定用于获取 Tailwind 上下文的路径。 |
| [cache](#cache) | <code>boolean &#124; ICreateCacheReturnType</code> | — | 控制缓存策略。 |
| [cssOptions](#cssoptions) | <code>CssOptions</code> | — | CSS 生成与兼容后处理的微调配置。 |
| [tailwindcss](#tailwindcss) | [`TailwindCssOptions`](../interfaces/TailwindCssOptions.md) | — | 配置 Tailwind CSS v4 的运行时行为。 |
| [cssEntries](#cssentries) | <code>string[]</code> | — | 指定 tailwindcss@4 的入口 CSS。 |

## 详细说明

### supportCustomLengthUnits

> 可选 | 类型: `boolean | LengthUnitsRuntimeOptions`

控制 Tailwind 自定义长度单位支持。

#### 参阅

https://github.com/sonofmagic/weapp-tailwindcss/issues/110

#### 备注

Tailwind CSS v4 会对任意值执行类型推断，未声明的 `rpx` 可能被识别为颜色。本选项默认开启，并由构建运行时自动接管。

### appType

> 可选 | 类型: `AppType`

声明所使用的框架类型。

#### 备注

用于区分框架运行环境。Vite 产物样式关系会优先从构建图和真实 bundle 文件中推导，不应依赖固定的主样式文件名。

### arbitraryValues

> 可选 | 类型: `IArbitraryValues`

TailwindCSS 任意值的相关配置。

### unocss

> 可选 | 类型: `boolean | IUnocssCompatibilityOptions` | 默认值: `false`

启用部分 UnoCSS class 写法兼容。

#### 备注

默认关闭。传入 `true` 后会启用 Tailwind CSS v4 裸任意值生成。class 字符转义继续由
`customReplaceDictionary` 控制，JS 转译仍遵循 `classNameSet` 精确命中原则。

#### 默认值

```ts
false
```

### jsPreserveClass

> 可选 | 类型: `(keyword: string) => boolean | undefined` | 版本: ^2.6.1

控制 JS 字面量是否需要保留。

#### 备注

当 Tailwind 与 JS 字面量冲突时，可通过回调返回 `true` 保留当前值，返回 `false` 或 `undefined` 则继续转义。默认保留所有带 `*` 的字符串字面量。

#### 参数

##### keyword

`string`

#### 返回

`boolean | undefined`

### replaceRuntimePackages

> 可选 | 类型: `boolean | Record<string, string>`

是否替换运行时依赖包名。

#### 备注

适用于运行时包名需要重定向的场景，例如：
- 小程序侧无法直接安装 `tailwind-merge`/`class-variance-authority`/`tailwind-variants`，需要替换为内置的 weapp 版本。
- 企业内私有镜像/多包发布导致运行时包名不同，希望在转换后统一到目标包名。
传入 `true` 使用内置替换表，或传入对象自定义映射。

#### 示例

```ts
replaceRuntimePackages: {
  'tailwind-merge': '@weapp-tailwindcss/merge',
  'class-variance-authority': '@weapp-tailwindcss/cva',
}
```

### disabled

> 可选 | 类型: `boolean | { plugin?: boolean | undefined; }`

是否禁用此插件。

#### 备注

`disabled` 只适合完全不希望插件参与的构建，例如 RN、Harmony、独立原生或自定义构建。

uni-app / uni-app x / Taro / Mpx / Weapp-vite 的 H5/Web 与普通 App WebView 构建通常应继续保留插件；
生成器会根据平台环境变量自动切换到 `web` 输出。自定义环境无法注入平台变量时，
请优先显式设置 `generator.target: 'web'`，而不是禁用插件。

#### 示例

```ts
// Taro RN 或其他完全不希望插件参与的构建
import process from 'node:process'

const disabled = process.env.TARO_ENV === 'rn'

import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'

new WeappTailwindcss({
  disabled,
})
```

### rewriteCssImports

> 可选 | 类型: `boolean` | 默认值: `false`

是否把 CSS 中的 Tailwind 包入口改写到 `weapp-tailwindcss` 内部样式入口。

#### 备注

默认关闭。Tailwind CSS v4 项目应保留 `@import "tailwindcss"` 原始入口，由
`weapp-tailwindcss` 基于 CSS AST/source 结果生成目标端 CSS。仅在需要兼容旧项目
或特定框架无法正常解析 Tailwind 包入口时显式开启。

#### 默认值

```ts
false
```

### generator

> 可选 | 类型: `WeappTailwindcssGeneratorUserOptions`

控制 Tailwind CSS 直接生成目标端 CSS 的策略。

#### 备注

默认值会按构建环境推断：小程序构建使用 `weapp`，H5/Web 与普通 uni-app App WebView 使用 `web`。
uni-app x 原生 App 目标继续通过 `uniAppX` 配置处理 uvue/App 约束，不需要配置 `target: 'app'`。

#### Web 兼容模式

`generator.webCompat` 用于 Web/H5 与经典 uni-app App WebView 目标下的 Tailwind CSS v4 兼容降级。自动推断 `generator.target: "web"` 时默认开启，uni-app 的 `app` / `app-plus` 构建也会自动启用；如果显式配置了 `generator.target`，则以用户传入的 `webCompat` 为准。

传入 `true` 等价于 `{ preset: "legacy-web" }`，该预设面向 Web Compact 输出，兼容基线为 `Chrome/91.0.4472.114` 与 `AppleWebKit/537.36`。它会移除或降级 `@theme`、`@layer`、`@property`、嵌套规则、`oklch()`、现代颜色函数与相关 `@supports` 包裹，并补充 `-webkit-background-clip: text`，同时保留 Tailwind CSS v4 的运行时间距变量语义。需要保持 Tailwind CSS 官方 Web 输出时，可传入 `false` 或 `{ preset: "off" }`。

```ts
WeappTailwindcss({
  generator: {
    target: "web",
    webCompat: true,
  },
})
```

### customAttributes

> 可选 | 类型: `ICustomAttributes`

自定义 `wxml` 标签属性的转换规则。

#### 备注

默认会转换所有标签上的 `class` 与 `hover-class`。此配置允许通过 `Map` 或对象为特定标签指定需要转换的属性字符串或正则表达式数组。
- 使用 `'*'` 作为键可为所有标签追加通用规则。
- 支持传入 `Map<string | RegExp, (string | RegExp)[]>` 以满足复杂匹配需求。
- 常见场景包括通过组件 `prop` 传递类名，或对三方组件的自定义属性做匹配，更多讨论见 [issue#129](https://github.com/sonofmagic/weapp-tailwindcss/issues/129#issuecomment-1340914688) 与 [issue#134](https://github.com/sonofmagic/weapp-tailwindcss/issues/134#issuecomment-1351288238)。
如果自定义规则已经覆盖默认的 `class`/`hover-class`，可开启 [`disabledDefaultTemplateHandler`](/docs/api/options/important#disableddefaulttemplatehandler) 以关闭内置模板处理器。

#### 示例

```js
const customAttributes = {
  '*': [/[A-Za-z]?[A-Za-z-]*[Cc]lass/],
  'van-image': ['custom-class'],
  'ice-button': ['testClass'],
}
```

### customReplaceDictionary

> 可选 | 类型: `Record<string, string>` | 默认值: `MappingChars2String`

自定义 class 名称的替换字典。

#### 备注

默认策略会将小程序不允许的字符映射为等长度的替代字符串，因此无法通过结果反推出原始类名。如需完全自定义，可传入 `Record<string, string>`，只需确保生成的类名不会与已有样式冲突。示例参考 [dic.ts](https://github.com/sonofmagic/weapp-core/blob/main/packages/escape/src/dic.ts)。

#### 默认值

```ts
MappingChars2String
```

### styleInjector

> 可选 | 类型: `WeappTailwindcssStyleInjectorUserOptions` | 默认值: `false`

开启构建产物样式入口注入。

#### 备注

默认关闭。传入 `true` 等价于启用空配置；传入对象时会透传给内置
`weapp-style-injector` 实现，可配置 `imports`、`perFileImports`、分包样式入口等能力。

Vite 会按当前 `appType` 自动选择 uni-app、Taro 或通用预设；Webpack 会按当前
`appType` 自动选择 uni-app、Taro、Mpx、Weapp-vite 或通用预设。未显式配置 `appType` 时，会复用
`weapp-tailwindcss` 在当前构建器中的推断结果。

当 `disabled: true` 或 `disabled: { plugin: true }` 时，该能力会跟随主插件一起关闭。

#### 默认值

```ts
false
```

### ignoreTaggedTemplateExpressionIdentifiers

> 可选 | 类型: `(string | RegExp)[]` | 默认值: `['weappTwIgnore']` | 版本: ^4.0.0

忽略指定标签模板表达式中的标识符。

#### 备注

当模板字符串被这些标识符包裹时，将跳过转义处理。

#### 默认值

```ts
['weappTwIgnore']
```

### ignoreCallExpressionIdentifiers

> 可选 | 类型: `(string | RegExp)[]` | 版本: ^4.0.0

忽略指定调用表达式中的标识符。

#### 备注

使用这些方法包裹的模板字符串或字符串字面量会跳过转义，常与 `@weapp-tailwindcss/merge` 配合（如 `['twMerge', 'twJoin', 'cva']`）。

### disabledDefaultTemplateHandler

> 可选 | 类型: `boolean` | 默认值: `false` | 版本: ^2.6.2

禁用默认的 `wxml` 模板替换器。

#### 备注

启用后模板匹配完全交由 [`customAttributes`](/docs/api/options/important#customattributes) 管理，需要自行覆盖默认的 `class` / `hover-class` 等匹配规则。

#### 默认值

```ts
false
```

### tailwindcssBasedir

> 可选 | 类型: `string` | 版本: ^2.9.3

指定用于获取 Tailwind 上下文的路径。

#### 备注

在 linked 或 monorepo 场景下可手动指向目标项目的 `package.json` 所在目录。

### cache

> 可选 | 类型: `boolean | ICreateCacheReturnType` | 版本: ^3.0.11

控制缓存策略。

### cssOptions

> 可选 | 类型: `CssOptions` | 版本: ^4.3.4

CSS 生成与兼容后处理的微调配置。

#### 备注

后续用于控制生成 CSS 的兼容兜底、变量保留、规则修剪等细粒度行为。
`cssPreflight`、`cssPreflightRange`、`cssChildCombinatorReplaceValue`、`cssPresetEnv`、`autoprefixer`、
`atRules`、`injectAdditionalCssVarScope`、`cssSelectorReplacement`、`rem2rpx`、`px2rpx`、`unitsToPx`、
`unitConversion`、`platform`、`cssRemoveActivePseudoClass`、`cssRemoveHoverPseudoClass`、`cssRemoveFocusPseudoClass`、`cssRemoveProperty`、`cssCalc`
与 `tailwindcssV4GradientFallback` 都推荐放在这里。

### tailwindcss

> 可选 | 类型: [`TailwindCssOptions`](../interfaces/TailwindCssOptions.md) | 版本: ^4.0.0

配置 Tailwind CSS v4 的运行时行为。

### cssEntries

> 可选 | 类型: `string[]` | 版本: ^4.2.6

指定 tailwindcss@4 的入口 CSS。

#### 备注

等价于设置 `tailwindcss.v4.cssEntries`。Tailwind CSS 4 项目应显式配置入口 CSS 的绝对路径；多入口、分包、独立分包、Webpack/Gulp/自定义构建和多平台构建都应该写清楚这些入口。`cssEntries` 只负责入口识别，入口样式文件仍然要被项目实际 import 或纳入构建图。

虽然类型上是可选项，但业务项目不应依赖入口推断作为长期配置契约。显式配置可以避免某些平台产物名、CSS 合并策略或分包输出差异导致 Tailwind CSS 生成不完整。
