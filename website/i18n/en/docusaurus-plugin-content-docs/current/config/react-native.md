---
title: React Native / Expo Configuration Reference
description: Configuration responsibilities, input modes, and the manifest runtime model for React Native, Expo, Metro, and @weapp-tailwindcss/react-native.
keywords:
  - React Native
  - Expo
  - Metro
  - Babel
  - Tailwind CSS 4
  - NativeStyleManifest
  - sourceGlobs
  - HMR
---

# React Native / Expo Configuration Reference

This page explains every Metro option in `withWeappTailwindcss()`. Start with the [React Native / Expo quick start](../quick-start/react-native-expo) for initial setup.

## Support baseline

- `@weapp-tailwindcss/react-native` `0.2.5`
- Expo `>=54`
- React `>=19`
- React Native `>=0.81`
- Tailwind CSS `4.x`
- Node.js `>=22.12.0`

The package compiles Tailwind CSS into a React Native style manifest. It does not emit Web CSS or mini-program styles, and it does not install NativeWind or a `react-native-css` runtime.

## Minimal configuration

```js title="metro.config.js"
const { getDefaultConfig } = require('expo/metro-config')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  projectRoot: __dirname,
  input: './global.css',
  sourceGlobs: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
})
```

The wrapper registers the CSS extension, virtual manifest module, Metro transformer, and file watchers. Expo continues to use the standard `babel-preset-expo`; do not add a second Tailwind Babel pipeline.

## Option index

| Option                        | Type                  | Default         | Description                                            |
| ----------------------------- | --------------------- | --------------- | ------------------------------------------------------ |
| [`projectRoot`](#projectroot) | `string`              | `process.cwd()` | Application root and dependency resolution anchor      |
| [`input`](#input)             | `string`              | None            | Tailwind CSS entry file                                |
| [`css`](#css)                 | `string`              | `''`            | Direct CSS input                                       |
| [`manifest`](#manifest)       | `NativeStyleManifest` | None            | Prebuilt manifest input                                |
| [`classSet`](#classset)       | `Iterable<string>`    | None            | Explicit candidates and static transformation contract |
| [`sourceGlobs`](#sourceglobs) | `string[]`            | Entry scanning  | Tailwind source scan range                             |
| [`watchFiles`](#watchfiles)   | `string[]`            | `[]`            | Additional manifest refresh dependencies               |

`manifest`, `input`, and `css` are mutually exclusive input modes. The implementation priority is `manifest > input > css`, but application configuration should select exactly one so the visible configuration matches the effective source. Use `input` for normal projects.

## Option details

### `projectRoot` {#projectroot}

**Purpose** Provide one path base for the CSS entry, scan globs, watched files, and temporary manifest, while anchoring the React and React Native singletons to the application.

**When to use** A single-package app can rely on the default. Set it explicitly for Expo monorepos, workspace symlinks, or Metro processes launched from another directory.

**Usage** Use the application directory in a CommonJS Metro config:

```js
projectRoot: __dirname
```

**Caution** A wrong root can cause missing entries, stale watches, and duplicate React instances at the same time. Treat those symptoms as one root-resolution problem.

### `input` {#input}

**Purpose** Select the Tailwind CSS 4 entry. The path resolves from `projectRoot`, and Metro generates a manifest and watches the file.

**When to use** This is the preferred application mode for a real CSS entry with `@import "tailwindcss"`, `@source`, and theme variables.

**Usage** Point to a plain CSS file:

```js
input: './global.css'
```

```css title="global.css"
@import "tailwindcss";
@source "./src/**/*.{js,jsx,ts,tsx}";
```

**Caution** Do not also pass `manifest`; it takes priority and skips generation from `input`.

### `css` {#css}

**Purpose** Pass a CSS string directly to the native style compiler without reading a Tailwind entry file.

**When to use** Use it for compiler tests, generated CSS, or custom tools that already hold CSS in memory. It is not the recommended long-term mode for an Expo app.

**Usage** Provide compilable rules with their candidate set:

```js
css: '.text-red { color: #ef4444; }',
classSet: ['text-red'],
```

**Caution** `input` has higher priority than `css`; the inline string is ignored when both are configured.

### `manifest` {#manifest}

**Purpose** Register an existing `NativeStyleManifest` and skip Tailwind generation and CSS compilation.

**When to use** Use it when a prebuild already generated and validated the manifest, when inputs must be fully reproducible, or when an external build system owns styles.

**Usage** Import a manifest with the current `version: 1` shape:

```js
const manifest = require('./native-style-manifest.json')
withWeappTailwindcss(config, { projectRoot: __dirname, manifest })
```

**Caution** It has the highest input priority. Once supplied, `input`, `css`, and their generation warnings do not participate in that registration.

### `classSet` {#classset}

**Purpose** Provide exact Tailwind tokens shared by CSS compilation, the manifest `classSet`, and Babel static `className` transformation.

**When to use** Use it to constrain CSS-string compilation or to supply complete candidates that static source scanning cannot discover.

**Usage** Pass complete, real candidates only:

```js
classSet: ['p-4', 'dark:bg-black', 'ios:pt-8', 'android:pt-6']
```

**Caution** Do not pass heuristic fragments or maintain a second list that drifts from `@source`. With `input + sourceGlobs`, fix the scan range first.

### `sourceGlobs` {#sourceglobs}

**Purpose** Tell the Tailwind generator which JS, TS, and JSX/TSX files to scan, and add each glob's static root to Metro watching.

**When to use** Set it for Expo Router, a `src` directory, workspace UI packages, or any layout not fully described by the CSS entry's `@source` declarations.

**Usage** Globs resolve from `projectRoot`:

```js
sourceGlobs: [
  './app/**/*.{js,jsx,ts,tsx}',
  './src/**/*.{js,jsx,ts,tsx}',
  './packages/ui/**/*.{js,jsx,ts,tsx}',
]
```

**Caution** Dynamic construction such as `` `bg-${color}-500` `` is still undiscoverable. Enumerate complete tokens or add exact `classSet` entries.

### `watchFiles` {#watchfiles}

**Purpose** Add files or directories outside candidate scanning as manifest refresh dependencies.

**When to use** Use it when theme JSON, design tokens, generator inputs, or external configuration should regenerate the manifest after a change.

**Usage** Paths resolve from `projectRoot`, and both files and directories are supported:

```js
watchFiles: ['./theme/tokens.json', './config/native-theme.ts']
```

**Caution** `input` and the static roots of `sourceGlobs` are watched automatically. Watching triggers regeneration; it does not make an unscanned file produce candidates.

## CSS, Babel, and runtime model

Import the type augmentation in the application:

```ts title="native-env.d.ts"
import '@weapp-tailwindcss/react-native/env'
```

- A complete static `className` compiles to a stable `StyleSheet` lookup.
- A dynamic class uses `tw(value)` and resolves only exact candidates present in the manifest.
- `dark:`, `ios:`, `android:`, and `native:` select rules from `Appearance` and `Platform.OS`.
- A normal inline `style` overrides Tailwind; an `!important` Tailwind rule overrides inline style.
- Unsupported declarations enter `manifest.warnings` and are not silently passed to `StyleSheet.create`.

Custom components still need to accept and handle `className` and `style`. Do not register `@tailwindcss/vite` or `@tailwindcss/postcss` to generate a second style source.

## Validation

- Metro loads the entry and generates a manifest; representative tokens appear in both `classSet` and `staticLookup`.
- After changing `input`, source files, or `watchFiles`, the refreshed manifest no longer references stale style IDs.
- CI checks `manifest.warnings` and makes an explicit decision for every unsupported declaration.
- Expo Web is only a smoke test; verify layout, color mode, platform variants, and inline style precedence on Android and iOS simulators or devices.
