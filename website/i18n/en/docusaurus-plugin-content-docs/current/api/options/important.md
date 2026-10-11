---
title: ✅Important configuration
sidebar_label: ✅Important configuration
sidebar_position: 1
description: '✅ Important configuration: 20 UserDefinedOptions configuration items, including type, default value and source code description.'
keywords:
  - weapp-tailwindcss
  - API
  - Interface documentation
  - Configuration items
  - Mini program
  - tailwindcss
  - WeChat applet
  - Important configuration
  - ✅Important configuration
  - Important configuration Configuration
  - Plug-in parameters
---

This page contains 20 configuration items, sourced from `UserDefinedOptions`.

## Configuration overview

| Configuration item                                                                      | Type                                                        | Default value                                 | Description                                                                                           |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [supportCustomLengthUnits](#supportcustomlengthunits)                                   | <code>boolean                                               | LengthUnitsRuntimeOptions</code>              | —                                                                                                     | Controls Tailwind custom length unit support.           |
| [appType](#apptype)                                                                     | <code>AppType</code>                                        | —                                             | Declares the frame type used.                                                                         |
| [arbitraryValues](#arbitraryvalues)                                                     | <code>IArbitraryValues</code>                               | —                                             | TailwindCSS related configuration of arbitrary values.                                                |
| [unocss](#unocss)                                                                       | <code>boolean                                               | IUnocssCompatibilityOptions</code>            |                                                                                                       |
| [jsPreserveClass](#jspreserveclass)                                                     | <code>(keyword: string) => boolean                          | undefined</code>                              | —                                                                                                     | Control whether JS literals need to be preserved.       |
| [disabled](#disabled)                                                                   | <code>boolean                                               | { plugin?: boolean &#124; undefined; }</code> | —                                                                                                     | Whether to disable this plug-in.                        |
| [replaceRuntimePackages](#replaceruntimepackages)                                       | <code>boolean                                               | Record<string, string></code>                 | —                                                                                                     | Whether to replace the runtime dependency package name. |
| [rewriteCssImports](#rewritecssimports)                                                 | <code>boolean</code>                                        | <code>false</code>                            | Whether to rewrite the Tailwind package entry in CSS to the internal `weapp-tailwindcss` style entry. |
| [customAttributes](#customattributes)                                                   | <code>ICustomAttributes</code>                              | —                                             | Customize the conversion rules for `wxml` label attributes.                                           |
| [customReplaceDictionary](#customreplacedictionary)                                     | <code>Record<string, string></code>                         | <code>MappingChars2String</code>              | Custom class name replacement dictionary.                                                             |
| [generator](#generator)                                                                 |                                                             |
| [ignoreTaggedTemplateExpressionIdentifiers](#ignoretaggedtemplateexpressionidentifiers) | <code>(string                                               | RegExp)[]</code>                              |                                                                                                       |
| [styleInjector](#styleinjector)                                                         | <code>WeappTailwindcssStyleInjectorUserOptions</code>       |                                               |
| [ignoreCallExpressionIdentifiers](#ignorecallexpressionidentifiers)                     | <code>(string                                               | RegExp)[]</code>                              | —                                                                                                     | Ignore identifiers in the specified call expression.    |
| [disabledDefaultTemplateHandler](#disableddefaulttemplatehandler)                       | <code>boolean</code>                                        | <code>false</code>                            | Disable the default `wxml` template replacer.                                                         |
| [tailwindcssBasedir](#tailwindcssbasedir)                                               | <code>string</code>                                         | —                                             | Specifies the path to obtain the Tailwind context.                                                    |
| [cache](#cache)                                                                         | <code>boolean                                               | ICreateCacheReturnType</code>                 | —                                                                                                     | Control cache strategy.                                 |
| [cssOptions](#cssoptions)                                                               |                                                             |
| [tailwindcss](#tailwindcss)                                                             | [`TailwindCssOptions`](../interfaces/TailwindCssOptions.md) | —                                             | Configure Tailwind CSS v4 runtime behavior.                                                           |
| [cssEntries](#cssentries)                                                               | <code>string[]</code>                                       | —                                             | Specify the entry CSS of tailwindcss@4.                                                               |

## Detailed description

### supportCustomLengthUnits

> Optional | Type: `boolean | LengthUnitsRuntimeOptions`

Controls Tailwind custom length unit support.

#### See

https://github.com/sonofmagic/weapp-tailwindcss/issues/110

#### Remark

Tailwind CSS v4 performs type inference for arbitrary values, so an undeclared `rpx` may be recognized as a color. This option is enabled by default and is automatically handled by the build runtime.

### appType

> Optional | Type: `AppType`

Declare the type of frame used.

#### Remark

Used to distinguish the framework running environment. Vite product style relationships will be derived first from build diagrams and real bundle files and should not rely on fixed main style file names.

### arbitraryValues

> Optional | Type: `IArbitraryValues`

TailwindCSS related configuration for any value.

### unocss

> Optional | Type: `boolean | IUnocssCompatibilityOptions` | Default: `false`

Enable some UnoCSS class writing compatibility.

#### Remark

Off by default. Passing in `true` enables Tailwind CSS v4 bare arbitrary value generation. class character escape continues by
`customReplaceDictionary` control, JS translation still follows the `classNameSet` precise hit principle.

See the [UnoCSS writing compatibility guide](/docs/tailwindcss/unocss-compatibility) for supported syntax, limitations, and examples.

#### default value

```ts
false
```

### jsPreserveClass

> Optional | Type: `(keyword: string) => boolean | undefined` | Version: ^2.6.1

Controls whether JS literals need to be retained.

#### Remark

When Tailwind conflicts with JS literals, you can return `true` through the callback to retain the current value, and return `false` or `undefined` to continue escaping. All string literals with `*` are retained by default.

#### Parameters

##### keyword

`string`

#### return

`boolean | undefined`

### disabled

> Optional | Type: `boolean | { plugin?: boolean | undefined; }`

Whether to disable this plugin.

#### Remark

`disabled` is only suitable for builds that do not want plugins involved at all, such as RN, Harmony, standalone native or custom builds.

H5/Web and normal App WebView builds of uni-app / uni-app x / Taro / Mpx / Weapp-vite should generally continue to retain the plugin;
The generator automatically switches to `web` output based on platform environment variables. When the custom environment cannot inject platform variables,
Please prefer setting `generator.target: 'web'` explicitly rather than disabling the plugin.

#### Example

```ts
// Taro RN or other builds that don't want plugins involved at all
import process from 'node:process'

const disabled = process.env.TARO_ENV === 'rn'

import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'

new WeappTailwindcss({
  disabled,
})
```

### replaceRuntimePackages

> Optional | Type: `boolean | Record<string, string>`

Whether to replace the runtime dependency package name.

#### Remark

Suitable for scenarios where the runtime package name needs to be redirected, for example:

- `tailwind-merge`/`class-variance-authority`/`tailwind-variants` cannot be directly installed on the mini program side and needs to be replaced with the built-in weapp version.
- Private images/multi-package releases within the enterprise result in different runtime package names. We hope to unify them to the target package name after conversion.
  Pass in `true` to use the built-in replacement table, or pass in a custom mapping of objects.

#### Example

```ts
replaceRuntimePackages: {
  'tailwind-merge': '@weapp-tailwindcss/merge',
  'class-variance-authority': '@weapp-tailwindcss/cva',
}
```

### rewriteCssImports

> Optional | Type: `boolean` | Default: `false`

Whether to rewrite the Tailwind package entry in CSS to the `weapp-tailwindcss` internal style entry.

#### Remark

Off by default. Tailwind CSS v4 projects should retain the original `@import "tailwindcss"` entry, by
`weapp-tailwindcss` generates target-side CSS based on CSS AST/source results. Only required for compatibility with older projects
Or it is explicitly enabled when a specific framework cannot parse the Tailwind package entry properly.

#### default value

```ts
false
```

### customAttributes

> Optional | Type: `ICustomAttributes`

Customize the conversion rules for the `wxml` tag attribute.

#### Remark

By default, `class` and `hover-class` will be converted on all tags. This configuration allows specifying, via an `Map` or object, an attributed string or regular expression array that needs to be converted for a specific tag.

- Use `'*'` as key to append a common rule for all tags.
- Supports passing in `Map<string | RegExp, (string | RegExp)[]>` to meet complex matching requirements.
- Common scenarios include passing class names through component `prop`, or matching custom properties of third-party components. For more discussions, see [issue#129](https://github.com/sonofmagic/weapp-tailwindcss/issues/129#issuecomment-1340914688) and [issue#134](https://github.com/sonofmagic/weapp-tailwindcss/issues/134#issuecomment-1351288238).
  If the custom rule has overwritten the default `class`/`hover-class`, you can turn on [`disabledDefaultTemplateHandler`](/docs/api/options/important#disableddefaulttemplatehandler) to turn off the built-in template processor.

#### Example

```js
const customAttributes = {
  '*': [/[A-Za-z]?[A-Za-z-]*[Cc]lass/],
  'van-image': ['custom-class'],
  'ice-button': ['testClass'],
}
```

### customReplaceDictionary

> Optional | Type: `Record<string, string>` | Default: `MappingChars2String`

Replacement dictionary for custom class names.

#### Remark

The default strategy maps characters not allowed by the applet into replacement strings of equal length, so the original class name cannot be deduced from the result. For full customization, pass in `Record<string, string>`, just make sure the generated class name doesn't conflict with an existing style. For examples, refer to [dic.ts](https://github.com/sonofmagic/weapp-core/blob/main/packages/escape/src/dic.ts).

#### default value

```ts
MappingChars2String
```

### generator

> Optional | Type: `WeappTailwindcssGeneratorUserOptions`

Controls the strategy for Tailwind CSS to directly generate target-side CSS.

#### Remark

The default value is inferred according to the build environment: `weapp` is used for applet builds, and `web` is used for H5/Web and normal uni-app App WebView.
The uni-app x native App target continues to handle uvue/App constraints via the `uniAppX` configuration and does not require `target: 'app'` configuration.

#### Web Compatibility Mode

`generator.webCompat` for Web/H5 and Tailwind CSS v4 compatibility downgrade under the classic uni-app App WebView target. Automatic inference of `generator.target: "web"` is enabled by default, and the `app` / `app-plus` build of uni-app will also be automatically enabled; if `generator.target` is explicitly configured, the `webCompat` passed in by the user shall prevail.

Passing in `true` is equivalent to `{ preset: "legacy-web" }`. This preset is intended for Web Compact output and is compatible with the baselines `Chrome/91.0.4472.114` and `AppleWebKit/537.36`. It removes or downgrades `@theme`, When you need to keep the official web output of Tailwind CSS, pass in `@layer` or `@property`.

```ts
WeappTailwindcss({
  generator: {
    target: "web",
    webCompat: true,
  },
})
```

### ignoreTaggedTemplateExpressionIdentifiers

> Optional | Type: `(string | RegExp)[]` | Default: `['weappTwIgnore']` | Version: ^4.0.0

Ignore identifiers in the specified label template expression.

#### Remark

When a template string is wrapped with these identifiers, escaping is skipped.

#### default value

```ts
['weappTwIgnore']
```

### styleInjector

> Optional | Type: `WeappTailwindcssStyleInjectorUserOptions` | Default: `false`

Enable build product style entry injection.

#### Remark

Off by default. Passing in `true` is equivalent to enabling empty configuration; when the object is passed in, it will be transparently passed to the built-in
`weapp-style-injector` implementation, configurable `imports`, `perFileImports`, subcontracting style entry and other capabilities.

Vite will automatically select uni-app, Taro or universal preset according to the current `appType`; Webpack will automatically select
`appType` automatically selects uni-app, Taro, Mpx, Weapp-vite or universal presets. When `appType` is not explicitly configured, it will be reused
The inferred result of `weapp-tailwindcss` in the current builder.

When `disabled: true` or `disabled: { plugin: true }`, this ability will be turned off along with the main plug-in.

#### default value

```ts
false
```

### ignoreCallExpressionIdentifiers

> Optional | Type: `(string | RegExp)[]` | Version: ^4.0.0

Ignore identifiers in the specified calling expression.

#### Remark

Template strings or string literals wrapped using these methods will skip escaping and are often used with `@weapp-tailwindcss/merge` (such as `['twMerge', 'twJoin', 'cva']`).

### disabledDefaultTemplateHandler

> Optional | Type: `boolean` | Default: `false` | Version: ^2.6.2

Disable the default `wxml` template replacer.

#### Remark

After enabling, template matching is completely managed by [`customAttributes`](/docs/api/options/important#customattributes), and you need to override the default `class` / `hover-class` and other matching rules yourself.

#### default value

```ts
false
```

### tailwindcssBasedir

> Optional | Type: `string` | Version: ^2.9.3

Specifies the path to obtain the Tailwind context.

#### Remark

In linked or monorepo scenarios, you can manually point to the directory where `package.json` of the target project is located.

### cache

> Optional | Type: `boolean | ICreateCacheReturnType` | Version: ^3.0.11

Control caching policies.

### cssOptions

> Optional | Type: `CssOptions` | Version: ^4.3.4

Fine-tuned configuration of CSS generation and post-processing compatibility.

#### Remark

It is subsequently used to control fine-grained behaviors such as CSS compatibility, variable retention, and rule pruning.
`cssPreflight`, `cssPreflightRange`, `cssChildCombinatorReplaceValue`, `cssPresetEnv`, `autoprefixer`,
`atRules`, `injectAdditionalCssVarScope`, `cssSelectorReplacement`, `rem2rpx`, `px2rpx`, `unitsToPx`,
`unitConversion`, `platform`, `cssRemoveActivePseudoClass`, `cssRemoveHoverPseudoClass`, `cssRemoveFocusPseudoClass`, `cssRemoveProperty`, `cssCalc`
and `tailwindcssV4GradientFallback` are recommended to be placed here.

#### The mini program removes `:active` and `:focus` by default

The applet itself does not support the CSS `:active` and `:focus` pseudo-classes, so `cssOptions.cssRemoveActivePseudoClass` and `cssOptions.cssRemoveFocusPseudoClass` default to `true`. Tailwind CSS v4 will still recognize the corresponding candidate, and the template and JS class names will be converted into safe classes normally, but the final style of the mini program will not include the corresponding selector. Web builds for HTML5 and Apps do not perform this removal.

There is no need to use `@source not inline("active:*")`: `@source not inline()` excludes complete candidates, and `active:*` is not a variant wildcard expression.

If a custom applet runtime does support these pseudo-classes, it can be restored explicitly:

```ts
WeappTailwindcss({
  cssOptions: {
    cssRemoveActivePseudoClass: false,
    cssRemoveFocusPseudoClass: false,
  },
})
```

The same applet compatibility boundary will also delete selectors that depend on browser status such as `focus-visible`, `focus-within`, `disabled`, `enabled`, `checked`, `required`, Structure selectors such as `optional`,

#### Cross-platform conditions for `@custom-variant`

Any `@custom-variant` of Tailwind CSS v4 supports uni-app conditional compilation. The conditional comments are placed inside the variant or wrap the entire variant, and the effect is the same:

```css
@custom-variant active {
  &:active {
    /* #ifndef MP */
    @slot;
    /* #endif */
  }
}
```

```css
/* #ifndef MP */
@custom-variant active {
  &:active {
    @slot;
  }
}
/* #endif */
```

This compatibility does not limit variant names. `active`, `any-hover`, `wx` and other `@custom-variant` customized by the project will be processed according to the target platform. Conditional expressions support `#ifdef`, `#ifndef` and existing uni-app platform aliases.

### tailwindcss

> Optional | Type: [`TailwindCssOptions`](../interfaces/TailwindCssOptions.md) | Version: ^4.0.0

Configure Tailwind CSS v4 runtime behavior.

### cssEntries

> Optional | Type: `string[]` | Version: ^4.2.6

Specify the entry CSS for tailwindcss@4.

#### Remark

Equivalent to setting `tailwindcss.v4.cssEntries`. Tailwind CSS 4 projects should explicitly configure the absolute path of the entry CSS; multiple entries, sub-packaging, independent sub-packaging, Webpack/Gulp/custom builds and multi-platform builds should clearly write these entries. `cssEntries` is only responsible for entry identification, and the entry style files still need to be actually imported by the project or included in the build graph.

Although optional in type, business projects should not rely on portal inference as a long-term configuration contract. Explicit configuration can avoid certain differences in platform product names, CSS merge strategies, or subpackage outputs from causing incomplete Tailwind CSS generation.
