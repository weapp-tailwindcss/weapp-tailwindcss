# weapp-style-injector

Use `weapp-style-injector/types` for framework options without importing Vite or Webpack adapter implementations.

> English | [简体中文](./README.zh-CN.md)

`weapp-style-injector` generates style entry assets for mini program builds and injects them into matching page or component styles through `@import`. It supports common Vite, Webpack, uni-app, Taro, and Mpx build setups.

It does not decide which files Tailwind CSS scans:

- `cssEntries` lets `weapp-tailwindcss` identify Tailwind CSS entry files.
- Each entry's `@source` directives define the candidates generated for that entry.
- `styleInjector.rules` maps generated subpackage entries to target style assets.

## Recommended Entries

| Scenario | Entry |
| --- | --- |
| Already using `weapp-tailwindcss` | Use the main plugin's `styleInjector` option |
| Generic Vite plugin | `weapp-style-injector/vite` |
| Generic Webpack plugin | `weapp-style-injector/webpack` |
| uni-app Vite preset | `weapp-style-injector/vite/uni-app` |
| uni-app Webpack preset | `weapp-style-injector/webpack/uni-app` |
| Taro Vite preset | `weapp-style-injector/vite/taro` |
| Taro Webpack preset | `weapp-style-injector/webpack/taro` |
| Mpx Webpack preset | `weapp-style-injector/webpack/mpx` |

The `uni-app`, `taro`, and `subpackage` parser modules are internal implementation details, not public application entry points.

## Using the Built-in Integration

`weapp-tailwindcss` already includes this package. Existing projects do not need to install or register another plugin:

```ts title="vite.config.ts"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      cssEntries: [
        resolve(projectRoot, 'src/main.css'),
        resolve(projectRoot, 'src/sub-normal/index.css'),
        resolve(projectRoot, 'src/sub-independent/index.css'),
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
})
```

The uni-app preset reads subpackage roots from `pages.json`. The rule finds `index.css` inside each subpackage, emits the platform-specific entry, and prepends a relative import to matching page styles:

```css title="dist/build/mp-weixin/sub-normal/pages/index.wxss"
@import "../index.wxss";

.page-local {
  border-width: 3rpx;
}
```

Each Tailwind entry must still own its scan scope:

```css title="src/main.css"
@import "tailwindcss" source(none);

@source "./pages/**/*.{vue,js,ts}";
@source not "./sub-normal/**/*";
@source not "./sub-independent/**/*";
```

```css title="src/sub-normal/index.css"
@import "tailwindcss" source(none);

@source "./pages/**/*.{vue,js,ts}";
```

Main-only utilities now stay in the main entry, while normal and independent subpackage utilities stay in their own entries. Shared utilities such as `text-white` are expected to appear in every entry that uses them.

## Standalone Usage

When `weapp-tailwindcss` is not in use, or when only prebuilt style entries need to be injected, register a framework preset directly:

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
        'components.css': ['components/**/*.wxss'],
      },
    }),
  ],
})
```

Without explicit rules, the uni-app, Taro, and Mpx presets detect common entries and make subpackage styles reference the main app style:

```ts
StyleInjector()
```

Use `ref` when the main app style reference should be explicit:

```ts
StyleInjector({
  rules: [
    [{ ref: 'app.css' }, {
      include: ['pages/**/*.wxss'],
      exclude: ['pages/legacy/**/*.wxss'],
    }],
  ],
})
```

## Common Options

| Option | Purpose |
| --- | --- |
| `imports` | Inject fixed entries into every matching asset |
| `perFileImports` | Resolve entries dynamically from an output file name |
| `rules` | Map subpackage style entries to target assets |
| `include` / `exclude` | Restrict assets processed by the plugin |
| `dedupe` | Avoid inserting an existing `@import`; enabled by default |

## Demo and Documentation

- [Built-in Style Injector subpackage isolation demo](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo/subpackage-uni-app-vite-tailwindcss-v4)
- [Tailwind CSS multi-entry and subpackage isolation guide](https://tw.weapp.dev/docs/quick-start/independent-pkg)
