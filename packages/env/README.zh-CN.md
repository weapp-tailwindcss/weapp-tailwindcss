# @weapp-tailwindcss/env

> [English](./README.md) | 简体中文

用于 Node.js 构建期的环境、框架、平台与 HBuilderX 识别工具。没有运行时依赖，提供 ESM 和 CommonJS 入口。

## 安装

```sh
pnpm add @weapp-tailwindcss/env
```

## 使用

```ts
import { detectAppType, normalizeFrameworkStylePlatform, resolveUniPlatformsFromEnv } from '@weapp-tailwindcss/env'

const appType = detectAppType({ root: process.cwd(), detectEnv: true })
const platform = normalizeFrameworkStylePlatform('wx', 'mpx') // mp-weixin
const { uniPlatform } = resolveUniPlatformsFromEnv({ UNI_PLATFORM: 'h5' })
```

支持 weapp-vite、MPX、Taro、uni-app、uni-app Vite 和 uni-app x。`detectAppType` 按显式 manifest、显式 package 信息、项目文件、环境提示的顺序判断。默认向父目录查找，`searchUp: false` 仅检查传入根目录；无法识别时返回 `undefined`。

显式 `env` 是隔离快照：缺失字段不会继承进程环境。省略快照时，环境函数在每次调用时读取当前进程。`detectAppType` 仅在 `detectEnv: true` 时读取进程环境；单值平台函数省略参数或传入 `undefined` 时仍使用对应环境变量。

## API

- 框架检测：`detectAppType`、`detectAppTypeFromEnv`、`detectAppTypeFromPackageJson`。
- 配置判断：`isMpxPackage`、`isTaroPackage`、`isUniAppPackage`、`isUniAppVitePackage`、`isUniAppXPackage`、`isWeappVitePackage`、`isUniAppXManifest`。
- 环境提示：`isRunningInHBuilderX`。
- 平台：`resolvePlatform`、`resolveMpxPlatform`、`resolveTaroPlatform`、`resolveUniPlatform`、`resolveUniUtsPlatform`、`resolveUniAppXPlatform`、`resolveUniPlatformsFromEnv`、`normalizeFrameworkStylePlatform`。
- 类型：`DetectableAppType`、`DetectAppTypeOptions`、`FrameworkEnv`、`HBuilderXRuntimeHints`、`PackageJsonLike`、`UniAppManifestLike`、`UniPlatformInfo`。

本包提供事实识别，由调用方决定构建器分支、生成器 target 和样式策略。`weapp-tailwindcss` 与 `weapp-tailwindcss/framework` 的既有导入继续可用；Vite 专用的 `resolveImplicitAppTypeFromViteRoot` 保留在主包。
