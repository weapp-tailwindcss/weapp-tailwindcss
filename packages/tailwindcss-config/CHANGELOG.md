# tailwindcss-config

## 2.0.6

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - @weapp-tailwindcss/shared@2.0.4

## 2.0.5

### Patch Changes

- 统一来源扫描基础设施与共享语义契约，修复 Windows glob、qxml、绝对来源排除及配置更新缓存；拆分 PostCSS 子路径和核心扫描职责，解除值依赖循环与核心对构建器的反向引用，CLI 与 PostCSS 复用生成会话扫描并释放资源。

  进一步将通用生成编排与候选状态迁入核心，兼容扫描入口统一使用 AST 来源描述与显式扫描策略。Webpack、Rspack、Gulp 共用真实生成与增量扫描契约，修复 Gulp 禁用自动扫描后的候选泄漏、watch 候选失效，以及 Webpack/Rspack 新增来源文件未触发 CSS 重建的问题。

  生成引擎按内容指纹复用本地配置及插件模块，避免重复遍历和执行未变更依赖；配置或间接依赖更新及显式会话失效仍触发刷新。配置加载器保留 Jiti 转换缓存，每次读取前清理配置的本地模块依赖图，兼顾间接依赖更新正确性与 CommonJS 原生加载性能。

  生成模块缓存的异步上下文在最后一个并发调用结束后停用，避免后续构建继续承担异步跟踪开销；成功与异常路径均释放，并保留并发生成之间的上下文隔离。

  Webpack/Rspack 的来源监听根据 glob 静态前缀注册目录，避免配置基准目录导致整棵项目树进入递归快照；尚未创建的目录登记为缺失依赖，保留新增来源触发生成的行为。

  候选报告采用有限并发读取，避免串行文件等待与构建任务相互阻塞；结果顺序、候选位置及单文件失败报告保持稳定。CSS 来源缓存的配置元数据检查与同步 CSS 读取在同一轮完成，配置修改、删除及重建仍会刷新来源。

  候选删除时仅重建累积输出的编译器，复用同一生成会话的 design system，减少 HMR 重复解析主题和插件的内存分配；源码、配置或依赖失效仍同时刷新编译器与 design system。

## 2.0.4

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - @weapp-tailwindcss/shared@2.0.3

## 2.0.3

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/shared@2.0.2`

## 2.0.2

### Patch Changes

- 🐛 **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic
- 📦 **Dependencies** [`8d9cc88`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d9cc8878cc430a4953579e2c76213402f0932e1)
  → `@weapp-tailwindcss/shared@2.0.1`

## 2.0.1

### Patch Changes

- 🐛 **修复 `@weapp-tailwindcss/postcss` 产物在 Vite/Vitest SSR 中可能被错误重写并触发 `Unexpected token ':'` 的问题，同时修正 `tailwindcss-config` 的源码导入扩展名，提升发布产物与测试链路稳定性。** [`0e08dac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e08dacbe3de03a83a5c7b675adffaf6d0e81e3f)

## 2.0.0

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

### Patch Changes

- 🐛 **修复发布产物的 ESM 入口文件名与 `package.json` 导出声明不一致的问题，确保依赖已发布 `weapp-tailwindcss` 的 benchmark 工作区可以正确加载 Tailwind 配置工具包。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 workspace 源码入口在 CommonJS 构建环境中加载时的 ESM 相对导入解析问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
- 📦 **Dependencies** [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  → `@weapp-tailwindcss/shared@2.0.0`

## 2.0.0-next.3

### Patch Changes

- 📦 **Dependencies** [`aaba811`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaba811cfc2ad003d3daf2cf290c9d8b770c6dfb)
  → `@weapp-tailwindcss/shared@2.0.0-next.1`

## 2.0.0-next.2

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#882](https://github.com/sonofmagic/weapp-tailwindcss/pull/882) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

### Patch Changes

- 📦 **Dependencies** [`2d2acf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d2acf29cfee02ffb32783c8bd3c5de8d9aab9df)
  → `@weapp-tailwindcss/shared@2.0.0-next.0`

## 1.1.6-next.1

### Patch Changes

- 🐛 **修复发布产物的 ESM 入口文件名与 `package.json` 导出声明不一致的问题，确保依赖已发布 `weapp-tailwindcss` 的 benchmark 工作区可以正确加载 Tailwind 配置工具包。** [#856](https://github.com/sonofmagic/weapp-tailwindcss/pull/856) by @github-actions

## 1.1.6-next.0

### Patch Changes

- 🐛 **修复 workspace 源码入口在 CommonJS 构建环境中加载时的 ESM 相对导入解析问题。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

## 1.1.5

### Patch Changes

- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3`

## 1.1.5-alpha.1

### Patch Changes

- 📦 **Dependencies** [`cbead4c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cbead4ced4b7cba116488d745d47bf826bc83859)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.1`

## 1.1.5-alpha.0

### Patch Changes

- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.0`

## 1.1.4

### Patch Changes

- 📦 **Dependencies** [`ccc0a33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccc0a330b5cd455665a0f2f2c3e8895b27a04b52)
  → `@weapp-tailwindcss/shared@1.1.2`

## 1.1.3

### Patch Changes

- Updated dependencies [[`1788e26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1788e26153bafc865776d5a761c2e28dafff6918)]:
  - @weapp-tailwindcss/shared@1.1.1

## 1.1.2

### Patch Changes

- [`1be5402`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1be5402e56f68cf024d0a3eee1a6fdfa827767c6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 新增跨文件 JS 模块图，沿着 import 与 re-export 链路收集并转译类名，实现一次处理整条依赖链，同时允许调用方通过新增的 handler 选项主动开启。`tailwindcss-config` 也改为复用共享工具以保持一致。当本地未安装 `tailwindcss` 时，将提示一次警告并使用空实现兜底，避免直接抛错。

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0

## 1.1.2-alpha.0

### Patch Changes

- [`1be5402`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1be5402e56f68cf024d0a3eee1a6fdfa827767c6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 新增跨文件 JS 模块图，沿着 import 与 re-export 链路收集并转译类名，实现一次处理整条依赖链，同时允许调用方通过新增的 handler 选项主动开启。`tailwindcss-config` 也改为复用共享工具以保持一致。当本地未安装 `tailwindcss` 时，将提示一次警告并使用空实现兜底，避免直接抛错。

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0-alpha.0

## 1.1.1

### Patch Changes

- [`c7892d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c7892d699d798abe27c63d1345423a5ac147cc76) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 优化 css 生成

## 1.0.1

### Patch Changes

- [`3248d34`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3248d342d07372e0627e21dcdd528ad44d2b52be) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.1-alpha.0

### Patch Changes

- [`3248d34`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3248d342d07372e0627e21dcdd528ad44d2b52be) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.0

### Major Changes

- [`406a9a6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/406a9a646051d497ae7ee5d50334a0a22bf8bbfe) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat!: change default return result

## 1.0.0-alpha.0

### Major Changes

- [`406a9a6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/406a9a646051d497ae7ee5d50334a0a22bf8bbfe) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat!: change default return result
