# @weapp-tailwindcss/lynx

> English | [简体中文](./README.zh-CN.md)

Tailwind CSS 4 integration for ReactLynx and Rspeedy. It invokes `weapp-tailwindcss` through Rspeedy's Rspack lifecycle to produce standard CSS for Lynx, preserves native ReactLynx `className`, and introduces no runtime stylesheet or JSX transform.

## Install

```bash
pnpm add @weapp-tailwindcss/lynx tailwindcss
```

## Configure

```ts
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginReactLynx(), pluginLynxTailwindcss()],
})
```

Import Tailwind CSS 4 from the application CSS entry and point `@source` at the actual source files. Lynx does not need browser preflight, so importing only theme and utilities avoids most compatibility warnings:

```css
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

`pluginLynxTailwindcss` fixes `platform` to `'lynx'`, sets `generator.target` to `'web'`, and enables Lynx-compatible output. Tailwind CSS 4 theme variables are resolved at build time, while application-defined dynamic variables remain unchanged.

Recursive variables require Lynx runtime 3.6 or later and the exposed template API from ReactLynx plugin 0.12.4 or later. Older builders must be upgraded; native behavior is currently tested on the pinned 4.0.1 matrix.

Before template encoding, the plugin defaults `enableCSSInlineVariables` to `true` through the ReactLynx builder’s exposed template hooks. This selects native recursive variable resolution for nested Tailwind utility variables while preserving explicit page configuration and dynamic CSS dependencies. Register `pluginReactLynx()` alongside this plugin; a missing template API is a build error. This does not change the target SDK or guarantee native support for each CSS property.

See the [ReactLynx / Rspeedy configuration reference](https://tw.weapp.dev/docs/config/react-lynx) for the `generator`, `rspack`, CSS loader, and encoder options.

The current integration supports ReactLynx + Rspeedy and Tailwind CSS 4. It does not cover Rspeedy Web output, non-React Lynx frameworks, or React Native-style runtime style mapping.

## Arbitrary values

Lynx keeps the original `className`; class names are not escaped as they are for mini app targets. Arbitrary values must appear as complete static strings in files covered by `@source`:

```tsx
<view className="h-[45rpx] w-[123px] rounded-[18px] bg-[#123456] p-[13px]" />
```

Do not construct arbitrary values at runtime. Enumerate complete class names or register candidates explicitly:

```css
@source inline("w-[120px] w-[240px] bg-[#123456]");
```

Tailwind generating CSS does not guarantee support from Lynx's native CSS parser. The current encoder removes unsupported properties such as `padding-inline` and `mask-type`, as well as complex selectors containing `:is()` or `:where()`. Use physical-direction utilities such as `pl-*` and `pr-*` when needed, and validate pseudo-elements, interaction states, media queries, and visual effects on the target runtime.

Using the full `@import "tailwindcss"` also includes browser preflight. Prefer the theme and utilities entry above when Rspeedy reports unsupported browser selectors.

## Validate

```bash
pnpm --filter @weapp-tailwindcss/lynx test
pnpm e2e:lynx
```

`examples/react-lynx` is a multi-page compatibility lab pinned to Tailwind CSS `4.3.3`, Lynx Engine `4.0.1`, bundle `engineVersion: '3.9'`, and `@lynx-js/css-defines` `0.0.16`. Representative cases cover every official utility family, variant kind, directive, and arbitrary syntax branch.

The static gate parses the real `main.css` with PostCSS, then combines `tasm.json.css.cssMap` with encoder removal logs to record `generated` and `bundled` separately. Native support comes only from committed iOS and Android reports; css-defines is only a version hint.

```bash
pnpm e2e:lynx:android
pnpm e2e:lynx:ios
pnpm e2e:lynx:native
pnpm e2e:lynx:update
```

The native hosts are pinned to Pixel 7/API 35 x86_64 and iPhone 16 Pro/iOS 18.5. The updater requires complete reports from both platforms for the same catalog and Engine version. Missing results, regressions, and newly supported behavior all require explicit review.
