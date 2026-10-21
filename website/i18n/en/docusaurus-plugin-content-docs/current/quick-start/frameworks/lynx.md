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

This integration requires Node.js `^22.18.0 || >=24.11.0`, covering the adapter and its mandatory core dependency chain. Using the ReactLynx integration requires an installed and registered `@lynx-js/react-rsbuild-plugin` `>=0.12.4`; its optional peer installation flag only avoids installing another builder copy. Recursive CSS variables require Lynx runtime `>=3.6`, separately from the tested Engine version and bundle encoding target.

Stable Tailwind theme tokens may become literals. Web color compatibility may also resolve application variables when lowering modern color expressions. Local, conditional, or priority overrides visible in the current CSS input prevent the affected variables from being treated as static. Overrides from separately compiled stylesheets or inline styles are outside this analysis and cannot change generated literals. Renaming a variable does not guarantee dynamic override behavior.

All `@property` registrations, descriptors, and variable dependencies are preserved. The public theme prefix can also produce `--tw-*` names, so the prefix cannot establish ownership. Default compatibility matches explicitly recorded full signatures; conflicting or conditional registrations receive no global defaults. Global defaults do not emulate arbitrary registration semantics. The target must still support registered properties. Preserving the input and verifying it in browsers do not establish Lynx native support.

## Install

```bash npm2yarn
npm install -D @weapp-tailwindcss/lynx tailwindcss
```

The current `@weapp-tailwindcss/lynx` adapter is `0.4.4` and requires Node.js `^22.18.0 || >=24.11.0`. Its `weapp-tailwindcss` core dependency is `5.6.3`, whose dependency chain requires Node.js `^22.18.0 || >=24.11.0`. The adapter peers on Rspeedy `>=0.16.0` and Tailwind CSS `>=4.0.0`, and supports only ReactLynx projects built with Rspeedy.

The repository fixture and regression matrix pin Rspeedy `0.17.2`, ReactLynx plugin `0.20.2`, ReactLynx runtime `0.126.1`, Tailwind CSS `4.3.3`, Lynx Engine `4.0.1`, bundle `engineVersion: '3.9'`, and `@lynx-js/css-defines` `0.0.18`.

## Register the Rspeedy plugin

```ts title="lynx.config.ts"
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginReactLynx(), pluginLynxTailwindcss()],
})
```

The plugin fixes `platform` to `'lynx'`, sets `generator.target` to `'web'`, and enables Lynx-compatible output. Stable Tailwind theme tokens may be resolved at build time, while a variable override visible in the same CSS keeps its `var()` dependency. Overrides from another stylesheet or an inline style are outside this static analysis guarantee.

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

## Build diagnostics

Configure `diagnostics` to receive an encoder compatibility report. The default only emits a warning; `strict: true` turns an unignored rule into a compilation error only when it is confirmed as a business rule removed during encoding. Preflight rules, Tailwind default rules, and `unknown` diagnostics never fail strict mode.

```ts
pluginLynxTailwindcss({
  diagnostics: {
    strict: true,
    ignore: [{ property: 'padding-inline' }],
    onReport: report => console.log(report),
  },
})
```

Reports consume CSS and encoder data from the Rspack/Rspeedy lifecycle, do not scan `dist`, and do not equate bundle inclusion with native support. See the [configuration reference](../../config/react-lynx#diagnostics) for the complete API.

## Validation and example

The complete repository example is available under [`examples/react-lynx`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/examples/react-lynx) for project structure and CSS entry reference. Your Rspeedy project should use its own development or build command.

`examples/react-lynx` is pinned to Tailwind CSS `4.3.3`, Lynx Engine `4.0.1`, bundle `engineVersion: '3.9'`, and `@lynx-js/css-defines` `0.0.18`. Representative cases cover every official utility family, variant kind, directive, and arbitrary syntax branch.

The static gate records Tailwind generation and Lynx encoder retention separately. CI defaults to Android API 30 on a Pixel 2 x86_64 runner and iOS 18.5 on an iPhone 16 Pro simulator. Each CI run and committed report carries its own run identity and original artifacts. The committed baseline has `verifiedAt` `2026-10-21T06:20:28.946Z` and `catalogHash` `97e4233f84730caa481b9d2ececfe854e22e300e0ef75394ef211f543544b076`; its reports come from Android `sdk_phone_x86_64` (Android 11/API 30, x86_64) and `LynxCompatibility` (iPhone 16 Pro, iOS 18.5, arm64). css-defines cannot replace runtime evidence.

`--capture-only` captures screenshots/video only after an explicit bundle and target device are supplied. It does not update a native support report or committed baseline.

In your own Android and iOS targets, verify:

- Tailwind rules enter the bundle and the encoder does not unexpectedly remove target utilities or selectors.
- Runtime layout, pseudo-classes, media queries, gradients, and arbitrary values match expectations.
- Unsupported properties, complex selectors, and device differences are recorded explicitly; a successful generation step does not replace runtime validation.

The current integration only covers ReactLynx + Rspeedy build targets. It does not cover Rspeedy Web output, non-React Lynx frameworks, or React Native-style runtime style mapping.
