---
title: Tailwind CSS multiple entries and subcontracting isolation
description: Use cssEntries, @source and the built-in styleInjector to let the main package, ordinary sub-package and independent sub-package generate their own Tailwind CSS style entries.
keywords:
  - tailwindcss
  - multiple entrances
  - Subcontract
  - independent subcontracting
  - styleInjector
  - weapp-style-injector
  - weapp-tailwindcss
  - Mini program
  - uni-app
  - taro
  - mpx
---

# Tailwind CSS multiple entries and sub-packaging isolation

After the applet is split into the main package, ordinary sub-package and independent sub-package, it is usually not desirable to copy all Tailwind tool classes into each style product. A more reasonable result is:

- The main package entry only generates tool classes used by the main package.
- The ordinary subpackage entry only generates the tool classes used by the subpackage.
- The independent subcontract entry only generates tool classes used by the independent subcontract.
- The subpackage page refers to this subpackage entry through `@import`, while retaining the page's own local CSS.

Independent sub-packages especially require separate style entries, because global styles in the main package will not affect independent sub-packages.

## What are the three configurations responsible for?

| Configuration           | Responsibilities                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `cssEntries`            | Tell `weapp-tailwindcss` which files are Tailwind CSS entries                                                      |
| `@source` in the portal | Determines which templates and scripts are scanned by the current portal and which candidate classes are generated |
| `styleInjector.rules`   | Generate subcontracting entry assets, and inject the entry into the matching page or component style through       |

`styleInjector` is not responsible for scanning templates and does not replace `cssEntries`. In turn, `cssEntries` is only responsible for identifying and generating entries, and will not automatically allow subcontracted pages to reference the entries. All three need to be configured together.

## Directory structure

The following takes uni-app Vite + Tailwind CSS 4 as an example:

```text
src/
├── main.css
├── main.ts
├── pages/
│   └── index/index.vue
├── sub-normal/
│   ├── index.css
│   └── pages/
│       ├── index.css
│       └── index.vue
└── sub-independent/
    ├── index.css
    └── pages/
        ├── index.css
        └── index.vue
```

`main.css` and `index.css` in the two subcontract root directories are three Tailwind entries. `index.css` in the page directory is only the partial style of the page and does not contain the Tailwind entry command.

## Configure cssEntries and built-in Style Injector

`weapp-tailwindcss` already has `weapp-style-injector` built-in, so there is no need to register a separate plug-in:

```ts title="vite.config.ts"
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const require = createRequire(import.meta.url)
const projectRoot = dirname(fileURLToPath(import.meta.url))
const uniMpVueRuntimePath = require.resolve('@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js')

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      tailwindcssBasedir: projectRoot,
      cssEntries: [
        path.resolve(projectRoot, 'src/main.css'),
        path.resolve(projectRoot, 'src/sub-normal/index.css'),
        path.resolve(projectRoot, 'src/sub-independent/index.css'),
      ],
      styleInjector: {
        rules: {
          'index.css': [
            'pages/**/*.css',
            'pages/**/*.wxss',
            'pages/**/*.acss',
            'pages/**/*.ttss',
            'pages/**/*.qss',
            'pages/**/*.jxss',
          ],
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js': uniMpVueRuntimePath,
    },
  },
})
```

By default, uni-app reads the subpackage root directory in `pages.json`. `index.css` in the rule will match respectively:

- `src/sub-normal/index.css`
- `src/sub-independent/index.css`

The target glob covers common applet style suffixes and H5's `.css`. If the project only builds WeChat applet, it can be reduced to `pages/**/*.wxss`.

## Limit the scanning range of three entrances

The main package entry only scans the main package page and explicitly excludes the two sub-packages:

```css title="src/main.css"
@import "tailwindcss" source(none);
@config "../tailwind.config.js";

@source "./pages/**/*.{vue,js,ts}";
@source not "./sub-normal/**/*";
@source not "./sub-independent/**/*";
```

The ordinary sub-package portal only scans ordinary sub-packages:

```css title="src/sub-normal/index.css"
@import "tailwindcss" source(none);
@config "../../tailwind.config.sub-normal.js";

@source "./pages/**/*.{vue,js,ts}";
```

The independent sub-package portal only scans independent sub-packages:

```css title="src/sub-independent/index.css"
@import "tailwindcss" source(none);
@config "../../tailwind.config.sub-independent.js";

@source "./pages/**/*.{vue,js,ts}";
```

The `@config` for each `content` should also maintain the same bounds. Do not have the master configuration rescan all packets as this will bypass the isolation intent in the ingress.

## The page only introduces local CSS

The subcontracting page does not need to manually introduce the Tailwind entry of the root directory:

```vue title="src/sub-normal/pages/index.vue"
<template>
  <view class="normal-page-local bg-twv4-uni-normal text-white">
    normal subpackage
  </view>
</template>

<style src="./index.css"></style>
```

```css title="src/sub-normal/pages/index.css"
.normal-page-local {
  border-width: 3rpx;
}
```

When building, the built-in Style Injector will generate a subpackage entry and insert the reference into the page product.

## Expected product

Take the WeChat applet as an example:

| Product                            | Should contain                              | Should not contain                                |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------- |
|                                    |
|                                    |
|                                    |
| `sub-normal/pages/index.wxss`      | Page partial CSS, `@import "../index.wxss"` | Inline copies of three sets of entry tool classes |
| `sub-independent/pages/index.wxss` | Page partial CSS, `@import "../index.wxss"` | Inline copies of three sets of entry tool classes |

Page products are similar to:

```css title="dist/build/mp-weixin/sub-normal/pages/index.wxss"
@import "../index.wxss";

.normal-page-local {
  border-width: 3rpx;
}
```

Quarantine is for entrance-exclusive candidates. If the main package and multiple sub-packages use `text-white`, it is normal for each entry to generate the shared tool class independently.

## Use weapp-style-injector independently

If the project does not use `weapp-tailwindcss`, or you only need to inject the generated style entry, you can register the framework preset independently:

```ts
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { StyleInjector } from 'weapp-style-injector/vite/uni-app'

export default defineConfig({
  plugins: [
    uni(),
    StyleInjector({
      rules: {
        'index.css': ['pages/**/*.wxss'],
      },
    }),
  ],
})
```

When `weapp-tailwindcss` is already used, use the built-in `styleInjector` first to avoid registering two identical sets of build life cycles.

## verify

First build the WeChat applet:

```bash
pnpm build:mp-weixin
```

If the project supports other platforms, then check at least one non-WeChat target, such as Alipay or Douyin:

```bash
pnpm build:mp-alipay
pnpm build:mp-toutiao
```

When verifying, don't just check the fixed `app.wxss` file name. You should check `.wxss`,

## Complete example

The [subpackage-uni-app-vite-tailwindcss-v4](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo/subpackage-uni-app-vite-tailwindcss-v4) demo in the warehouse also covers:

- Built-in isolated entry mode for `styleInjector`.
- Candidate isolation for main package, common subcontract, and independent subcontract.
- WeChat, Alipay, Douyin and H5 products.
- Single entry mode for compatibility regression.
