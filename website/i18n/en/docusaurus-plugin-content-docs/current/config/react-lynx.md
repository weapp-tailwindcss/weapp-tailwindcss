---
title: ReactLynx / Rspeedy Configuration Reference
description: Configuration responsibilities, Rspack loader usage, and Lynx encoder boundaries for ReactLynx, Rspeedy, and @weapp-tailwindcss/lynx.
keywords:
  - ReactLynx
  - Rspeedy
  - Lynx
  - Tailwind CSS 4
  - Rspack
  - CSS loader
  - encoder
  - native CSS
---

# ReactLynx / Rspeedy Configuration Reference

This page explains every Lynx-specific option in `pluginLynxTailwindcss()`. Start with the [ReactLynx / Rspeedy guide](../quick-start/frameworks/lynx) for initial setup.

## Support baseline

- `@weapp-tailwindcss/lynx` `0.3.2`
- `@lynx-js/rspeedy` `>=0.16.0`
- Tailwind CSS `4.x`
- Node.js `>=22.12.0`
- ReactLynx + Rspeedy native builds only; Rspeedy Web, non-React Lynx, and React Native are out of scope

## Minimal configuration

```ts title="lynx.config.ts"
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginReactLynx(), pluginLynxTailwindcss()],
})
```

```css title="src/global.css"
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

The plugin fixes `platform: 'lynx'`, `generator.target: 'web'`, and Lynx-compatible Web CSS output. ReactLynx keeps the original `className`; it does not create mini-program safe classes or a React Native style manifest.

Recursive variables require Lynx runtime 3.6 or later and the exposed template API from ReactLynx plugin 0.12.4 or later. Older builders must be upgraded; native behavior is currently tested on the pinned 4.0.1 matrix.

Before encoding, the plugin uses the ReactLynx builder’s exposed `LynxTemplatePlugin` hooks to default `enableCSSInlineVariables` to `true`. This selects native recursive resolution for nested Tailwind utility variables, preserving explicit page configuration and dynamic dependencies. A missing template API fails the build. The setting does not change `engineVersion` or replace device verification of gradients, shadows, and other effects. The encoding regression uses `engineVersion: '3.9'`; the native matrix uses Lynx `4.0.1`.

## Option index

| Option                                                                | Type                            | Default                | Description                                  |
| --------------------------------------------------------------------- | ------------------------------- | ---------------------- | -------------------------------------------- |
| [`generator`](#generator)                                             | `LynxGeneratorOptions \| false` | Fixed Lynx settings    | Override non-target generator fields         |
| [`rspack`](#rspack)                                                   | `PatchRspackConfigOptions`      | CSS rule patch enabled | Control Rspeedy/Rspack loader patches        |
| [`rspack.cssImportRewriteLoader`](#rspack-cssimportrewriteloader)     | `boolean \| object`             | `true`                 | Inject the Tailwind CSS entry rewrite loader |
| [`rspack.removeLightningCssLoader`](#rspack-removelightningcssloader) | `boolean`                       | `false`                | Remove the built-in Lightning CSS loader     |

The plugin also inherits core [`UserDefinedOptions`](/docs/api/interfaces/UserDefinedOptions). Common fields include `cssEntries`, `cssOptions`, cache, file matchers, and lifecycle callbacks. The adapter owns `platform`, `rewriteCssImports`, `generator.target`, and the Lynx style platform; those fields cannot switch output to mini-program or React Native.

## Option details

### `generator` {#generator}

**Purpose** Adjust generator fields that the Lynx adapter does not fix, such as additional style options. The adapter always overwrites `target: 'web'`, `webCompat: true`, and its internal `cssOptions.platform: 'lynx'`.

**When to use** Usually leave it unset. Use it only for non-target advanced generator options whose effects have been verified in final CSS and encoder logs.

**Usage** Add a non-target generation setting when needed:

```ts
pluginLynxTailwindcss({
  generator: {
    styleOptions: {
      cssOptions: { cssCalc: true },
    },
  },
})
```

**Caution** The Lynx wrapper overwrites `target: 'weapp'` and `webCompat: false` if supplied. In this wrapper, `generator: false` only clears user generator fields; it does not disable the Lynx generation pipeline created by the adapter.

### `rspack` {#rspack}

**Purpose** Pass `PatchRspackConfigOptions` to the Rspeedy Rspack patch, which locates real CSS rules and adjusts loader order.

**When to use** Defaults fit standard Rspeedy. Pass an object only for a custom CSS rule, a replacement loader path, or a verified Lightning CSS conflict.

**Usage** Keep all Rspack details in one object:

```ts
pluginLynxTailwindcss({
  rspack: {
    cssImportRewriteLoader: true,
    removeLightningCssLoader: false,
  },
})
```

**Caution** This object patches matching CSS rules. It does not replace registration of the core generation plugin by `pluginLynxTailwindcss()`.

### `rspack.cssImportRewriteLoader` {#rspack-cssimportrewriteloader}

**Purpose** Inject an entry rewrite loader into the Rspeedy CSS chain so `weapp-tailwindcss` generates Tailwind imports, with `generateCss: true` enforced.

**When to use** Keep the default `true`. Disable it only when the Rspack config already installs an equivalent loader or a custom pipeline explicitly owns Tailwind entry generation.

**Usage** A custom loader path and extra options are supported; the adapter still merges `generateCss: true`:

```ts
rspack: {
  cssImportRewriteLoader: {
    loader: require.resolve('./custom-css-loader.cjs'),
    options: { tailwindcssImportRewriteRuntimeKey: 'lynx-runtime' },
  },
}
```

**Caution** With `false`, the plugin does not compensate for a missing CSS generation entry. Use it only when the module graph already has an explicit replacement.

### `rspack.removeLightningCssLoader` {#rspack-removelightningcssloader}

**Purpose** Remove `builtin:lightningcss-loader` from matching Rspack CSS rules.

**When to use** Keep the default. Enable it only when the encoder or another loader fully replaces Lightning CSS and logs prove that it deletes or corrupts a required rule.

**Usage** Set it under `rspack`:

```ts
rspack: { removeLightningCssLoader: true }
```

**Caution** Removing it changes minification, syntax lowering, and the browser CSS processing chain. It is not a general way to silence warnings; compare the final bundle and device result before and after.

## CSS and candidates

Lynx should normally import theme and utilities only, avoiding unrelated warnings from browser preflight rules such as `:root`, `:host`, and `:where(...)`. Arbitrary values must be complete static candidates:

```tsx
<view className="w-[123px] h-[45rpx] rounded-[18px] bg-[#123456]" />
```

Enumerate complete dynamic states or register them in CSS:

```css
@source inline("w-[120px] w-[240px] bg-[#123456]");
```

Do not construct `w-[${width}px]`; Tailwind cannot know the final token at build time.

## Three evidence layers

| Layer               | Check                                                         | Evidence                                       |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Tailwind generation | The CSS bundle contains the target rule                       | Candidate scanning and generation succeeded    |
| Lynx encoder        | Encoder logs and encoded CSS retain the property and selector | The encoder did not delete the rule            |
| Device runtime      | Android/iOS pixels, layout, and interaction states            | The current Lynx runtime supports the behavior |

`padding-inline`, complex `:is()` / `:where()`, pseudo-elements, hover, dark, data, supports, media queries, and complex gradients must pass all three layers. Generated Tailwind CSS does not replace encoder and device evidence.

## Validation

- Original `className` values remain usable, with no mini-program safe classes or RN manifest.
- The CSS import rewrite loader is in the rule actually used by the build, and Tailwind rules enter the final bundle.
- Encoder warnings are compared against encoded CSS, and unsupported logical properties are replaced by Lynx-compatible physical properties.
- Android and iOS separately verify layout, arbitrary values, pseudo-classes, media queries, and gradients.
