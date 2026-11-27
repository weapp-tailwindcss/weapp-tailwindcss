---
title: Web direct use
description: Use weapp-tailwindcss directly in pure Web/Vite projects to generate browser-native Tailwind CSS.
keywords:
  - Web
  - H5
  - Vite
  - Tailwind CSS
  - weapp-tailwindcss
  - generator target web
  - cssEntries
  - Browser native CSS
  - Web direct use
  - vite plugin
---

# Web direct use

`weapp-tailwindcss` can be used directly in pure web projects. It is suitable for small programs and H5/Web to share the same set of Tailwind CSS generated links, or for verifying browser native output in ordinary Vite Web projects.

## Install dependencies

If the project has already installed `tailwindcss` and `weapp-tailwindcss`, you can skip this step.

```bash npm2yarn
npm install -D tailwindcss weapp-tailwindcss
```

## Prepare CSS entry

Entry CSS still has to be actually imported by the web project. `cssEntries` is only responsible for allowing `weapp-tailwindcss` to stably read `@import "tailwindcss"`, `@source` and `@config` in this entry, and will not replace Vite to generate CSS assets.

```ts title="src/main.ts"
import './style.css'
```

```css title="src/style.css"
@import "tailwindcss";

@source "./**/*.{html,js,ts,jsx,tsx,vue}";
```

## Register Vite plugin

The dedicated Web entry fixes an explicit `target: 'web'` and keeps the official Tailwind CSS generation semantics by default, including modern colors, cascade layers, nesting, and browser selectors. Framework presets and platform-inferred Web targets retain the previous `legacy-web` compatibility default. uni-app H5 keeps that compatibility default even with an explicit `generator.target: 'web'`, so pass `generator.webCompat: false` when official output semantics are required there. Set `generator.webCompat: true` when an older WebView needs the downgrade.

Use `generator.webCompat.policy` when an older WebView only needs selected capabilities lowered. This example lowers modern colors, preserves cascade layers, and reports CSS nesting without rewriting it.

```ts
WeappTailwindcssWeb({
  generator: {
    webCompat: {
      preset: 'off',
      policy: {
        targets: ['chrome 91'],
        values: { oklch: 'lower', colorFunctions: 'lower' },
        layers: { action: 'preserve' },
        nesting: 'warn',
      },
    },
  },
})
```

When an embedded WebView differs from the browser version used as its target, add `capabilities` to the same policy. For example, `capabilities: { layers: true }` keeps cascade layers when the host supports them.

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'

export default defineConfig({
  plugins: [WeappTailwindcssWeb()],
})
```

Pure Vite Web projects can use the dedicated CSS-only entry. An unmarked Generic Vite project using the main entry automatically selects the same Web profile after Vite resolves its configuration; the entry CSS still needs to be imported by the application, and the plugin discovers the root stylesheet from Vite's module graph.

`vite/web` only handles Tailwind CSS generation, CSS transforms, CSS HMR, entry diagnostics and Web CSS finalization. It does not register JavaScript/template transforms, framework extensions, subpackage processing or mini-program finalizers. The built-in `styleInjector` is disabled by default and is enabled only when explicitly configured.

SSR, library mode, `optimizeDeps`, `cssMinify` and sourcemaps remain Vite responsibilities. Tailwind CSS is generated only for styles that actually enter Vite's CSS module graph; `cssEntries` does not replace importing the stylesheet from the application.

For small-program compatibility, framework extensions, or explicit multiple entries, continue using the main `weapp-tailwindcss/vite` entry with explicit options. Historical Generic mini-program projects should set `generator.target: 'weapp'` or `platform` explicitly.

After selecting this link, do not register `@tailwindcss/vite` or `@tailwindcss/postcss` at the same time to generate the same Tailwind CSS. Multi-end frameworks such as Taro H5, uni-app H5, Mpx Web, Weapp-vite Web, etc. will automatically switch to the `web` target according to environment variables; explicit configuration is recommended for custom web builds or pure Vite projects. See [v5 compared with official Tailwind plugins](/docs/tailwindcss/v5-official-plugin-parity) for the behavior comparison and compatibility boundaries, and [cross-platform CSS compatibility](/docs/multi-platform) for target inference rules.

Runnable Generic Vite, uni-app, Taro, and weapp-vite examples are available in the [repository canonical templates](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/templates). See the [support matrix](/docs/reference/support-matrix) for build and HMR evidence.
