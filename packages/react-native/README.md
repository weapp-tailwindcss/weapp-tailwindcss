# @weapp-tailwindcss/react-native

> English | [简体中文](./README.zh-CN.md)

A Tailwind CSS v4 compiler for React Native and Expo. It reuses source scanning and candidate generation from `weapp-tailwindcss`, then compiles CSS into a serializable React Native style manifest without adding NativeWind or a `react-native-css` runtime.

## Installation

```bash
pnpm add @weapp-tailwindcss/react-native tailwindcss
```

## Expo and Metro

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  input: './global.css',
  sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}'],
})
```

Metro scans sources, builds the exact candidate set and manifest, and connects the Babel JSX transform to the existing Expo transformer. You do not need to maintain a second `classNameSet`.

`withWeappTailwindcss` accepts `projectRoot`, `input`, `css`, `manifest`, `classSet`, `sourceGlobs`, and `watchFiles`. See the [React Native / Expo configuration reference](https://tw.weapp.dev/docs/config/react-native) for the full field list, manifest shape, and non-Expo Metro usage.

On Android and iOS, the Metro integration resolves `react` and `react-native` from the app `projectRoot`. This keeps linked workspace packages from bundling a second React Native runtime that does not match the native binary. Expo's normal platform resolver remains unchanged on Web.

## Runtime model

- Static `className` values compile to pre-generated StyleSheet lookups without calling `tw()` during render.
- Dynamic class values are resolved through `tw(value)` at runtime.
- Regular inline `style` overrides Tailwind classes, while `!important` classes override inline styles.
- Unsupported CSS declarations are recorded in manifest `warnings` instead of producing incorrect native styles silently.
- The compiler only emits React Native style properties it recognizes; browser-only or unknown declarations never pass through to `StyleSheet.create`.
- `dark:`, `ios:`, `android:`, and `native:` are conditional native variants. State, responsive, structural, and other browser selector variants are reported as unsupported instead of being applied unconditionally.
- Static StyleSheet IDs are stable across unrelated class additions and CSS value changes, so Metro CSS HMR cannot redirect an existing Babel lookup to another rule.

`tw()` and `getStaticStyle()` return React Native `StyleProp` values, which can be passed directly to View, Text, and Image styles. They may contain registered StyleSheet IDs or arrays; use `StyleSheet.flatten()` when you need to inspect individual properties. `composeStyle()` preserves the inline style type, including `false`, `null`, and nested arrays.

## Public entry points

The package exposes `compiler`, `tailwind`, `babel`, `metro`, `runtime`, and the platform-neutral `env` type entry. Custom Metro setups can compose these entry points directly.

Node-only tooling without the optional React Native peer should import `compiler`, `tailwind`, or `metro` directly. The root and `runtime` entries expose native `StyleProp` types and require React Native types in TypeScript projects.

## Scope

This package generates React Native style manifests. It does not emit Web CSS or mini-program WXSS and does not add NativeWind or a browser CSS runtime to the application.

## Documentation

See the [React Native and Expo guide](https://tw.weapp.dev/docs/quick-start/react-native-expo) for the complete setup.

The repository compatibility lab reuses the 118-case Tailwind catalog across Expo Web, Android, and iOS. Run `pnpm e2e:react-native:all` for the complete gate, or use `pnpm e2e:react-native-compatibility`, `pnpm e2e:react-native:web`, `pnpm e2e:react-native:android`, and `pnpm e2e:react-native:ios` separately to reproduce its static, runtime, screenshot, and separate TSX/CSS HMR gates. Use `pnpm e2e:react-native:update` only when intentionally refreshing static evidence.
