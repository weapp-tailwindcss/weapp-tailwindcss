---
title: "CreateCompilerOptions"
description: "CreateCompilerOptions 的类型说明，列出公开属性、参数和使用边界。"
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "接口文档"
  - "配置项"
  - "小程序"
  - "tailwindcss"
  - "微信小程序"
  - "CreateCompilerOptions"
  - "CreateCompilerOptions 接口"
  - "CreateCompilerOptions 类型定义"
  - "TypeScript"
---

# CreateCompilerOptions

## 0.重要配置

### supportCustomLengthUnits?

> 可选 | **supportCustomLengthUnits**: `boolean | LengthUnitsRuntimeOptions`

控制 Tailwind 自定义长度单位支持。

#### 参阅

https://github.com/sonofmagic/weapp-tailwindcss/issues/110

#### 备注

Tailwind CSS v4 会对任意值执行类型推断，未声明的 `rpx` 可能被识别为颜色。本选项默认开启，并由构建运行时自动接管。

***

### appType?

> 可选 | **appType**: `AppType`

声明所使用的框架类型。

#### 备注

用于区分框架运行环境。Vite 产物样式关系会优先从构建图和真实 bundle 文件中推导，不应依赖固定的主样式文件名。

***

### arbitraryValues?

> 可选 | **arbitraryValues**: `IArbitraryValues`

TailwindCSS 任意值的相关配置。

***

### unocss?

> 可选 | **unocss**: `boolean | IUnocssCompatibilityOptions`

启用部分 UnoCSS class 写法兼容。

#### 备注

默认关闭。传入 `true` 后会启用 Tailwind CSS v4 裸任意值生成。class 字符转义继续由
`customReplaceDictionary` 控制，JS 转译仍遵循 `classNameSet` 精确命中原则。

#### 默认值

```ts
false
```

***

### jsPreserveClass()?

> 可选 | **jsPreserveClass()**: `((keyword: string) => boolean | undefined)`

控制 JS 字面量是否需要保留。

#### 添加于

^2.6.1

#### 备注

当 Tailwind 与 JS 字面量冲突时，可通过回调返回 `true` 保留当前值，返回 `false` 或 `undefined` 则继续转义。默认保留所有带 `*` 的字符串字面量。

#### 参数

##### keyword

`string`

#### 返回

`boolean | undefined`

***

### replaceRuntimePackages?

> 可选 | **replaceRuntimePackages**: `boolean | Record<string, string>`

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

***

### disabled?

> 可选 | **disabled**: `boolean | { plugin?: boolean | undefined; }`

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

***

### rewriteCssImports?

> 可选 | **rewriteCssImports**: `boolean`

是否把 CSS 中的 Tailwind 包入口改写到 `weapp-tailwindcss` 内部样式入口。

#### 备注

默认关闭。Tailwind CSS v4 项目应保留 `@import "tailwindcss"` 原始入口，由
`weapp-tailwindcss` 基于 CSS AST/source 结果生成目标端 CSS。仅在需要兼容旧项目
或特定框架无法正常解析 Tailwind 包入口时显式开启。

#### 默认值

```ts
false
```

***

### generator?

> 可选 | **generator**: `WeappTailwindcssGeneratorUserOptions`

控制 Tailwind CSS 直接生成目标端 CSS 的策略。

#### 备注

默认值会按构建环境推断：小程序构建使用 `weapp`，H5/Web 与普通 uni-app App WebView 使用 `web`。
uni-app x 原生 App 目标继续通过 `uniAppX` 配置处理 uvue/App 约束，不需要配置 `target: 'app'`。

***

### customAttributes?

> 可选 | **customAttributes**: `ICustomAttributes`

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

***

### customReplaceDictionary?

> 可选 | **customReplaceDictionary**: `Record<string, string>`

自定义 class 名称的替换字典。

#### 备注

默认策略会将小程序不允许的字符映射为等长度的替代字符串，因此无法通过结果反推出原始类名。如需完全自定义，可传入 `Record<string, string>`，只需确保生成的类名不会与已有样式冲突。示例参考 [dic.ts](https://github.com/sonofmagic/weapp-core/blob/main/packages/escape/src/dic.ts)。

#### 默认值

```ts
MappingChars2String
```

***

### styleInjector?

> 可选 | **styleInjector**: `WeappTailwindcssStyleInjectorUserOptions`

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

***

### ignoreTaggedTemplateExpressionIdentifiers?

> 可选 | **ignoreTaggedTemplateExpressionIdentifiers**: `(string | RegExp)[]`

忽略指定标签模板表达式中的标识符。

#### 添加于

^4.0.0

#### 备注

当模板字符串被这些标识符包裹时，将跳过转义处理。

#### 默认值

```ts
['weappTwIgnore']
```

***

### ignoreCallExpressionIdentifiers?

> 可选 | **ignoreCallExpressionIdentifiers**: `(string | RegExp)[]`

忽略指定调用表达式中的标识符。

#### 添加于

^4.0.0

#### 备注

使用这些方法包裹的模板字符串或字符串字面量会跳过转义，常与 `@weapp-tailwindcss/merge` 配合（如 `['twMerge', 'twJoin', 'cva']`）。

***

### disabledDefaultTemplateHandler?

> 可选 | **disabledDefaultTemplateHandler**: `boolean`

禁用默认的 `wxml` 模板替换器。

#### 添加于

^2.6.2

#### 备注

启用后模板匹配完全交由 [`customAttributes`](/docs/api/options/important#customattributes) 管理，需要自行覆盖默认的 `class` / `hover-class` 等匹配规则。

#### 默认值

```ts
false
```

***

### tailwindcssBasedir?

> 可选 | **tailwindcssBasedir**: `string`

指定用于获取 Tailwind 上下文的路径。

#### 添加于

^2.9.3

#### 备注

在 linked 或 monorepo 场景下可手动指向目标项目的 `package.json` 所在目录。

***

### cache?

> 可选 | **cache**: `boolean | ICreateCacheReturnType`

控制缓存策略。

#### 添加于

^3.0.11

***

### cssOptions?

> 可选 | **cssOptions**: `CssOptions`

CSS 生成与兼容后处理的微调配置。

#### 添加于

^4.3.4

#### 备注

后续用于控制生成 CSS 的兼容兜底、变量保留、规则修剪等细粒度行为。
`cssPreflight`、`cssPreflightRange`、`cssChildCombinatorReplaceValue`、`cssPresetEnv`、`autoprefixer`、
`atRules`、`injectAdditionalCssVarScope`、`cssSelectorReplacement`、`rem2rpx`、`px2rpx`、`unitsToPx`、
`unitConversion`、`platform`、`cssRemoveActivePseudoClass`、`cssRemoveHoverPseudoClass`、`cssRemoveFocusPseudoClass`、`cssRemoveProperty`、`cssCalc`
与 `tailwindcssV4GradientFallback` 都推荐放在这里。

***

### tailwindcss?

> 可选 | **tailwindcss**: [`TailwindCssOptions`](./TailwindCssOptions.md)

配置 Tailwind CSS v4 的运行时行为。

#### 添加于

^4.0.0

***

### cssEntries?

> 可选 | **cssEntries**: `string[]`

指定 tailwindcss@4 的入口 CSS。

#### 添加于

^4.2.6

#### 备注

等价于设置 `tailwindcss.v4.cssEntries`。Tailwind CSS 4 项目应显式配置入口 CSS 的绝对路径；多入口、分包、独立分包、Webpack/Gulp/自定义构建和多平台构建都应该写清楚这些入口。`cssEntries` 只负责入口识别，入口样式文件仍然要被项目实际 import 或纳入构建图。

虽然类型上是可选项，但业务项目不应依赖入口推断作为长期配置契约。显式配置可以避免某些平台产物名、CSS 合并策略或分包输出差异导致 Tailwind CSS 生成不完整。

## 1.文件匹配

### htmlMatcher()?

> 可选 | **htmlMatcher()**: `((name: string) => boolean)`

匹配需要处理的 `wxml` 等模板文件。

#### 参数

##### name

`string`

#### 返回

`boolean`

***

### cssMatcher()?

> 可选 | **cssMatcher()**: `((name: string) => boolean)`

匹配需要处理的 `wxss` 等样式文件。

#### 参数

##### name

`string`

#### 返回

`boolean`

***

### jsMatcher()?

> 可选 | **jsMatcher()**: `((name: string) => boolean)`

匹配需要处理的编译后 `js` 文件。

#### 参数

##### name

`string`

#### 返回

`boolean`

***

### transform?

> 可选 | **transform**: `TransformOptions`

控制哪些源码模块或产物需要进入 `weapp-tailwindcss` 转译流程。

#### 备注

该配置只影响 `weapp-tailwindcss` 的 HTML/CSS/JS 转译，不影响 Tailwind CSS `@source`/content token 扫描。
Vite 构建中 JS chunk 会基于 Rollup `moduleIds`/`modules` 判断源码模块；当一个 JS chunk 不满足 `include` 或所有源码模块都命中 `exclude` 时，跳过该 chunk 的 JS AST 转译。
HTML/CSS asset 会优先基于 Rollup `originalFileName`/`originalFileNames` 判断，缺失时使用输出文件名兜底。
`exclude` 优先级高于 `include`；多来源产物只有全部来源都命中 `exclude` 时才整体跳过。

#### 示例

```ts
transform: {
  include: ['src/**.{wxml,js,ts,vue,css,scss}'],
  exclude: ['src/generated/**', /\/openapi\//],
}
```

***

### mainCssChunkMatcher()?

> 可选 | **mainCssChunkMatcher()**: `((name: string, appType?: AppType) => boolean)`

声明负责承载 Tailwind CSS 全局变量作用域的 CSS Bundle。

#### 备注

默认不根据框架、平台或文件名推断主样式。需要主样式语义时，应由用户按当前构建图中的真实产物名显式返回 `true`。
可结合 `appType`、环境变量或框架配置自行区分不同端。

#### 参数

##### name

`string`

##### appType?

`AppType`

#### 返回

`boolean`

***

### wxsMatcher()?

> 可选 | **wxsMatcher()**: `((name: string) => boolean)`

匹配各端的 `wxs`/`sjs`/`.filter.js` 文件。

#### 备注

配置前请确保在 `tailwind.config.js` 的 `content` 中包含对应格式。

#### 默认值

```ts
()=>false
```

#### 参数

##### name

`string`

#### 返回

`boolean`

***

### inlineWxs?

> 可选 | **inlineWxs**: `boolean`

是否转义 `wxml` 中的内联 `wxs`。

#### 备注

使用前同样需要在 `tailwind.config.js` 中声明 `wxs` 格式。

#### 默认值

```ts
false
```

#### 示例

```html
<!-- index.wxml -->
<wxs module="inline">
// 我是内联wxs
// 下方的类名会被转义
  var className = "after:content-['我是className']"
  module.exports = {
    className: className
  }
</wxs>
<wxs src="./index.wxs" module="outside"/>
<view><view class="{{inline.className}}"></view><view class="{{outside.className}}"></view></view>
```

## 2.生命周期

### onLoad()?

> 可选 | **onLoad()**: `(() => void)`

插件 `apply` 初始调用时触发。

#### 返回

`void`

***

### onStart()?

> 可选 | **onStart()**: `(() => void)`

开始处理前触发。

#### 返回

`void`

***

### onUpdate()?

> 可选 | **onUpdate()**: `((filename: string, oldVal: string, newVal: string) => void)`

匹配并修改文件后触发。

#### 参数

##### filename

`string`

##### oldVal

`string`

##### newVal

`string`

#### 返回

`void`

***

### onEnd()?

> 可选 | **onEnd()**: `(() => void)`

结束处理时触发。

#### 返回

`void`

## 3.一般配置

### cssSourceTrace?

> 可选 | **cssSourceTrace**: `CssSourceTraceUserOptions`

在输出 CSS 中为工具类规则标注 token 来源文件。

#### 备注

默认关闭。开启后会在生成的 CSS 规则前插入 `tokens: token <= source-file` 注释，
用于排查某条工具类来自哪个源码文件。可传入 `{ root }` 控制注释里的相对路径基准。
该能力面向调试与 demo 验收，生产构建通常保持关闭以减少产物体积。

#### 默认值

```ts
false
```

***

### babelParserOptions?

> 可选 | **babelParserOptions**: `(Partial<Options> & { cache?: boolean | undefined; cacheKey?: string | undefined; cacheMaxEntries?: number | undefined; cacheMaxSourceLength?: number | undefined; })`

`@babel/parser` 的配置选项。

#### 添加于

^3.2.0

***

### experimentalJsFastPath?

> 可选 | **experimentalJsFastPath**: `boolean | "oxc"`

实验性 JS 转译快路径。

#### 备注

bundler watch/serve 链路默认在关闭 source map，且没有模块图、模块替换或 ignore 调用语义时尝试 OXC；普通 build 默认使用 Babel，避免同时加载双解析器。配置了标签模板 ignore 且源码含标签模板时回退 Babel。可显式传入 `true` 或 `'oxc'` 强制尝试，传入 `false` 可关闭。
Babel 8 链路要求 Node `^22.18.0 || >=24.11.0`。OXC 加载失败时仍会自动回退到 Babel。

***

### postcssOptions?

> 可选 | **postcssOptions**: `Partial<Omit<Result, "file">>`

`postcss` 的配置选项。

#### 添加于

^3.2.0

***

### tailwindcssRuntimeOptions?

> 可选 | **tailwindcssRuntimeOptions**: [`TailwindCssRuntimeOptions`](./TailwindCssRuntimeOptions.md)

自定义 Tailwind CSS 运行时参数。

***

### logLevel?

> 可选 | **logLevel**: `"info" | "warn" | "error" | "silent"`

控制命令行日志输出级别。

#### 备注

默认 `info`，可设置为 `silent` 屏蔽全部输出。

## 属性

### compiler?

> 可选 | **compiler**: `{ maxRoots?: number | undefined; onRootEvicted?: ((id: string) => void) | undefined; }`
