---
title: uni-app x Configuration Reference
description: Responsibilities, usage, and cross-platform boundaries of the Tailwind CSS 4 configuration for uni-app x, HBuilderX, and weapp-tailwindcss.
keywords:
  - uni-app x
  - HBuilderX
  - uniAppX
  - Tailwind CSS 4
  - componentLocalStyles
  - style isolation
  - unit conversion
  - uvue
---

# uni-app x Configuration Reference

This page explains every public option in the `uniAppX()` preset. Start with the [uni-app x quick start](../quick-start/frameworks/uni-app-x), then use this reference to distinguish candidate scanning, CSS generation, class transformation, and local-style delivery.

## Support baseline

- `weapp-tailwindcss` `5.3.3`
- Tailwind CSS `4.x`
- Node.js `^22.18.0 || >=24.11.0`
- HBuilderX `>=5.11`
- HBuilderX Web, mini-program, Android, iOS, and HarmonyOS targets

## Minimal configuration

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
    WeappTailwindcss(uniAppX({
      base: projectRoot,
      cssEntries: [resolve(projectRoot, 'main.css')],
    })),
  ],
})
```

`weapp-tailwindcss` owns Tailwind CSS generation. Do not add `tailwindcss`, `@tailwindcss/postcss`, or `@tailwindcss/vite` as another generator in the same build.

## Separate the four responsibilities

| Stage                | Mechanism              | Responsibility                                                                      |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Candidate discovery  | `@source` in CSS       | Select the `.uvue` and `.uts` files whose classes should be generated               |
| Entry identification | `cssEntries`           | Identify the plain CSS files that contain Tailwind directives and scan declarations |
| CSS generation       | `generator`            | Compile candidates into CSS that the current target can consume                     |
| Isolated delivery    | `componentLocalStyles` | Put utilities used by a component into that component's local style scope           |

`cssEntries` does not replace a real import, and `componentLocalStyles` does not replace `@source`. If a class is discovered but an inner component node has no style, the failure is usually at the isolation delivery boundary.

## Option index

| Option                                          | Type                            | Default                  | Description                                       |
| ----------------------------------------------- | ------------------------------- | ------------------------ | ------------------------------------------------- |
| [`base`](#base)                                 | `string`                        | Required                 | uni-app x project root                            |
| [`cssEntries`](#cssentries)                     | `string[]`                      | Auto-detected            | Tailwind CSS 4 entry list                         |
| [`rem2rpx`](#rem2rpx)                           | `boolean \| object`             | Off                      | Convert `rem` to `rpx`                            |
| [`unitsToPx`](#unitstopx)                       | `boolean \| object`             | Off                      | Convert multiple length units to `px`             |
| [`unitConversion`](#unitconversion)             | `object \| false`               | Off                      | Custom or platform-specific unit conversion       |
| [`generator`](#generator)                       | `object \| false`               | Inferred                 | Tailwind CSS generation strategy                  |
| [`uniAppX`](#uniappx)                           | `boolean \| object`             | Enabled for native App   | uvue/App adaptation and nested controls           |
| [`componentLocalStyles`](#componentlocalstyles) | `boolean \| object`             | `true`                   | Component-local Tailwind shortcut                 |
| [`uvueUnsupported`](#uvueunsupported)           | `'error' \| 'warn' \| 'silent'` | `'warn'`                 | Unsupported utility handling                      |
| [`customAttributes`](#customattributes)         | `ICustomAttributes`             | None                     | Transform class-bearing attributes beyond `class` |
| [`resolve`](#resolve)                           | `PackageResolvingOptions`       | Project dependency paths | Tailwind package resolution                       |
| [`rawOptions`](#rawoptions)                     | `UserDefinedOptions`            | None                     | Core plugin passthrough                           |

## Option details

### `base` {#base}

**Purpose** Provide a stable project root used to resolve `node_modules`, Tailwind entries, and relative scan paths.

**When to use** Always. HBuilderX can change `process.cwd()` when it launches a build, so the current working directory is not a stable project contract.

**Usage** Derive a cross-platform absolute path from the config file URL:

```ts
const projectRoot = dirname(fileURLToPath(import.meta.url))
uniAppX({ base: projectRoot })
```

**Caution** Do not hard-code a machine-specific path or concatenate filesystem paths as strings.

### `cssEntries` {#cssentries}

**Purpose** Tell the generator which plain CSS files are Tailwind CSS 4 entries so it can read `@import`, `@source`, and `@config`.

**When to use** Explicitly configure it in application projects. List every entry used by multi-entry, package, or split-style builds.

**Usage** Resolve absolute paths from `base`, and import the same file through `App.uvue`:

```ts
cssEntries: [resolve(projectRoot, 'main.css')]
```

```html title="App.uvue"
<style>
@import './main.css';
</style>
```

**Caution** Configuring `cssEntries` without a real import lets the generator identify the entry, but HBuilderX still does not load the CSS asset.

### `rem2rpx` {#rem2rpx}

**Purpose** Convert `rem` declarations to `rpx` during style processing. `true` uses `rootValue: 32`, all properties, and `rpx` output.

**When to use** Use it when a design system or third-party stylesheet uses `rem` while mini-program targets need `rpx`.

**Usage** Pass `true` for defaults or an object for another root size:

```ts
rem2rpx: { rootValue: 16, propList: ['*'], transformUnit: 'rpx' }
```

**Caution** This is a top-level `uniAppX()` shortcut. Do not also configure the same `rem -> rpx` rule in `unitConversion`.

### `unitsToPx` {#unitstopx}

**Purpose** Convert multiple length units to `px` with a built-in or custom unit map.

**When to use** Use it when native uvue accepts a limited unit set and the project standardizes its output on `px`.

**Usage** Limit precision, properties, and selectors when needed:

```ts
unitsToPx: {
  unitPrecision: 4,
  propList: ['font-size', 'line-height'],
}
```

**Caution** This is a general bulk conversion. Use `unitConversion` when Web, mini-program, and App targets need different mappings.

### `unitConversion` {#unitconversion}

**Purpose** Apply explicit unit conversion rules and select platform rules from `UNI_PLATFORM`, `UNI_UTS_PLATFORM`, and related build variables.

**When to use** Use it when one source tree must emit `rpx` for a mini-program and `px` for native App, or when several conversion rules must be composed.

**Usage** Build platform rules with the public presets:

```ts
import { unitConversionPresets } from 'weapp-tailwindcss'

unitConversion: {
  platforms: {
    'mp-weixin': { rules: [unitConversionPresets.pxToRpx({ ratio: 2 })] },
    'app-android': { rules: [unitConversionPresets.rpxToPx({ ratio: 0.5 })] },
  },
}
```

**Caution** Keep the matching ranges of `rem2rpx`, `unitsToPx`, and `unitConversion` disjoint so one declaration is not rewritten twice.

### `generator` {#generator}

**Purpose** Control the Tailwind CSS 4 output target and Web compatibility lowering. The preset normally infers Web or mini-program output from the build environment.

**When to use** Usually leave it unset. Override it only when a custom environment cannot provide platform variables or the project deliberately changes its Web compatibility baseline.

**Usage** A modern WebView project can disable compatibility lowering after validating its runtime baseline:

```ts
generator: { target: 'web', webCompat: false }
```

**Caution** There is no native `target: 'app'`; `uniAppX` handles native constraints. `generator: false` disables built-in Tailwind generation and is not appropriate for normal projects.

### `uniAppX` {#uniappx}

**Purpose** Control uni-app x template transformation, native uvue CSS compatibility, and local-style sub-options.

**When to use** The preset resolves it from the environment. Pass an object only when local styles or unsupported utility handling need fine-grained settings.

**Usage** Keep native compatibility policy together when desired:

```ts
uniAppX: {
  componentLocalStyles: true,
  uvueUnsupported: 'error',
}
```

**Caution** Top-level `componentLocalStyles` and `uvueUnsupported` are shortcuts. Matching nested `uniAppX.*` values win over shortcuts, and values in `rawOptions` have the highest priority. Configure each behavior in one place.

### `componentLocalStyles` {#componentlocalstyles}

**Purpose** Compile Tailwind utilities used by a component or page into that `.uvue` file's local scoped style when style isolation blocks global classes.

**When to use** Under HBuilderX 5 style isolation 2.0, components default to `isolated` and cannot reference global classes imported by `App.uvue`. The local bridge is therefore required for inner component nodes. See the [DCloud style isolation 2.0 documentation](https://doc.dcloud.net.cn/uni-app-x/css/common/style-isolation.html).

**Usage** The default `true` covers `components` and `pages`. Include those defaults when adding custom directories:

```ts
componentLocalStyles: {
  componentMatcher: id => /(?:^|\/)(?:components|layouts)\/.+\.(?:uvue|nvue)$/.test(id),
  pageMatcher: id => /(?:^|\/)(?:pages|screens)\/.+\.(?:uvue|nvue)$/.test(id),
}
```

**Caution** `componentMatcher` and `pageMatcher` replace their defaults. They receive module IDs with query/hash removed and slash separators normalized.

In isolation 2.0, global styles affect pages but not inner nodes of isolated components. A class passed to a component root follows a separate root-style forwarding rule. This is why "the root works but the inner node does not" identifies an isolation boundary rather than a Tailwind scan failure.

The conceptual transformation is shown below. Real aliases use stable hashes derived from the file and utility:

```vue
<!-- Before -->
<view class="w-full h-[200px]" />

<!-- Conceptual result -->
<view class="wtu-width wtu-height" />
<style scoped>
.wtu-width { @apply w-full; }
.wtu-height { @apply h-[200px]; }
</style>
```

This is narrower than setting every component to `styleIsolation: 'app'`: isolation remains intact, and only utilities actually used by the component and validated by Tailwind are brought into its local scope.

| Sub-option                                                                                                    | Type              | Default                | Description                           |
| ------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------- | ------------------------------------- |
| [`componentLocalStyles.enabled`](#componentlocalstyles-enabled)                                               | `boolean`         | `true`                 | Enable the local-style bridge         |
| [`componentLocalStyles.onlyWhenStyleIsolationVersion2`](#componentlocalstyles-onlywhenstyleisolationversion2) | `boolean`         | `true`                 | Require isolation 2.0 in the manifest |
| [`componentLocalStyles.componentMatcher`](#componentlocalstyles-componentmatcher)                             | `(id) => boolean` | `components` directory | Select component files                |
| [`componentLocalStyles.pageMatcher`](#componentlocalstyles-pagematcher)                                       | `(id) => boolean` | `pages` directory      | Select page files                     |

#### `componentLocalStyles.enabled` {#componentlocalstyles-enabled}

**Purpose** Enable utility collection, stable aliases, and generated local rules.

**When to use** Keep it enabled. Disable it only when the project does not use isolation 2.0 or every component owns its style scope without this bridge.

**Usage** Set `componentLocalStyles: false` or `{ enabled: false }`.

#### `componentLocalStyles.onlyWhenStyleIsolationVersion2` {#componentlocalstyles-onlywhenstyleisolationversion2}

**Purpose** Read the project `manifest.json` and enable the component bridge only when `uni-app-x.styleIsolationVersion` is `"2"`.

**When to use** Keep the default `true` to avoid unnecessary local rules under the legacy strategy. Set it to `false` only when a non-standard build cannot expose the manifest and runtime evidence proves the bridge is required.

**Usage** Set `componentLocalStyles: { onlyWhenStyleIsolationVersion2: false }`. This is not a normal setup requirement.

#### `componentLocalStyles.componentMatcher` {#componentlocalstyles-componentmatcher}

**Purpose** Declare which `.uvue/.nvue` files have component isolation semantics.

**When to use** Configure it when reusable components live in `layouts`, `widgets`, or another non-default directory.

**Usage** Include the default `components` directory in the callback and match normalized `/` separators.

#### `componentLocalStyles.pageMatcher` {#componentlocalstyles-pagematcher}

**Purpose** Declare which `.uvue/.nvue` files should receive page-local styles.

**When to use** Configure it when pages live in `screens` or a custom router/layout directory.

**Usage** Include the default `pages` directory and do not match a machine-specific absolute root.

### `uvueUnsupported` {#uvueunsupported}

**Purpose** Decide whether an unsupported utility on a native uvue target fails, warns, or is silently skipped.

**When to use** Use `'warn'` during development, `'error'` when CI must reject incompatible styles, and `'silent'` only for known omissions with an explicit replacement.

**Usage** Set `uvueUnsupported: 'error'`. Native targets cannot treat `gap`, `space-x-*`, or `space-y-*` as portable layout primitives.

**Caution** A warning means the rule did not enter the target style output; it is not merely an informational runtime message.

### `customAttributes` {#customattributes}

**Purpose** Apply Tailwind candidate recognition and safe-class transformation to class-bearing component attributes beyond `class`.

**When to use** Use it when classes pass through props such as `leftClass` or `thumb-class`.

**Usage** Declare class-bearing attributes per tag:

```ts
customAttributes: {
  'a-navbar': ['leftClass'],
  'switch-card': ['thumb-class'],
}
```

**Caution** This solves class recognition only. Styling inner child nodes must still follow the uni-app x `externalClasses` and style-isolation contract.

### `resolve` {#resolve}

**Purpose** Adjust where Tailwind and its PostCSS entry are resolved. The preset checks the project `node_modules` and `base` first.

**When to use** Use it in a monorepo, hoisted dependency layout, or custom package directory when HBuilderX cannot resolve `tailwindcss` from the project root.

**Usage** Add the real dependency directory:

```ts
resolve: { paths: [resolve(projectRoot, '../node_modules')] }
```

**Caution** Do not use this to hide a missing dependency. Confirm Tailwind CSS 4 is installed where the build can access it.

### `rawOptions` {#rawoptions}

**Purpose** Pass core `UserDefinedOptions` that have no `uniAppX()` shortcut and allow advanced overrides of preset defaults.

**When to use** Use it for core capabilities such as `cssOptions.cssCalc`, lifecycle callbacks, or custom matchers.

**Usage** Keep only options that the preset does not expose directly:

```ts
rawOptions: {
  cssOptions: { cssCalc: true },
}
```

**Caution** `rawOptions` has the highest priority. Do not configure the same field at the top level and in `rawOptions`.

## Tailwind CSS entry

```css title="main.css"
@import "tailwindcss" source(none);

@source "./App.uvue";
@source "./pages/**/*.{uvue,uts}";
@source "./components/**/*.{uvue,uts}";
@source "./layouts/**/*.{uvue,uts}";
@source not "./uni_modules/**/*";
@source not "./unpackage/**/*";
```

Do not scan `unpackage`, `dist`, or all of `uni_modules` without a specific reason. Generated output can otherwise re-enter candidate scanning and disturb incremental builds.

## Validation

Run every target through the normal scripts in your HBuilderX project and verify:

- The `cssEntries` file is imported by `App.uvue`, and `@source` covers pages, components, and layouts.
- Under isolation 2.0, static classes, dynamic classes, and normal scoped classes work together on inner component nodes.
- Unit conversion runs once and emits the expected units for Web, mini-program, or native App.
- Every `uvueUnsupported` warning has an explicit decision, and Android, iOS, and HarmonyOS runtime results match the real artifacts.

A successful build proves that compilation completed; it does not replace CSS compatibility checks on a simulator or device.
