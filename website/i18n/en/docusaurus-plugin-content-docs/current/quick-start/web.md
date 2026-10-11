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

After selecting this link, do not register `@tailwindcss/vite` or `@tailwindcss/postcss` at the same time to generate the same Tailwind CSS. Multi-end frameworks such as Taro H5, uni-app H5, Mpx Web, Weapp-vite Web, etc. will automatically switch to the `web` target according to environment variables; explicit configuration is recommended for custom web builds or pure Vite projects. For more target judgment rules, see [Cross-multi-terminal development CSS compatibility] (/docs/multi-platform).

Runnable Generic Vite, uni-app, Taro, and weapp-vite examples are available in the [repository canonical templates](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/templates). See the [support matrix](/docs/reference/support-matrix) for build and HMR evidence.
