---
title: CreateCompilerOptions
description: User options and bounded root-cache configuration accepted by createCompiler().
keywords:
  - weapp-tailwindcss
  - API
  - createCompiler
  - compiler options
  - TypeScript
  - reference
  - options
  - CreateCompilerOptions
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# CreateCompilerOptions

`CreateCompilerOptions` includes every [`UserDefinedOptions`](./UserDefinedOptions.md) field used by the existing CSS, template, and JavaScript handlers, plus compiler lifecycle options.

## Properties

### cssOptions?

> Optional | **cssOptions**: `CssOptions`

Fine-tuned configuration of CSS generation and post-processing compatibility.

Mini-program compatibility processing preserves `-webkit-font-smoothing` by default, so this project's property-removal policy retains the font-smoothing declarations used by `antialiased` and `subpixel-antialiased`.
`cssOptions.preserveWebkitProperties` (`string[]`) adds exact `-webkit-` property names to preserve. An empty array still retains the default properties.
Names are trimmed and matched without case sensitivity. Invalid names are ignored, and wildcards are not supported.
This option only affects this project's mini-program property-removal policy; it does not control separately registered external plugins such as Autoprefixer.

#### Example

```ts
const options = {
  cssOptions: {
    preserveWebkitProperties: ['-webkit-text-size-adjust'],
  },
}
```

### compiler?

> Optional | **compiler**: `{ maxRoots?: number }`

Compiler-specific lifecycle and cache settings.

#### maxRoots?

> Optional | **maxRoots**: `number`

Maximum number of idle logical root sessions retained by one compiler. Active roots are allowed to finish, then the store returns to this bound. Defaults to `128`.
