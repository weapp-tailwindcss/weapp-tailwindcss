# @weapp-tailwindcss/variants

## 0.2.10

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - @weapp-tailwindcss/merge@2.2.7
  - @weapp-tailwindcss/runtime@0.1.11

## 0.2.9

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/merge@2.2.6
  - @weapp-tailwindcss/runtime@0.1.10

## 0.2.8

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/merge@2.2.5

## 0.2.7

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/merge@2.2.4
  - @weapp-tailwindcss/runtime@0.1.9

## 0.2.6

### Patch Changes

- 统一跨构建器编译状态与生命周期协议，新增可复用的 compiler host、事件总线和 runtime state，同时收敛 PostCSS、编译器和运行时衍生包的依赖版本 catalog，保持现有导入路径兼容。

## 0.2.5

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - @weapp-tailwindcss/merge@2.2.3
  - @weapp-tailwindcss/runtime@0.1.8

## 0.2.4

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/merge@2.2.2`, `@weapp-tailwindcss/runtime@0.1.7`

## 0.2.3

### Patch Changes

- 📦 **Dependencies** [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  → `@weapp-tailwindcss/runtime@0.1.6`, `@weapp-tailwindcss/merge@2.2.1`

## 0.2.3-next.0

### Patch Changes

- 📦 **Dependencies** [`01a0cb2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/01a0cb2f40b59e7989622f22635d0df832b439a1)
  → `@weapp-tailwindcss/runtime@0.1.6-next.0`, `@weapp-tailwindcss/merge@2.2.1-next.0`

## 0.2.2

### Patch Changes

- 📦 **Dependencies** [`acc3907`](https://github.com/sonofmagic/weapp-tailwindcss/commit/acc390788e8e70cca66ce3e3c5911e0336b18fc2)
  → `@weapp-tailwindcss/merge@2.2.0`

## 0.2.2-next.0

### Patch Changes

- 📦 **Dependencies** [`acc3907`](https://github.com/sonofmagic/weapp-tailwindcss/commit/acc390788e8e70cca66ce3e3c5911e0336b18fc2)
  → `@weapp-tailwindcss/merge@2.2.0-next.0`

## 0.2.1

### Patch Changes

- 📦 **Dependencies** [`bb3ad1e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bb3ad1ea2c1794a0559580a074b0c64927ac9ea9)
  → `@weapp-tailwindcss/merge@2.1.6`

## 0.2.0

### Minor Changes

- ✨ **新增 create 默认配置入口，支持向 tailwind-merge 透传 twMergeConfig 等参数。** [`59e4131`](https://github.com/sonofmagic/weapp-tailwindcss/commit/59e4131fd7c355fc769517c8823d6b53d7457365) by @sonofmagic

## 0.1.7

### Patch Changes

- 🐛 **chore: 升级到 "@weapp-core/escape": "~7.0.0"** [`4bbda03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bbda03bc7f924bc7ef75291d27316309c827c58) by @sonofmagic
- 📦 **Dependencies** [`4bbda03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bbda03bc7f924bc7ef75291d27316309c827c58)
  → `@weapp-tailwindcss/runtime@0.1.5`, `@weapp-tailwindcss/merge@2.1.5`

## 0.1.6

### Patch Changes

- 🐛 **修复类型声明与 VariantProps 导出，并为相关运行时包补充 tsd 类型测试。** [`edb9d7a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/edb9d7ae31d5e0ea36647e9738639a830e54679f) by @sonofmagic

## 0.1.5

### Patch Changes

- 📦 **Dependencies** [`ff1a74b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ff1a74b0e70de0ef723e1164b75af6e452f9cb02)
  → `@weapp-tailwindcss/runtime@0.1.4`, `@weapp-tailwindcss/merge@2.1.4`

## 0.1.4

### Patch Changes

- [`43f062b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/43f062b3d65a2c0b4c4b127d33d3a9cbd1180e9a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复缓存淘汰逻辑的类型问题，减少 escape/unescape 的多余处理，带来更平滑的性能提升。

- Updated dependencies [[`3ed3aa8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3ed3aa817a68dae544baf434316399cc78c15b99), [`43f062b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/43f062b3d65a2c0b4c4b127d33d3a9cbd1180e9a)]:
  - @weapp-tailwindcss/runtime@0.1.3
  - @weapp-tailwindcss/merge@2.1.3

## 0.1.3

### Patch Changes

- [`c9baaa5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c9baaa595f7f902243f4001c29a94340adb70f1a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 tailwind-variants 升级后内部 chunk 入口失效的问题，改用官方导出的 tv/createTV/cx，并确保 cn/cnBase 继续执行小程序转义与合并逻辑。

## 0.1.2

### Patch Changes

- [`db0d5b9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/db0d5b9ae3dc1af7cb293142b8da0cf5d6b2b657) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 提取并统一 rpx 任意值的长度处理逻辑，修复 `text|border|bg|outline|ring-[…rpx]` 被当作颜色合并的问题，并补充对应的运行时与快照单测。

- Updated dependencies [[`db0d5b9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/db0d5b9ae3dc1af7cb293142b8da0cf5d6b2b657)]:
  - @weapp-tailwindcss/runtime@0.1.2
  - @weapp-tailwindcss/merge@2.1.2

## 0.1.1

### Patch Changes

- [`7c7b732`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7c7b732c511f47a089e73ecfd7ace091532e170f) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: update package.json meta exports

- Updated dependencies [[`0a0c780`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0a0c7803d0ec9e1c67f555d12c074a6d3f33b1ac), [`7c7b732`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7c7b732c511f47a089e73ecfd7ace091532e170f), [`e6c9192`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e6c9192cad6925cf4b42c029b9846d2f842351b0)]:
  - @weapp-tailwindcss/merge@2.1.1
  - @weapp-tailwindcss/runtime@0.1.1

## 0.1.0

### Minor Changes

- [`50e85e3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/50e85e3b8b4f31d07d20a7d258ab9e2212c4ac31) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构 `@weapp-tailwindcss/merge` 体系：把核心运行时代码提取到 `@weapp-tailwindcss/runtime`，并将 cva、variants、v3 runtime 拆分成独立包，同时将 `weappTwIgnore`/`clsx` 等公共能力统一由 runtime 对外导出，避免子包之间重复依赖。

### Patch Changes

- Updated dependencies [[`50e85e3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/50e85e3b8b4f31d07d20a7d258ab9e2212c4ac31)]:
  - @weapp-tailwindcss/runtime@0.1.0
  - @weapp-tailwindcss/merge@2.1.0
