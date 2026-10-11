# @weapp-tailwindcss/shared

## 2.0.4

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

## 2.0.3

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

## 2.0.2

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic

## 2.0.1

### Patch Changes

- 🐛 **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic

## 2.0.0

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

### Minor Changes

- ✨ **新增 `splitCandidateTokens` 候选 token 分割入口，并保留 `splitCode` 作为兼容别名。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `weapp-tailwindcss` 内部的 JS、WXML 动态表达式与 uni-app x 局部样式候选分割改为使用更明确的 `splitCandidateTokens`，继续保持 `classNameSet` 精确命中原则，避免普通字符串被误转义。

### Patch Changes

- 🐛 **支持单引号和双引号包裹的 `content-*` 任意值默认同时提取，并将 `arbitraryValues.allowDoubleQuotes` 保留为兼容旧配置的废弃选项。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 2.0.0-next.1

### Minor Changes

- ✨ **新增 `splitCandidateTokens` 候选 token 分割入口，并保留 `splitCode` 作为兼容别名。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `weapp-tailwindcss` 内部的 JS、WXML 动态表达式与 uni-app x 局部样式候选分割改为使用更明确的 `splitCandidateTokens`，继续保持 `classNameSet` 精确命中原则，避免普通字符串被误转义。

### Patch Changes

- 🐛 **支持单引号和双引号包裹的 `content-*` 任意值默认同时提取，并将 `arbitraryValues.allowDoubleQuotes` 保留为兼容旧配置的废弃选项。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 2.0.0-next.0

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#882](https://github.com/sonofmagic/weapp-tailwindcss/pull/882) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

## 1.1.3

### Patch Changes

- 🐛 **性能优化：针对 CSS 选择器转换、JS 处理器、WXML 模板处理等热路径进行多项缓存与计算优化。** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16) by @sonofmagic
  - JS 处理器：复用 `resolveClassNameTransformWithResult` 返回的 `escapedValue` 避免重复 escape 计算；引入 `getReplacement` 缓存消除重复 `replaceWxml` 调用；移除 `escapeStringRegexp` + `new RegExp` 正则编译开销
  - `createJsHandler`：预构建默认 `defaults` 对象，无覆盖选项时跳过 `defuOverrideArray` 合并
  - WXML 模板：`templateReplacer` 支持复用模块级 tokenizer 实例；`createTemplateHandler` 预构建 attribute matcher 并传递给 `customTemplateHandler`
  - PostCSS fallback 选择器解析：为 `transform` 函数添加 selector 级别缓存，避免重复解析相同选择器
  - `splitCode`：为默认和 allowDoubleQuotes 两种模式分别添加结果缓存，预编译分割正则

- 🐛 **升级 `tailwindcss-patch` 到 `9` 系列最新版本，并同步更新相关依赖。** [`38c11e7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/38c11e78a0c1f31d7635a98c95fbfe624723c4c3) by @sonofmagic

## 1.1.3-alpha.1

### Patch Changes

- 🐛 **升级 `tailwindcss-patch` 到 `8.7.4-alpha.0`，同步消费最新的 alpha 版本依赖。** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic

## 1.1.3-alpha.0

### Patch Changes

- 🐛 **性能优化：针对 CSS 选择器转换、JS 处理器、WXML 模板处理等热路径进行多项缓存与计算优化。** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16) by @sonofmagic
  - JS 处理器：复用 `resolveClassNameTransformWithResult` 返回的 `escapedValue` 避免重复 escape 计算；引入 `getReplacement` 缓存消除重复 `replaceWxml` 调用；移除 `escapeStringRegexp` + `new RegExp` 正则编译开销
  - `createJsHandler`：预构建默认 `defaults` 对象，无覆盖选项时跳过 `defuOverrideArray` 合并
  - WXML 模板：`templateReplacer` 支持复用模块级 tokenizer 实例；`createTemplateHandler` 预构建 attribute matcher 并传递给 `customTemplateHandler`
  - PostCSS fallback 选择器解析：为 `transform` 函数添加 selector 级别缓存，避免重复解析相同选择器
  - `splitCode`：为默认和 allowDoubleQuotes 两种模式分别添加结果缓存，预编译分割正则

## 1.1.2

### Patch Changes

- 🐛 **提取常用字符串/数组工具到 shared，并在相关包中复用。** [`ccc0a33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccc0a330b5cd455665a0f2f2c3e8895b27a04b52) by @sonofmagic

## 1.1.1

### Patch Changes

- [`1788e26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1788e26153bafc865776d5a761c2e28dafff6918) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 splitCode 在压缩模板字符串中保留转义空白导致类名匹配遗漏的问题，保证 mp-alipay 等产物的类名替换正常工作。

## 1.1.0

### Minor Changes

- [`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 暴露用于 md5 哈希与拓展名裁剪的 Node 侧工具函数，并重构依赖这些能力的包以统一复用共享实现。

## 1.1.0-alpha.0

### Minor Changes

- [`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 暴露用于 md5 哈希与拓展名裁剪的 Node 侧工具函数，并重构依赖这些能力的包以统一复用共享实现。

## 1.0.3

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.3-alpha.0

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.2

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.2-alpha.0

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.1

### Patch Changes

- [`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 去除 ast-grep 支持，添加字符串字面量和模板字符串作用域扫描功能

## 1.0.1-alpha.0

### Patch Changes

- [`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 去除 ast-grep 支持，添加字符串字面量和模板字符串作用域扫描功能

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

- [`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: move extractors into @weapp-tailwindcss/shared

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.0-alpha.4

### Patch Changes

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.0-alpha.3

### Patch Changes

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

## 1.0.0-alpha.2

### Patch Changes

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.0-alpha.1

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: monorepo changes

## 0.0.1-alpha.0

### Patch Changes

- [`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: move extractors into @weapp-tailwindcss/shared
