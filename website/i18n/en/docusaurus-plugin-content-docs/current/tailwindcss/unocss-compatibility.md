---
title: UnoCSS writing compatibility
description: Enable selected UnoCSS class-writing patterns in weapp-tailwindcss and understand the supported boundaries.
keywords:
  - weapp-tailwindcss
  - unocss
  - tailwindcss
  - mini program
  - class
  - arbitrary values
  - escape
  - bg-#fff
  - p-10%
  - text-rgb
---

# UnoCSS writing compatibility

`weapp-tailwindcss` still uses Tailwind CSS as the style generation engine. The `unocss` option only enables compatibility with selected common UnoCSS class-writing patterns and is disabled by default.

## 1. Enable the option

```ts
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

export default {
  plugins: [
    WeappTailwindcss({
      unocss: true,
    }),
  ],
}
```

It enables two related behaviors:

| Capability                      | Description                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bare arbitrary value generation | Passes candidates such as `p-10%`, `bg-#fff`, and `text-rgb(255,0,0)` through the Tailwind CSS v4 generation pipeline.                                                  |
| Class-name escaping             | Continues to use the existing `customReplaceDictionary` escape pipeline, which turns characters such as `:`, `[`, and `#` into mini-program-safe characters by default. |

> Note: JS transformation still follows the exact `classNameSet` matching rule and does not make heuristic guesses for ordinary strings.

## 2. Supported patterns

With `unocss: true`, the Tailwind CSS v4 generation pipeline recognizes patterns such as:

| Type                      | Examples                                                                          |
| ------------------------- | --------------------------------------------------------------------------------- |
| Size and spacing          | `p-10%`, `p-2.5px`, `m-4rem`, `w-100px`, `h-50vh`, `m-10rpx`, `rounded-10px`      |
| Colors                    | `bg-#fff`, `text-#f00`, `border-#123456`, `from-#123`, `via-#456`, `to-#789`      |
| Function values           | `text-rgb(255,0,0)`, `bg-rgba(0,0,0,0.5)`, `w-calc(100%-1rem)`, `bg-var(--brand)` |
| Some variant combinations | `hover:!-mt-2rem`, `dark:bg-#000`, `group-hover:bg-#fff`                          |

Tailwind's existing arbitrary-value syntax remains available:

```html
<view class="w-[10%] bg-[#fff] text-[rgb(255,0,0)]"></view>
```

## 3. Unsupported patterns

The `unocss` option is not a UnoCSS engine and does not load UnoCSS presets. These patterns are outside the current compatibility scope:

| Pattern          | Reason                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| `i-carbon-add`   | UnoCSS Icons preset syntax; Tailwind CSS does not generate the corresponding icon rule. |
| `~mt-2/4`        | UnoCSS/Windi shortcut syntax is not expanded.                                           |
| `bg-$color`      | This variable shorthand is not supported.                                               |
| `sm:-top-1.5rem` | The mini-program target filters unsupported responsive variants.                        |

## 4. Custom escaping

Use `customReplaceDictionary` when characters such as `:`, `[`, or `#` need custom replacements:

```ts
WeappTailwindcss({
  unocss: true,
  customReplaceDictionary: {
    ':': '-c-',
  },
})
```

This keeps class escaping under the single `customReplaceDictionary` configuration entry.
