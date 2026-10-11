# @weapp-tailwindcss/env

> English | [简体中文](./README.zh-CN.md)

Node.js build-time helpers for detecting mini-app frameworks, platforms and HBuilderX. The package has no runtime dependencies and supports ESM and CommonJS.

## Install

```sh
pnpm add @weapp-tailwindcss/env
```

## Usage

```ts
import { detectAppType, normalizeFrameworkStylePlatform, resolveUniPlatformsFromEnv } from '@weapp-tailwindcss/env'

const appType = detectAppType({ root: process.cwd(), detectEnv: true })
const platform = normalizeFrameworkStylePlatform('wx', 'mpx') // mp-weixin
const { uniPlatform } = resolveUniPlatformsFromEnv({ UNI_PLATFORM: 'h5' })
```

Framework detection supports weapp-vite, MPX, Taro, uni-app, uni-app Vite and uni-app x. `detectAppType` checks an explicit manifest, explicit package metadata, project files, then environment hints. Parent directory search defaults to enabled; use `searchUp: false` to inspect only the supplied root. Unknown frameworks return `undefined`.

An explicit `env` object is an isolated snapshot: missing fields never inherit process variables. Without a snapshot, environment helpers read the current process on each call. `detectAppType` only reads process variables when `detectEnv: true`; individual platform resolvers retain their default environment value when called without a value or with `undefined`.

## API

- Framework detection: `detectAppType`, `detectAppTypeFromEnv`, `detectAppTypeFromPackageJson`.
- Metadata predicates: `isMpxPackage`, `isTaroPackage`, `isUniAppPackage`, `isUniAppVitePackage`, `isUniAppXPackage`, `isWeappVitePackage`, `isUniAppXManifest`.
- Environment hints: `isRunningInHBuilderX`.
- Platforms: `resolvePlatform`, `resolveMpxPlatform`, `resolveTaroPlatform`, `resolveUniPlatform`, `resolveUniUtsPlatform`, `resolveUniAppXPlatform`, `resolveUniPlatformsFromEnv`, `normalizeFrameworkStylePlatform`.
- Types: `DetectableAppType`, `DetectAppTypeOptions`, `FrameworkEnv`, `HBuilderXRuntimeHints`, `PackageJsonLike`, `UniAppManifestLike`, `UniPlatformInfo`.

These helpers report facts. Bundler selection, generator targets and CSS policy belong to the caller. Existing imports from `weapp-tailwindcss` and `weapp-tailwindcss/framework` remain supported. The Vite-specific `resolveImplicitAppTypeFromViteRoot` stays in the main package.
