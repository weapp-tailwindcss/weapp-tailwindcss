# @weapp-tailwindcss/env

> English | [简体中文](./README.zh-CN.md)

Node.js build-time helpers for detecting mini-app frameworks, platforms and HBuilderX. The package has no runtime dependencies and supports ESM and CommonJS.

## Install

```sh
pnpm add @weapp-tailwindcss/env
```

## Usage

```ts
import { detectAppType, detectAppTypeReport, resolveMpxPlatformFromEnv, resolvePlatformIdentity, resolveTaroPlatformFromEnv, resolveUniPlatformsFromEnv } from '@weapp-tailwindcss/env'

const appType = detectAppType({ root: process.cwd(), detectEnv: true })
const platform = resolvePlatformIdentity('wx', 'mpx')
// { raw: 'wx', normalized: 'wx', canonical: 'mp-weixin' }
const report = detectAppTypeReport({ root: process.cwd(), detectEnv: true })
const { uniPlatform } = resolveUniPlatformsFromEnv({ UNI_PLATFORM: 'h5' })
const taroPlatform = resolveTaroPlatformFromEnv({ TARO_ENV: 'weapp' })
const mpxPlatform = resolveMpxPlatformFromEnv({ MPX_CLI_MODE: 'wx' })
```

Framework detection supports weapp-vite, MPX, Taro, uni-app, uni-app Vite and uni-app x. `detectAppType` checks an explicit manifest, explicit package metadata, project files, then environment hints. Parent directory search defaults to enabled; use `searchUp: false` to inspect only the supplied root. Unknown frameworks return `undefined`.

Project `manifest.json` files accept line and block comments, including the official uni-app x manifest format. Strings are preserved and malformed JSON still falls back to other detection sources. `package.json` remains strict JSON; trailing commas are not supported.

An explicit `env` object is an isolated snapshot: missing fields never inherit process variables. Without a snapshot, environment helpers read the current process on each call. `detectAppType` only reads process variables when `detectEnv: true`; individual platform resolvers retain their default environment value when called without a value or with `undefined`.

`resolveTaroPlatformFromEnv(env)` reads `TARO_ENV`. `resolveMpxPlatformFromEnv(env)` reads `MPX_CURRENT_TARGET_MODE ?? MPX_CLI_MODE`, so an empty current mode takes precedence over the CLI mode. Pass `{}` to resolve an absent platform without inheriting process variables; omit the snapshot or pass `undefined` to read the current process.

## Platform identity

`resolvePlatformIdentity(platform, appType?)` preserves the raw input, trims and lowercases `normalized`, and provides a known `canonical` identity. Taro `weapp`, MPX `wx` and uni-app `mp-weixin` resolve to `mp-weixin`; `h5` and `web` resolve to `web`. MPX-specific `ali` and `dd` resolve only when `appType` is `mpx`.

The canonical identities are `mp-weixin`, `mp-alipay`, `mp-baidu`, `mp-qq`, `mp-toutiao`, `mp-jd`, `mp-dingtalk`, `web`, `app`, `app-plus`, `app-android`, `app-ios` and `app-harmony`. Unknown or empty input has an `undefined` canonical identity. `app` and `app-plus` remain distinct. The existing platform resolvers retain their return shape, including `raw`, `normalized` and classification flags; a canonical identity does not select a compiler target or declare host support.

## Detection reports

`detectAppTypeReport(options?)` accepts the same options as `detectAppType` and returns `{ appType, candidates, conflicts }`. `appType` follows the existing framework priority; each candidate has an `appType` and an `evidence` array. Evidence contains a `source`, the matching `key`, and optional `path` and `value`. Sources are `manifest`, `dependency`, `script`, `package-field`, `marker`, `env` and `hbuilderx`. Dependency and script keys include their package field, such as `dependencies.@tarojs/runtime` and `scripts.build`; environment keys use the variable name. `path` identifies the absolute file path when evidence was read from a project file.

Reports collect candidates only at the first matching stage: an explicit manifest, explicit package metadata, the root marker, the manifest or package at the nearest matching directory, or environment hints. They stop at that stage rather than scanning additional directories or lower-priority sources. `conflicts` lists other candidates from a different framework family than the selected `appType`; uni-app variants are refinements of one family and do not conflict with each other. Empty detection returns an undefined `appType` with empty `candidates` and `conflicts`. Environment snapshots and `searchUp` retain the same boundaries as ordinary detection.

Package scripts provide evidence only when a supported framework executable appears in command position. Direct commands, common `pnpm`, `npx` and `cross-env` wrappers, and command chains are recognized; file arguments such as `eslint weapp-vite.config.ts` and printed command names do not identify a framework. Scripts are inspected without being executed.

## API

- Framework detection: `detectAppType`, `detectAppTypeReport`, `detectAppTypeFromEnv`, `detectAppTypeFromPackageJson`.
- Metadata predicates: `isMpxPackage`, `isTaroPackage`, `isUniAppPackage`, `isUniAppVitePackage`, `isUniAppXPackage`, `isWeappVitePackage`, `isUniAppXManifest`.
- Environment hints: `isRunningInHBuilderX`.
- Platforms: `resolvePlatform`, `resolvePlatformIdentity`, `resolveMpxPlatform`, `resolveMpxPlatformFromEnv`, `resolveTaroPlatform`, `resolveTaroPlatformFromEnv`, `resolveUniPlatform`, `resolveUniUtsPlatform`, `resolveUniAppXPlatform`, `resolveUniPlatformsFromEnv`, `normalizeFrameworkStylePlatform`.
- Types: `DetectableAppType`, `DetectAppTypeOptions`, `AppTypeDetectionReport`, `AppTypeDetectionCandidate`, `AppTypeDetectionEvidence`, `CanonicalPlatform`, `PlatformIdentityInfo`, `FrameworkEnv`, `HBuilderXRuntimeHints`, `PackageJsonLike`, `UniAppManifestLike`, `UniPlatformInfo`.

These helpers report facts. Bundler selection, generator targets and CSS policy belong to the caller. Existing imports from `weapp-tailwindcss` and `weapp-tailwindcss/framework` remain supported, and both new APIs and their types are available through the main package's framework facade. `normalizeFrameworkStylePlatform` is available from this package; the Vite-specific `resolveImplicitAppTypeFromViteRoot` stays in the main package.
