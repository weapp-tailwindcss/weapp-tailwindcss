---
title: Develop CSS compatibility across multiple terminals
description: The current configuration caliber of weapp-tailwindcss in mini programs, H5/Web, ordinary App WebView and uni-app x native App construction.
keywords:
  - Develop CSS compatibility across multiple terminals
  - multi platform
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - uni-app x
  - taro
  - mpx
---

# Develop CSS compatibility across multiple terminals

The main responsibility of `weapp-tailwindcss` is still to make Tailwind CSS available in the applet environment. But starting from v5, H5/Web and ordinary uni-app App WebView builds should generally retain plug-ins: the generator will automatically switch to the `web` target according to the environment variable, and output the browser's native Tailwind CSS instead of the applet escape selector.

## How does the target determine?

The generator default target is `weapp`. When the following environment variable is hit, it will automatically switch to `web`:

| Scenario                     | Environment variables                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Explicitly specified         | `WEAPP_TW_TARGET=web`, `WEAPP_TAILWINDCSS_TARGET=web`                              |
| uni-app H5                   | `UNI_PLATFORM=h5`                                                                  |
| Ordinary uni-app App WebView | `UNI_PLATFORM=app`, `UNI_PLATFORM=app-plus`, and `UNI_UTS_PLATFORM` is not `app-*` |
| uni-app x Web                | `UNI_UTS_PLATFORM=h5`, `web`, `web-*`                                              |
| Mpx Web                      | `MPX_CLI_MODE=web`, `MPX_CURRENT_TARGET_MODE=web`                                  |
| Taro H5                      | `TARO_ENV=h5`                                                                      |

`target` represents the CSS output form, not the platform enumeration. Native App targets such as `uni-app x`'s `app-android`, `app-ios`, and `app-harmony` will not be regarded as web, and `target: 'app'` does not need to be configured. This type of target continues to use the applet output family, and uses the `uniAppX` preset to handle the differences between `uvue` and the App side.

## When to disable plugins

Don’t write the old version of disabling logic when building H5/Web:

```ts title="Not recommended"
const isH5 = process.env.UNI_PLATFORM === 'h5'

WeappTailwindcss({
  disabled: isH5,
})
```

The current recommendation is to keep the plugin enabled:

```ts title="Recommended"
WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
  },
})
```

`disabled` is only suitable for builds that "don't want plugins at all", such as RN, Harmony or standalone native builds. For H5/Web targets of uni-app, uni-app x, Taro, Mpx, Weapp-vite, disabling is usually not required.

If your custom build environment does not inject the above variables, you can specify web output explicitly:

```ts
WeappTailwindcss({
  generator: {
    target: 'web',
  },
})
```

## Minimum configuration of each framework

### uni-app

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      cssOptions: {
        rem2rpx: true,
      },
    }),
  ],
})
```

When `UNI_PLATFORM=h5`, `app` or `app-plus`, the generator default target automatically switches to `web`. If your custom build does not inject these environment variables, you can specify web output explicitly:

```ts
WeappTailwindcss({
  generator: {
    target: 'web',
  },
  cssOptions: {
    rem2rpx: true,
  },
})
```

Only standalone native builds that do not want plug-ins to be involved at all need to treat `disabled` separately as an advanced escape hatch.

### uni-app x

`uni-app x` It is recommended to use the `uniAppX` preset. Tailwind CSS 4 recommends explicitly passing in the absolute path of the entry CSS.

```ts title="vite.config.ts"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { uniAppX } from 'weapp-tailwindcss/presets'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss(
      uniAppX({
        base: projectRoot,
        cssEntries: [
          resolve(projectRoot, 'main.css'),
        ],
        cssOptions: {
          rem2rpx: true,
        },
      }),
    ),
  ],
})
```

`UNI_UTS_PLATFORM=h5`, `web` or `web-*` will automatically output `web`. Native App targets such as `app-android`, `app-ios`, and

:::warning uni-app x native app limitations
Do not rely on `uvue`, `gap`, or `gap-x-*` for the `gap-y-*` native app. `space-x-*` and `space-y-*` should not be used as the main layout scheme of uni-app x. Please use the child explicit `mt-*` / `ml-*` instead, or encapsulate the spacing component of the fixed structure.
:::

### Mpx

```js title="mpx.config.js"
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

module.exports = {
  configureWebpack(config) {
    config.plugins.push(
      new WeappTailwindcss({
        appType: 'mpx',
        cssOptions: {
          rem2rpx: true,
        },
      }),
    )
  },
}
```

When `MPX_CLI_MODE=web` or `MPX_CURRENT_TARGET_MODE=web`, the generator default target automatically switches to `web`. Mini program targets such as `wx`, `ali`, `swan`, `qq`, `tt`, and

### Taro

```ts title="config/index.ts"
import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'

export default {
  webpackChain(chain) {
    chain.merge({
      plugin: {
        install: {
          plugin: WeappTailwindcss,
          args: [
            {
              cssOptions: {
                rem2rpx: true,
              },
            },
          ],
        },
      },
    })
  },
}
```

When `TARO_ENV=h5`, the generator default target automatically switches to `web`. If the RN build does not want the plugin to be involved, `disabled: process.env.TARO_ENV === 'rn'` can be set explicitly for RN only.

## Do not register the Tailwind generation plug-in repeatedly

In the mini program construction link, Tailwind CSS style generation is uniformly handed over to `weapp-tailwindcss`. Do not register additional plug-ins for H5, App or HMR compatibility:

- `@tailwindcss/postcss`
- `@tailwindcss/vite`

If the project already has `postcss.config.js`, only keep the non-Tailwind plug-ins required by the business. When you need to configure modern CSS compatible transformations, the `WeappTailwindcss` and `cssOptions.cssPresetEnv` options that come with `cssOptions.autoprefixer` are preferred.

## Modern CSS compatible with App WebView

Ordinary uni-app App WebView or some lower version kernels may not support modern color writing methods such as `rgb(245 247 255 / var(--tw-bg-opacity))`. Currently, there is no need to install and register `postcss-preset-env` in the project. It can be configured directly through the plug-in options:

```ts
WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
    cssPresetEnv: {
      browsers: 'chrome >= 50',
    },
  },
})
```

`cssOptions.autoprefixer` is enabled by default and is used to complete compatible prefixes such as `-webkit-` for the mini program WebView, for example, let `bg-clip-text` output `-webkit-background-clip: text`. If you really need to close it, you can pass it in explicitly:

```ts
WeappTailwindcss({
  cssOptions: {
    autoprefixer: false,
  },
})
```

## CSS variable calculation mode

For an explicitly identified WeChat target with Tailwind CSS 4, an omitted `cssOptions.cssCalc` now selects `'auto'`: fixed rpx themes are evaluated within the complete Vite output CSS scope, and literal rpx calc expressions are reduced. Web, native App, other and unknown targets retain the previous default. This change is newer than 5.5.10.

Automatic mode does not expand plain var references or calculate unrelated units. Known overrides and incomplete scopes preserve variable expressions. For future JS or inline-style theme updates, explicitly set `cssOptions: { cssCalc: false }`. See [WeChat rpx calculation](./issues/spacing-rpx.md) for compatibility boundaries and diagnostics.

The default targets fixed rpx lengths; it does not also freeze px variables. This comparison uses ordinary `@theme`, Tailwind CSS 4 targeting WeChat, and a complete Vite style context without known overrides, additional unit conversions, or custom plugin rewrites:

| Theme configuration        | `cssOptions.cssCalc` | `mt-2`                                 | `gap-2`                         |
| -------------------------- | -------------------- | -------------------------------------- | ------------------------------- |
| `--spacing: 1rpx`          | Omitted or `'auto'`  | `margin-top: 2rpx`                     | `gap: 2rpx`                     |
| `--spacing: 1px`           | Omitted or `'auto'`  | `margin-top: calc(var(--spacing) * 2)` | `gap: calc(var(--spacing) * 2)` |
| `--spacing: 1px`           | `true`               | `margin-top: 2px`                      | `gap: 2px`                      |
| `--spacing: 1rpx` or `1px` | `false`              | `margin-top: calc(var(--spacing) * 2)` | `gap: calc(var(--spacing) * 2)` |

`false` disables only this plugin's calculation; other plugins may still rewrite expressions. Bind Vue's `style` to update px spacing dynamically. For dynamic rpx sizes, calculate final lengths in JS and consume them through plain `var()` references. See [Choosing between fixed sizes and runtime themes](./issues/spacing-rpx.md#choosing-between-fixed-sizes-and-runtime-themes) for complete uni-app examples.

`cssCalc: true` evaluates `calc()` using variables that can be proven fixed, replacing the original expression by default. For an unconditional Tailwind root theme:

```css
:root, :host { --spacing: 8rpx; }
.h-2 { height: calc(var(--spacing) * 2); }
```

The result can be `height: 16rpx`. Prefer selecting fixed variables explicitly to limit evaluation:

```ts
WeappTailwindcss({
  cssOptions: {
    cssCalc: ['--spacing'],
  },
})
```

Arrays also support regular expressions, such as `cssCalc: [/^--(gap|spacing)$/]`. Object options can control evaluation:

```ts
WeappTailwindcss({
  cssOptions: {
    cssCalc: {
      includeCustomProperties: ['--spacing'],
      preserve: true,
    },
  },
})
```

`preserve: true` also keeps the original expression. A later valid `calc()` can override the static value, so this option does not guarantee avoidance of WeChat runtime sizing differences.

Known local selector overrides, conditional rules, or conflicting sources within a shared style scope prevent static evaluation of affected variables and their dependencies. Vite builds derive these scopes from entry points, static imports, and CSS imports: styles loaded together participate in the same analysis, while independent entry scopes are evaluated separately. Separate output files alone do not establish isolation. The Vite development server and styles embedded in native App code do not use this deferred stage. Incremental generation recalculates after theme or configuration changes. Unresolved or unselected variables and their `var()` fallbacks retain runtime semantics.

Build-time analysis cannot predict future JavaScript or inline-style changes. Select only variables that will remain fixed; do not freeze dynamic themes. `@theme inline` removes the variable reference but does not by itself guarantee removal of `calc()`.

Use `cssCalc: false` to disable precomputation and opt out of automatic adaptation for runtime themes. `cssCalc` no longer implicitly enables global variable expansion through `cssPresetEnv`. Explicit use of that independent feature requires separate output verification.

### Inspect final spacing declarations

`cssCalc` handles variables inside `calc()` and does not globally substitute plain `var()` references. For example:

```css
.mx-1 {
  margin-left: var(--spacing);
  margin-right: var(--spacing);
}
```

These direct variable references remain unchanged. Enabling `cssCalc` alone does not add static fallbacks. Use arbitrary values such as `mx-[8rpx]` when a direct length is required.

Rebuild and inspect final property values and declaration order in WXSS/CSS, then compare against direct lengths on the target device. Static evaluation fixes the library build pipeline, not WeChat's runtime conversion algorithm.

## Multiterminal unit conversion

If the same set of code needs to handle units by platform, use `cssOptions.unitConversion.platforms` first. The platform name will be compatible with common aliases such as `weapp`/`mp-weixin`, `h5`/`web`, `app-plus`/`app`; when `cssOptions.platform` is not passed in explicitly, it will be inferred from common build environment variables.

```ts
import { unitConversionComposeRules, unitConversionPresets } from 'weapp-tailwindcss'

WeappTailwindcss({
  cssOptions: {
    unitConversion: {
      platforms: {
        'mp-weixin': {
          rules: unitConversionComposeRules(
            unitConversionPresets.pxToRpx({ ratio: 2 }),
            unitConversionPresets.remToRpx({ rootValue: 16 }),
          ),
        },
        h5: {
          rules: [
            unitConversionPresets.rpxToPx({ ratio: 0.5 }),
          ],
        },
      },
    },
  },
})
```

## H5 SVG icon offset

If Tailwind Preflight is enabled on the H5 side, `svg` may be set to `display: block` by default, and some icons will be offset. It can be overridden according to the H5 condition in the global style:

```css
@import "tailwindcss";

/* #ifdef H5 */
svg {
  display: initial;
}
/* #endif */
```

## Verification suggestions

After changing the configuration across multiple terminal projects, at least verify the following:

- Mini program target: Whether basic tool classes, arbitrary values, pseudo classes or variant selectors are generated and translated normally.
- H5/Web target: Whether the output is the browser's native selector instead of the applet escaped selector.
- Normal App WebView: Whether modern color functions, `calc()`, `rpx` related styles are accepted by the target kernel.
- uni-app x native App: avoid using `gap`, `space-x-*`, `space-y-*` as core layout capabilities.

Commonly used commands are selected according to project framework:

```bash npm2yarn
npm run dev:h5
npm run build:h5
npm run dev:mp-weixin
npm run build:mp-weixin
```
