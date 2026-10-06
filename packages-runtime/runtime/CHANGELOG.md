# @weapp-tailwindcss/runtime

## 0.1.11

### Patch Changes

- 将类名转义基础包源码纳入本仓库，以 @weapp-tailwindcss/escape 从新版本序列独立发布，并统一替换编译端、PostCSS 和运行时的依赖及类型引用。保留原转义 API、ESM/CJS 入口和映射行为，增加旧发布版对照与新包名打包验证。

  公开 workspace 消费方统一使用 repoctl 要求的 `workspace:*`，发布 tarball 固定到同批 escape 版本，避免保留旧依赖范围策略导致 Release 协议校验失败。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - @weapp-tailwindcss/escape@0.0.2

## 0.1.10

### Patch Changes

- 修复自定义映射和自定义转换器被默认 fast path 跳过的问题，保持反转义、准备、合并、恢复和转义顺序；缓存命中更新 LRU 顺序，继续保持 256 条上限与实例隔离。

## 0.1.9

### Patch Changes

- 导出 `wrapRuntimeAggregator`，让 `@weapp-tailwindcss/cn` 复用有界 LRU 与按需 unescape/escape，并接入与 merge 相同的 rpx 长度归一化，使 `text-red` 与 `text-[80rpx]` 等颜色 + 长度类可以共存。

- 修复 `twMerge` 处理以数字开头的变体类名（如 `2xl:` 等）时的转义与冲突消解问题。

  - 在 `wrapClassAggregator` 中对包含空格的多类名字符串进行分词处理，使每个类名 Token 都能独立应用完整的 escape/unescape 前缀逻辑。
  - 解决数字开头变体类名在小程序运行时冲突未消解、或因丢失下划线前缀导致样式在真机及模拟器中失效的问题。

## 0.1.8

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

## 0.1.7

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic

## 0.1.6

### Patch Changes

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 0.1.6-next.0

### Patch Changes

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

## 0.1.5

### Patch Changes

- 🐛 **chore: 升级到 "@weapp-core/escape": "~7.0.0"** [`4bbda03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bbda03bc7f924bc7ef75291d27316309c827c58) by @sonofmagic

## 0.1.4

### Patch Changes

- 🐛 **允许 `escape`/`unescape` 传入 `true`/`false` 布尔值，并保持默认转换行为一致。** [`ff1a74b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ff1a74b0e70de0ef723e1164b75af6e452f9cb02) by @sonofmagic

## 0.1.3

### Patch Changes

- [`3ed3aa8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3ed3aa817a68dae544baf434316399cc78c15b99) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade "@weapp-core/escape": "~6.0.1"

- [`43f062b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/43f062b3d65a2c0b4c4b127d33d3a9cbd1180e9a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复缓存淘汰逻辑的类型问题，减少 escape/unescape 的多余处理，带来更平滑的性能提升。

## 0.1.2

### Patch Changes

- [`db0d5b9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/db0d5b9ae3dc1af7cb293142b8da0cf5d6b2b657) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 提取并统一 rpx 任意值的长度处理逻辑，修复 `text|border|bg|outline|ring-[…rpx]` 被当作颜色合并的问题，并补充对应的运行时与快照单测。

## 0.1.1

### Patch Changes

- [`7c7b732`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7c7b732c511f47a089e73ecfd7ace091532e170f) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: update package.json meta exports

## 0.1.0

### Minor Changes

- [`50e85e3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/50e85e3b8b4f31d07d20a7d258ab9e2212c4ac31) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构 `@weapp-tailwindcss/merge` 体系：把核心运行时代码提取到 `@weapp-tailwindcss/runtime`，并将 cva、variants、v3 runtime 拆分成独立包，同时将 `weappTwIgnore`/`clsx` 等公共能力统一由 runtime 对外导出，避免子包之间重复依赖。
