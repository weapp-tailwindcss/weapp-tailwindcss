# @weapp-tailwindcss/env

> [English](./README.md) | 简体中文

用于 Node.js 构建期的环境、框架、平台与 HBuilderX 识别工具。没有运行时依赖，提供 ESM 和 CommonJS 入口。

## 安装

```sh
pnpm add @weapp-tailwindcss/env
```

## 使用

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

支持 weapp-vite、MPX、Taro、uni-app、uni-app Vite 和 uni-app x。`detectAppType` 按显式 manifest、显式 package 信息、项目文件、环境提示的顺序判断。默认向父目录查找，`searchUp: false` 仅检查传入根目录；无法识别时返回 `undefined`。

项目的 `manifest.json` 支持行注释和块注释，包括官方 uni-app x manifest 的格式。字符串内容保持原样，损坏的 JSON 继续回退到其他识别来源。`package.json` 仍按严格 JSON 解析；不支持尾逗号。

显式 `env` 是隔离快照：缺失字段不会继承进程环境。省略快照时，环境函数在每次调用时读取当前进程。`detectAppType` 仅在 `detectEnv: true` 时读取进程环境；单值平台函数省略参数或传入 `undefined` 时仍使用对应环境变量。

`resolveTaroPlatformFromEnv(env)` 读取 `TARO_ENV`。`resolveMpxPlatformFromEnv(env)` 读取 `MPX_CURRENT_TARGET_MODE ?? MPX_CLI_MODE`，current mode 的空字符串也优先于 CLI mode。传入 `{}` 可在平台缺失时保持隔离；省略快照或传入 `undefined` 则读取当前进程环境。

## 平台身份

`resolvePlatformIdentity(platform, appType?)` 保留原始输入，将去除首尾空格并转为小写的值放在 `normalized`，通过 `canonical` 提供已知平台的统一身份。Taro 的 `weapp`、MPX 的 `wx` 和 uni-app 的 `mp-weixin` 都得到 `mp-weixin`；`h5` 与 `web` 都得到 `web`。MPX 专用的 `ali`、`dd` 仅在 `appType` 为 `mpx` 时映射。

统一身份包括 `mp-weixin`、`mp-alipay`、`mp-baidu`、`mp-qq`、`mp-toutiao`、`mp-jd`、`mp-dingtalk`、`web`、`app`、`app-plus`、`app-android`、`app-ios`、`app-harmony`。未知或空输入的 `canonical` 为 `undefined`，`app` 与 `app-plus` 保持区别。既有平台函数保持原有的 `raw`、`normalized` 和分类标记返回形状；统一身份不负责选择编译 target 或声明宿主支持范围。

## 检测报告

`detectAppTypeReport(options?)` 接受与 `detectAppType` 相同的选项，返回 `{ appType, candidates, conflicts }`。`appType` 沿用原有框架优先级；每个候选包含 `appType` 和 `evidence` 数组。证据包含 `source`、命中 `key`，以及可选的 `path` 和 `value`。来源包括 `manifest`、`dependency`、`script`、`package-field`、`marker`、`env`、`hbuilderx`。依赖与脚本的 key 包含 package 字段，例如 `dependencies.@tarojs/runtime`、`scripts.build`；环境 key 直接使用变量名。从项目文件读取的证据通过 `path` 标明文件绝对路径。

报告只收集首个命中阶段的候选：显式 manifest、显式 package 信息、根目录 marker、最近命中目录的 manifest 或 package、环境提示。该阶段命中后即停止，不额外扫描目录或优先级更低的来源。`conflicts` 列出与选中的 `appType` 属于不同框架家族的其他候选；uni-app 各变体属于同一家族的细化，不互相报告为冲突。无法识别时 `appType` 为 `undefined`，`candidates` 和 `conflicts` 为空数组。环境快照和 `searchUp` 保持普通检测的边界。

package scripts 仅在实际命令位置出现受支持的框架可执行程序时提供证据。支持直接命令、常见的 `pnpm`、`npx`、`cross-env` 包裹及命令链；`eslint weapp-vite.config.ts` 这样的文件参数和打印出的命令名不会触发框架检测。检测过程只检查脚本内容，不执行脚本。

## API

- 框架检测：`detectAppType`、`detectAppTypeReport`、`detectAppTypeFromEnv`、`detectAppTypeFromPackageJson`。
- 配置判断：`isMpxPackage`、`isTaroPackage`、`isUniAppPackage`、`isUniAppVitePackage`、`isUniAppXPackage`、`isWeappVitePackage`、`isUniAppXManifest`。
- 环境提示：`isRunningInHBuilderX`。
- 平台：`resolvePlatform`、`resolvePlatformIdentity`、`resolveMpxPlatform`、`resolveMpxPlatformFromEnv`、`resolveTaroPlatform`、`resolveTaroPlatformFromEnv`、`resolveUniPlatform`、`resolveUniUtsPlatform`、`resolveUniAppXPlatform`、`resolveUniPlatformsFromEnv`、`normalizeFrameworkStylePlatform`。
- 类型：`DetectableAppType`、`DetectAppTypeOptions`、`AppTypeDetectionReport`、`AppTypeDetectionCandidate`、`AppTypeDetectionEvidence`、`CanonicalPlatform`、`PlatformIdentityInfo`、`FrameworkEnv`、`HBuilderXRuntimeHints`、`PackageJsonLike`、`UniAppManifestLike`、`UniPlatformInfo`。

本包提供事实识别，由调用方决定构建器分支、生成器 target 和样式策略。`weapp-tailwindcss` 与 `weapp-tailwindcss/framework` 的既有导入继续可用，两个新增 API 及其类型也通过主包的 framework 兼容层提供。`normalizeFrameworkStylePlatform` 可从本包导入；Vite 专用的 `resolveImplicitAppTypeFromViteRoot` 保留在主包。
