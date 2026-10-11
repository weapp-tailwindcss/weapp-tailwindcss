---
title: ⚙️ General configuration
sidebar_label: ⚙️ General configuration
sidebar_position: 4
description: '⚙️ General configuration: 6 UserDefinedOptions configuration items, including type, default value and source code description.'
keywords:
  - weapp-tailwindcss
  - API
  - Interface documentation
  - Configuration items
  - Mini program
  - tailwindcss
  - WeChat applet
  - General configuration
  - ⚙️ General configuration
  - General configuration configuration
  - Plug-in parameters
---

This page contains 6 configuration items, sourced from `UserDefinedOptions`.

## Configuration overview

| Configuration item                                      | Type                                                                                                                                                                                                   | Default value | Description                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------ |
| [cssSourceTrace](#csssourcetrace)                       | <code>CssSourceTraceUserOptions</code>                                                                                                                                                                 |               |
| [babelParserOptions](#babelparseroptions)               | <code>(Partial<Options> & { cache?: boolean &#124; undefined; cacheKey?: string &#124; undefined; cacheMaxEntries?: number &#124; undefined; cacheMaxSourceLength?: number &#124; undefined; })</code> | —             | Configuration options for `@babel/parser`. |
| [experimentalJsFastPath](#experimentaljsfastpath)       | <code>boolean                                                                                                                                                                                          | "oxc"</code>  | —                                          | Experimental JS translation fast path. |
| [postcssOptions](#postcssoptions)                       | <code>Partial<Omit<Result, "file">></code>                                                                                                                                                             | —             | Configuration options for `postcss`.       |
| [tailwindcssRuntimeOptions](#tailwindcssruntimeoptions) | [`TailwindCssRuntimeOptions`](../interfaces/TailwindCssRuntimeOptions.md)                                                                                                                              | —             | Customize Tailwind CSS runtime parameters. |
| [logLevel](#loglevel)                                   | <code>"info"                                                                                                                                                                                           | "warn"        | "error"                                    | "silent"</code>                        | —   | Control the command line log output level. |

## Detailed description

### cssSourceTrace

> Optional | Type: `CssSourceTraceUserOptions` | Default: `false`

Mark the token source file in the output CSS for tool rules.

#### Remark

Off by default. When turned on, the `tokens: token <= source-file` comment will be inserted before the generated CSS rules.
Used to check which source code file a certain tool class comes from. You can pass in `{ root }` to control the relative path base in the annotation.
This capability is intended for debugging and demo acceptance, and production builds are usually kept turned off to reduce product volume.

#### default value

```ts
false
```

### babelParserOptions

> Optional | Type: `(Partial<Options> & { cache?: boolean | undefined; cacheKey?: string | undefined; cacheMaxEntries?: number | undefined; cacheMaxSourceLength?: number | undefined; })` | Version: ^3.2.0

Configuration options for `@babel/parser`.

### experimentalJsFastPath

> Optional | Type: `boolean | "oxc"`

Experimental JS transpilation fast path.

#### Remark

Currently OXC is only attempted when source maps are turned off on the call side and there are no module graphs, module replacements, ignore call/tag template semantics.
The current release line requires Node `^22.18.0 || >=24.11.0`. OXC will still automatically fall back to Babel when loading fails.

### postcssOptions

> Optional | Type: `Partial<Omit<Result, "file">>` | Version: ^3.2.0

Configuration options for `postcss`.

### tailwindcssRuntimeOptions

> Optional | Type: [`TailwindCssRuntimeOptions`](../interfaces/TailwindCssRuntimeOptions.md)

Customize Tailwind CSS runtime parameters.

### logLevel

> Optional | Type: `"info" | "warn" | "error" | "silent"`

Controls the command line log output level.

#### Remark

The default is `info`, which can be set to `silent` to block all output.
