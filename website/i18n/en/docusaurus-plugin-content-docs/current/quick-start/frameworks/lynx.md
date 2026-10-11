---
title: ReactLynx / Rspeedy
description: Integrate Tailwind CSS 4 and weapp-tailwindcss into a ReactLynx and Rspeedy project.
keywords:
  - Lynx
  - ReactLynx
  - Rspeedy
  - Tailwind CSS 4
  - weapp-tailwindcss
  - quick start
  - installation
  - configuration
  - frameworks
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
---

# ReactLynx / Rspeedy

`@weapp-tailwindcss/lynx` uses Rspeedy's Rspack lifecycle to generate standard CSS that Lynx can consume. It preserves ReactLynx's native `className` and does not introduce a runtime stylesheet or JSX transform.

See the [ReactLynx / Rspeedy configuration reference](../../config/react-lynx) for options, fixed fields, and encoder boundaries.

## Install

```bash npm2yarn
npm install -D @weapp-tailwindcss/lynx tailwindcss
```

The integration requires Node.js `^22.18.0 || >=24.11.0`, Rspeedy `>=0.16.0`, and Tailwind CSS `>=4.0.0`. It currently supports only ReactLynx projects built with Rspeedy.

## Register the Rspeedy plugin

```ts title="lynx.config.ts"
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginReactLynx(), pluginLynxTailwindcss()],
})
```

The plugin fixes `platform` to `'lynx'`, sets `generator.target` to `'web'`, and enables Lynx-compatible output. Tailwind CSS 4 theme variables are resolved at build time, while application-defined dynamic CSS variables remain unchanged.

## Configure the Tailwind CSS entry

Import Tailwind CSS 4 from the application CSS entry and use `@source` to point to the actual source files. Lynx does not need browser preflight, so importing only theme and utilities avoids most Rspeedy warnings about browser-only rules.

```css title="src/global.css"
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

You can then use ReactLynx's native `className` directly:

```tsx
<view className="flex items-center justify-center bg-sky-500 p-6">
  <text className="text-lg font-bold text-white">weapp-tailwindcss + Lynx</text>
</view>
```

## Arbitrary values and dynamic class names

An arbitrary value must appear as a complete static string in a file covered by `@source`:

```tsx
<view className="h-[45rpx] w-[123px] rounded-[18px] bg-[#123456] p-[13px]" />
```

Do not construct `w-[${width}px]` at runtime. Enumerate complete class names instead, or register candidates explicitly in CSS:

```css
@source inline("w-[120px] w-[240px] bg-[#123456]");
```

Tailwind successfully generating CSS does not mean Lynx supports every property and selector. The current Lynx encoder removes unsupported properties such as `padding-inline` and `mask-type`, as well as selectors containing complex `:is()` or `:where()` expressions. Prefer physical-direction utilities such as `pl-*` and `pr-*` for horizontal padding. Validate pseudo-elements, interaction states, media queries, and complex visual effects on the target runtime.

## Build warnings

A full `@import "tailwindcss"` includes browser preflight. Rspeedy may report and remove Lynx-incompatible rules such as `:root`, `:host`, `:where(...)`, and `::file-selector-button`.

- For browser-only preflight warnings, use the theme and utilities imports shown above.
- For warnings caused by a property or selector emitted for an application utility, change the Tailwind expression instead of merely ignoring the warning.

## Validation and example

The complete repository example is available under [`examples/react-lynx`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/examples/react-lynx) for project structure and CSS entry reference. Your Rspeedy project should use its own development or build command.

`examples/react-lynx` is pinned to Tailwind CSS `4.3.3`, Lynx Engine `4.0.1`, bundle `engineVersion: '3.9'`, and `@lynx-js/css-defines` `0.0.16`. Representative cases cover every official utility family, variant kind, directive, and arbitrary syntax branch.

The static gate records Tailwind generation and Lynx encoder retention separately. Cross-platform support is determined only by runtime reports from Pixel 7/API 35 and iPhone 16 Pro/iOS 18.5; css-defines cannot replace runtime evidence:

In your own Android and iOS targets, verify:

- Tailwind rules enter the bundle and the encoder does not unexpectedly remove target utilities or selectors.
- Runtime layout, pseudo-classes, media queries, gradients, and arbitrary values match expectations.
- Unsupported properties, complex selectors, and device differences are recorded explicitly; a successful generation step does not replace runtime validation.

The current integration only covers ReactLynx + Rspeedy build targets. It does not cover Rspeedy Web output, non-React Lynx frameworks, or React Native-style runtime style mapping.
