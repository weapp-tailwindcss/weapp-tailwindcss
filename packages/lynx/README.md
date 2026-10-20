# @weapp-tailwindcss/lynx

> English | [简体中文](./README.zh-CN.md)

Tailwind CSS 4 integration for ReactLynx and Rspeedy. It invokes `weapp-tailwindcss` through Rspeedy's Rspack lifecycle to produce standard CSS for Lynx, preserves native ReactLynx `className`, and introduces no runtime stylesheet or JSX transform.

This integration requires Node.js `^22.18.0 || >=24.11.0`, covering the adapter and its mandatory core dependency chain. Using the ReactLynx integration requires an installed and registered `@lynx-js/react-rsbuild-plugin` `>=0.12.4`; its optional peer installation flag only avoids installing another builder copy. Recursive CSS variables require Lynx runtime `>=3.6`, separately from the tested Engine version and bundle encoding target.

Stable Tailwind theme tokens may become literals. Web color compatibility may also resolve application variables when lowering modern color expressions. Local, conditional, or priority overrides visible in the current CSS input prevent the affected variables from being treated as static. Overrides from separately compiled stylesheets or inline styles are outside this analysis and cannot change generated literals. Renaming a variable does not guarantee dynamic override behavior.

## Install

```bash
pnpm add @weapp-tailwindcss/lynx tailwindcss
```

## Versions and runtime requirements

The current adapter version is `0.4.4`. The adapter requires Node.js `^22.18.0 || >=24.11.0`, with peer ranges of Rspeedy `>=0.16.0` and Tailwind CSS `>=4.0.0`. Its `weapp-tailwindcss` dependency is currently `5.6.3`, whose dependency chain requires Node.js `^22.18.0 || >=24.11.0`.

The repository fixture pins `@lynx-js/rspeedy` `0.17.2`, `@lynx-js/react-rsbuild-plugin` `0.20.2`, `@lynx-js/react` `0.126.1`, Tailwind CSS `4.3.3`, Lynx Engine `4.0.1`, bundle `engineVersion: '3.9'`, and `@lynx-js/css-defines` `0.0.18`. These versions describe the checked-in regression matrix and do not replace compatibility validation in a consuming project.

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

`pluginLynxTailwindcss` fixes `platform` to `'lynx'`, sets `generator.target` to `'web'`, and enables Lynx-compatible output. Stable Tailwind theme tokens may be resolved at build time, while an application variable override visible in the same CSS keeps its `var()` dependency. Overrides from another stylesheet or an inline style are outside this static analysis guarantee.

Recursive variables require Lynx runtime 3.6 or later and the exposed template API from ReactLynx plugin 0.12.4 or later. Older builders must be upgraded; native behavior is currently tested on the pinned 4.0.1 matrix.

Before template encoding, the plugin defaults `enableCSSInlineVariables` to `true` through the ReactLynx builder’s exposed template hooks. This selects native recursive variable resolution for nested Tailwind utility variables while preserving explicit page configuration and dynamic CSS dependencies. Register `pluginReactLynx()` alongside this plugin; a missing template API is a build error. This does not change the target SDK or guarantee native support for each CSS property.

See the [ReactLynx / Rspeedy configuration reference](https://tw.weapp.dev/docs/config/react-lynx) for the `generator`, `rspack`, CSS loader, and encoder options.

### Build diagnostics

Enable structured Lynx encoder diagnostics when a build needs an auditable compatibility report. The default only emits a warning and report. With `strict: true`, only an unignored rule that is confirmed as a business rule and removed by the encoder becomes a compilation error. Preflight rules, Tailwind default rules, and `unknown` diagnostics never fail strict mode.

```ts
pluginLynxTailwindcss({
  diagnostics: {
    strict: true,
    ignore: [{ property: 'padding-inline', reason: '业务明确接受该平台限制' }],
    onReport(report) {
      console.log(report)
    },
  },
})
```

Reports distinguish raw `encoder-log` records from silent removals found by `bundle-comparison`, with `bundled`, `encoder-rejected`, or `unknown` status. Matching requires unique selector branches, conditions, and declarations. Evidence comes from the emitted build-graph asset in `afterEmit` and binds the bundle, pinned decoder, and input CSS hashes. An ignore must select a selector/property; `reason` is an audit note. Ignored records and removal counts remain in the report.

Original files and positions are provided only when the current build graph source map proves them; synthetic cssId and generated coordinates remain separate. Duplicate branches across entries, repeated declarations, unknown value normalization, incomplete CSS-section decoding, and ambiguous scoped CSS origins remain unproven. Diagnostics do not scan `dist` or equate bundle inclusion with native support.

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

`examples/react-lynx` is a multi-page compatibility lab pinned to Tailwind CSS `4.3.3`, Lynx Engine `4.0.1`, bundle `engineVersion: '3.9'`, and `@lynx-js/css-defines` `0.0.18`. Representative cases cover every official utility family, variant kind, directive, and arbitrary syntax branch.

The static gate parses the real `main.css` with PostCSS, then combines `tasm.json.css.cssMap` with encoder removal logs to record `generated` and `bundled` separately. Native support comes only from committed iOS and Android reports; css-defines is only a version hint.

```bash
pnpm e2e:lynx:android
pnpm e2e:lynx:ios
pnpm e2e:lynx:native
pnpm e2e:lynx:update
```

CI uses Android API 30 with a Pixel 2 x86_64 runner and iOS 18.5 with an iPhone 16 Pro simulator. Each CI run and committed report carries its own run identity and original artifacts.

The committed native baseline records `verifiedAt: 2026-10-19T15:13:36.717Z` and `catalogHash: 2e3a1a60517c13de507d22ef8b4d209ffcdb86b2dfbf5bf7100df35c40dc3fec`. Its Android report is from `sdk_phone_x86_64` (Android 11/API 30, x86_64), and its iOS report is from `LynxCompatibility` (iPhone 16 Pro, iOS 18.5, arm64). A baseline update requires complete reports from both platforms for the same catalog and Engine version.

`--capture-only` is an explicitly targeted bundle capture mode that writes screenshots/video for inspection. It does not create or update native support reports and cannot replace CI or committed-baseline evidence.
