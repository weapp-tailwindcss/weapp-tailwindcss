# @weapp-tailwindcss/init

## 2.0.2

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- 初始化依赖按 semver 选择目标范围内最高稳定版，无匹配时在写入前报错，避免预发布版及跨主版本回退。Refs #1265。

- Updated dependencies:
  - @weapp-tailwindcss/logger@2.0.4
  - @weapp-tailwindcss/shared@2.0.4

## 2.0.1

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/debug-uni-app-x

  - 更新 dependencies 中的 `fs-extra`：`catalog:buildUtilities`，`范围 ^11.4.0`，`锁定 11.4.0` → `catalog:buildUtilities`，`范围 ^11.4.1`，`锁定 11.4.1`。
  - 更新 devDependencies 中的 `vite`：`7.2.7`，`锁定 7.2.7(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `7.2.7`，`锁定 7.2.7(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### @weapp-tailwindcss/init

  - 更新 dependencies 中的 `fs-extra`：`catalog:buildUtilities`，`范围 ^11.4.0`，`锁定 11.4.0` → `catalog:buildUtilities`，`范围 ^11.4.1`，`锁定 11.4.1`。

  ### @weapp-tailwindcss/lynx

  - 更新 devDependencies 中的 `@lynx-js/rspeedy`：`^0.17.2`，`锁定 0.17.2(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)` → `^0.18.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)`。
  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
  - 更新 peerDependencies 中的 `@lynx-js/rspeedy`：`>=0.16.0`，`锁定 0.17.2(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)` → `>=0.16.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)`。

  ### @weapp-tailwindcss/postcss

  - 更新 dependencies 中的 `postcss-pxtrans`：`catalog:postcssCompat`，`范围 ^1.0.4`，`锁定 1.0.4(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^1.0.5`，`锁定 1.0.5(postcss@8.5.28)`。
  - 更新 dependencies 中的 `postcss-rem-to-responsive-pixel`：`catalog:postcssRem`，`范围 ^7.0.5`，`锁定 7.0.5(postcss@8.5.28)` → `catalog:postcssRem`，`范围 ^7.0.6`，`锁定 7.0.6(postcss@8.5.28)`。
  - 更新 dependencies 中的 `postcss-rule-unit-converter`：`catalog:postcssCompat`，`范围 ^0.2.3`，`锁定 0.2.3(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^0.2.4`，`锁定 0.2.4(postcss@8.5.28)`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 devDependencies 中的 `prettier`：`catalog:prettier371`，`范围 ^3.9.8`，`锁定 3.9.8` → `catalog:prettier371`，`范围 ^3.9.9`，`锁定 3.9.9`。
  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/react-native

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/typography

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.1`，`锁定 1.4.1` → `catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2`。

  ### @weapp-tailwindcss/ui

  - 更新 devDependencies 中的 `@storybook/addon-a11y`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1))` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))`。
  - 更新 devDependencies 中的 `@storybook/react`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)`。
  - 更新 devDependencies 中的 `@storybook/react-vite`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.63.1(patch_hash=c8c92d871ccf0418d1ba8b1f11a3371b706a1787f102194edb01d655e1ae84e0))(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.63.1(patch_hash=c8c92d871ccf0418d1ba8b1f11a3371b706a1787f102194edb01d655e1ae84e0))(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
  - 更新 devDependencies 中的 `storybook`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1)` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1)`。
  - 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### tailwindcss-injector

  - 更新 dependencies 中的 `fs-extra`：`catalog:buildUtilities`，`范围 ^11.4.0`，`锁定 11.4.0` → `catalog:buildUtilities`，`范围 ^11.4.1`，`锁定 11.4.1`。
  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.1`，`锁定 1.4.1` → `catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2`。

  ### weapp-tailwindcss

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.1`，`锁定 1.4.1` → `catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2`。
  - 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。
  - 更新 peerDependencies 中的 `vite`：`^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

## 2.0.0

### Major Changes

- 改善开发体验：新增固定 Generic Web target 的 `weapp-tailwindcss/vite/web` 入口，修正 `doctor` 对官方 Tailwind 生成器和 CSS 入口的诊断，并将初始化器默认切换为 Tailwind CSS 4 CSS-first 流程；旧版初始化配置改为通过 `mode: 'legacy'` 显式启用。

## 1.0.16

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - @weapp-tailwindcss/logger@2.0.3
  - @weapp-tailwindcss/shared@2.0.3

## 1.0.15

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/logger@2.0.2`, `@weapp-tailwindcss/shared@2.0.2`

## 1.0.14

### Patch Changes

- 🐛 **统一升级构建链路依赖，并将多个跨包复用的工具依赖提炼到 pnpm catalog，降低版本漂移和后续升级成本。** [`11f26f7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/11f26f7c93f99db9f3f0b7e57c633e8654c2a6a6) by @sonofmagic

## 1.0.13

### Patch Changes

- 🐛 **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic
- 📦 **Dependencies** [`8d9cc88`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d9cc8878cc430a4953579e2c76213402f0932e1)
  → `@weapp-tailwindcss/logger@2.0.1`, `@weapp-tailwindcss/shared@2.0.1`

## 1.0.12

### Patch Changes

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **调整初始化生成的 PostCSS 配置：生成模式下不再注册 `tailwindcss` PostCSS 插件，只保留 `autoprefixer` 等后处理插件。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **移除初始化流程和核心包安装生命周期中的 `weapp-tw patch` 自动入口。当前生成模式会在构建运行时接管 Tailwind CSS 补丁与类名收集，新项目不再需要把补丁命令写入 `postinstall`；旧 CSS 后处理链路仍可手动执行 `weapp-tw patch` 或 `weapp-tw status` 排查状态。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 执行 `weapp-tw patch` 时会提示 `weapp-tailwindcss@5` 生成模式不再需要该指令，也不需要配置 `postinstall` 这个 npm hook，避免新项目继续复制旧链路配置。
- 📦 **Dependencies** [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  → `@weapp-tailwindcss/shared@2.0.0`, `@weapp-tailwindcss/logger@2.0.0`

## 1.0.12-next.4

### Patch Changes

- 📦 **Dependencies** [`aaba811`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaba811cfc2ad003d3daf2cf290c9d8b770c6dfb)
  → `@weapp-tailwindcss/shared@2.0.0-next.1`

## 1.0.12-next.3

### Patch Changes

- 📦 **Dependencies** [`2d2acf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d2acf29cfee02ffb32783c8bd3c5de8d9aab9df)
  → `@weapp-tailwindcss/logger@2.0.0-next.0`, `@weapp-tailwindcss/shared@2.0.0-next.0`

## 1.0.12-next.2

### Patch Changes

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

## 1.0.12-next.1

### Patch Changes

- 🐛 **移除初始化流程和核心包安装生命周期中的 `weapp-tw patch` 自动入口。当前生成模式会在构建运行时接管 Tailwind CSS 补丁与类名收集，新项目不再需要把补丁命令写入 `postinstall`；旧 CSS 后处理链路仍可手动执行 `weapp-tw patch` 或 `weapp-tw status` 排查状态。** [#853](https://github.com/sonofmagic/weapp-tailwindcss/pull/853) by @github-actions
  - 执行 `weapp-tw patch` 时会提示 `weapp-tailwindcss@5` 生成模式不再需要该指令，也不需要配置 `postinstall` 这个 npm hook，避免新项目继续复制旧链路配置。

## 1.0.12-next.0

### Patch Changes

- 🐛 **调整初始化生成的 PostCSS 配置：生成模式下不再注册 `tailwindcss` PostCSS 插件，只保留 `autoprefixer` 等后处理插件。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

## 1.0.11

### Patch Changes

- 🐛 **修复 Vite 集成在 dts 构建阶段替换 postcss 插件时触发的类型递归比较问题，避免 TS2321 与 TS2345 导致构建失败。** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe) by @sonofmagic
  - 同时升级部分依赖与工作区 catalog 版本（包括 postcss、fs-extra、storybook 等），并同步更新锁文件以保持依赖解析一致性。

- 🐛 **升级 `tailwindcss-patch` 到 `9` 系列最新版本，并同步更新相关依赖。** [`38c11e7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/38c11e78a0c1f31d7635a98c95fbfe624723c4c3) by @sonofmagic
- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3`

## 1.0.11-alpha.1

### Patch Changes

- 🐛 **升级 `tailwindcss-patch` 到 `8.7.4-alpha.0`，同步消费最新的 alpha 版本依赖。** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
- 📦 **Dependencies** [`cbead4c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cbead4ced4b7cba116488d745d47bf826bc83859)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.1`

## 1.0.11-alpha.0

### Patch Changes

- 🐛 **修复 Vite 集成在 dts 构建阶段替换 postcss 插件时触发的类型递归比较问题，避免 TS2321 与 TS2345 导致构建失败。** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe) by @sonofmagic
  - 同时升级部分依赖与工作区 catalog 版本（包括 postcss、fs-extra、storybook 等），并同步更新锁文件以保持依赖解析一致性。
- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.0`

## 1.0.10

### Patch Changes

- 📦 **Dependencies** [`ccc0a33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccc0a330b5cd455665a0f2f2c3e8895b27a04b52)
  → `@weapp-tailwindcss/shared@1.1.2`

## 1.0.9

### Patch Changes

- Updated dependencies [[`1788e26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1788e26153bafc865776d5a761c2e28dafff6918)]:
  - @weapp-tailwindcss/shared@1.1.1

## 1.0.8

### Patch Changes

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0

## 1.0.8-alpha.0

### Patch Changes

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0-alpha.0

## 1.0.7

### Patch Changes

- [`4ffb90b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4ffb90bc754459d93929d2de3a843d46edc48f53) Thanks [@sonofmagic](https://github.com/sonofmagic)! - <br/>

  ## Features

  feat(postcss): 添加 `postcss-value-parser` 作为依赖，添加新的 `postcss` 插件 `postcss-remove-include-custom-properties`

  feat(weapp-tailwindcss): 计算模式增强，允许只限定某些特殊的 `custom-properties` 被计算，这样只在遇到不兼容的情况下，才需要开启这个配置

  比如 cssCalc: 设置为 `['--spacing']`, 那么就会把 `tailwindcss` 中的 `--spacing` 值进行计算，其他值则不进行计算

  ## Chore

  chore(deps): upgrade

## 1.0.6

### Patch Changes

- Updated dependencies [[`6e9cbc4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6e9cbc46cc954a02cb45542fbebf10d313fc16ea)]:
  - @weapp-tailwindcss/logger@1.1.0

## 1.0.6-alpha.0

### Patch Changes

- Updated dependencies [[`6e9cbc4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6e9cbc46cc954a02cb45542fbebf10d313fc16ea)]:
  - @weapp-tailwindcss/logger@1.1.0-alpha.0

## 1.0.5

### Patch Changes

- [`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 对 postcss-html-transform 进行二次封装

## 1.0.5-alpha.0

### Patch Changes

- [`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 对 postcss-html-transform 进行二次封装

## 1.0.4

### Patch Changes

- [`c7892d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c7892d699d798abe27c63d1345423a5ac147cc76) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 优化 css 生成

## 1.0.3

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1)]:
  - @weapp-tailwindcss/logger@1.0.2
  - @weapp-tailwindcss/shared@1.0.3

## 1.0.3-alpha.0

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1)]:
  - @weapp-tailwindcss/logger@1.0.2-alpha.0
  - @weapp-tailwindcss/shared@1.0.3-alpha.0

## 1.0.2

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9)]:
  - @weapp-tailwindcss/logger@1.0.1
  - @weapp-tailwindcss/shared@1.0.2

## 1.0.2-alpha.0

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9)]:
  - @weapp-tailwindcss/logger@1.0.1-alpha.0
  - @weapp-tailwindcss/shared@1.0.2-alpha.0

## 1.0.1

### Patch Changes

- Updated dependencies [[`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61)]:
  - @weapp-tailwindcss/shared@1.0.1

## 1.0.1-alpha.0

### Patch Changes

- Updated dependencies [[`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61)]:
  - @weapp-tailwindcss/shared@1.0.1-alpha.0

## 1.0.0

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - ## Feature

  增加 `@weapp-tailwindcss/merge` 支持，这是 `weapp-tailwindcss` 版本的 `tailwindcss-merge` 和 `cva` 方法

  ## Breaking Changes
  1. 去除 `weapp-tailwindcss/postcss` (可直接安装使用 `@weapp-tailwindcss/postcss`)
  2. 增加 `weapp-tailwindcss/escape` 来取代 `weapp-tailwindcss/replace`
  3. 项目 monorepo 区分包

### Patch Changes

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

- [`de0e4d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de0e4d8f38477e806df74b24926d280319ac8419) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: move init into `@weapp-tailwindcss/init`

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- Updated dependencies [[`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875), [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d), [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b), [`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22), [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8)]:
  - @weapp-tailwindcss/logger@1.0.0
  - @weapp-tailwindcss/shared@1.0.0

## 1.0.0-alpha.5

### Patch Changes

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- Updated dependencies [[`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8)]:
  - @weapp-tailwindcss/logger@1.0.0-alpha.3
  - @weapp-tailwindcss/shared@1.0.0-alpha.4

## 1.0.0-alpha.4

### Patch Changes

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

- Updated dependencies [[`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b)]:
  - @weapp-tailwindcss/logger@1.0.0-alpha.2
  - @weapp-tailwindcss/shared@1.0.0-alpha.3

## 1.0.0-alpha.3

### Patch Changes

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d)]:
  - @weapp-tailwindcss/shared@1.0.0-alpha.2
  - @weapp-tailwindcss/logger@1.0.0-alpha.1

## 1.0.0-alpha.2

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: monorepo changes

### Patch Changes

- Updated dependencies [[`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875)]:
  - @weapp-tailwindcss/logger@1.0.0-alpha.0
  - @weapp-tailwindcss/shared@1.0.0-alpha.1

## 0.0.1-alpha.1

### Patch Changes

- Updated dependencies [[`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22)]:
  - @weapp-tailwindcss/shared@0.0.1-alpha.0

## 0.0.1-alpha.0

### Patch Changes

- [`de0e4d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de0e4d8f38477e806df74b24926d280319ac8419) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: move init into `@weapp-tailwindcss/init`
