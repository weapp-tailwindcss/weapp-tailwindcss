# weapp-style-injector

## 1.0.8

### Patch Changes

- 统一收口框架配置解析、只读能力契约与编译状态所有权。同配置的独立实例拥有各自的候选、缓存、revision 和运行时；watch 保留会话，后续独立构建创建新会话。配置与环境按实例快照，异步旧结果不能覆盖新配置。

  修正集合快照的间接修改入口，保持内部快照只读、用户原始配置可变。

  Vite 框架按来源、生成、样式和产物职责协作，dispatcher 与内置 injector 共用保留 hook 语义的逐插件代理。Webpack/Rspack、Vite 和 Gulp 在永久关闭时等待已接收任务，释放资源并拒绝后续任务。保持现有公开入口、类型、配置和支持组合。

  异步任务结束时释放活动租约对编译实例的引用，后续任务只继承仍有效的租约，避免长期 watch 上下文保留已完成实例；关闭时继续排空此前已接收的嵌套任务。

  所有实例都没有在途活动时停用共享异步上下文，避免宿主后续任务继续承担传播开销；保持其他实例排空、用户上下文及同步异常释放的正确性。

  Webpack 明确区分宿主任务接收与已接收任务的内部协作。关闭期间从 handler 异步后续重入产物钩子或 loader 时拒绝新任务，原任务仍可完成候选准备与产物提交，再统一释放资源。

  框架请求上下文保留资产视图的惰性访问，避免不使用资产的 JS/CSS 钩子逐请求复制完整 bundle；实际访问仍提供当前产物的只读视图与受限提交操作。

  永久关闭解除真实插件、配置与转换服务的引用；Gulp 排空已接受的文件写入及受管管线转发，保留调用者显式缓存的所有权。Vite 使用当前模块图识别已提交样式，避免连续构建时重复回放并误删合并产物中的框架样式。

  同一编译实例内按完整来源和配置复用串行生成服务，各 root 独立维护候选、revision 与输出缓存；实例之间继续隔离。生成器释放兼容同步实现并允许异步完成结果，关闭时排空在途原生生成任务后再释放资源。

  Vite 按来源标记与具名产物关系撤销 watch 旧哈希样式及派生别名，保留部分构建中的独立投影与有效来源记录；来源删除、产物裁剪和永久关闭同步释放归属索引，避免旧规则重新注入。

  Vite 的 CSS 处理轮次显式传递来源捕获服务，移除每个产物钩子的异步局部存储。迟到调用不能借用新轮次权限，嵌套与并发轮次独立释放凭据；规划或清理失败仍释放全部已接收来源并保留原始错误。

  生成兼容桥在单次请求内共用来源快照，同一实例的未变配置复用最近一个只读 profile；阶段覆盖与真实配置版本独立，显式样式目标、诊断策略和插件身份更新均使旧配置结果失效。永久关闭后显式清除配置缓存，释放回调与插件引用，保留不同请求和不同实例的隔离。

## 1.0.7

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - @weapp-tailwindcss/shared@2.0.4

## 1.0.6

### Patch Changes

- 统一来源扫描基础设施与共享语义契约，修复 Windows glob、qxml、绝对来源排除及配置更新缓存；拆分 PostCSS 子路径和核心扫描职责，解除值依赖循环与核心对构建器的反向引用，CLI 与 PostCSS 复用生成会话扫描并释放资源。

  进一步将通用生成编排与候选状态迁入核心，兼容扫描入口统一使用 AST 来源描述与显式扫描策略。Webpack、Rspack、Gulp 共用真实生成与增量扫描契约，修复 Gulp 禁用自动扫描后的候选泄漏、watch 候选失效，以及 Webpack/Rspack 新增来源文件未触发 CSS 重建的问题。

  生成引擎按内容指纹复用本地配置及插件模块，避免重复遍历和执行未变更依赖；配置或间接依赖更新及显式会话失效仍触发刷新。配置加载器保留 Jiti 转换缓存，每次读取前清理配置的本地模块依赖图，兼顾间接依赖更新正确性与 CommonJS 原生加载性能。

  生成模块缓存的异步上下文在最后一个并发调用结束后停用，避免后续构建继续承担异步跟踪开销；成功与异常路径均释放，并保留并发生成之间的上下文隔离。

  Webpack/Rspack 的来源监听根据 glob 静态前缀注册目录，避免配置基准目录导致整棵项目树进入递归快照；尚未创建的目录登记为缺失依赖，保留新增来源触发生成的行为。

  候选报告采用有限并发读取，避免串行文件等待与构建任务相互阻塞；结果顺序、候选位置及单文件失败报告保持稳定。CSS 来源缓存的配置元数据检查与同步 CSS 读取在同一轮完成，配置修改、删除及重建仍会刷新来源。

  候选删除时仅重建累积输出的编译器，复用同一生成会话的 design system，减少 HMR 重复解析主题和插件的内存分配；源码、配置或依赖失效仍同时刷新编译器与 design system。

## 1.0.5

### Patch Changes

- 修复 Windows 下 CSS import 转义路径导致默认源码扫描失效、标准 utility 与 spacing 变量缺失的问题。统一入口路径解析、CSS 请求序列化和主题文件定位。

  Vite 清理已注入的样式产物时，在单次操作内复用主样式的比较索引，避免对每个候选产物重复解析同一份 CSS。索引绑定不可变内容，不跨 HMR 构建保留。

  Vite 将原始用户样式与框架已处理的 bundle CSS 分开传递，生成 CSS 完成框架转换后再合并后者，避免 px/rpx 阶段差异导致依赖样式重复输出。保留用户覆盖顺序，并避免重放已执行的框架插件或恢复旧主题变量。

  修正 Vite watch 删除模板时的源码与产物归属、符号链接路径身份和候选缓存失效；覆盖 quickapp qxml，并保证 Vite 开发服务中的新增任意值使用当前生成器验证集合，使 CSS 与 JS 类名一致。

  修复没有 PostCSS loader 的 Webpack 预处理链路：在 Sass/Less/Stylus 输出 CSS 后再执行生成和 import 解析，兼容 Docusaurus 服务端丢弃样式的规则。

  修复 Webpack 将 Windows 输出目录直接当作 Watchpack glob 导致忽略规则失效的问题。输出目录使用字面路径包含关系，兼容盘符、UNC、空格与 glob 特殊字符，避免生成产物反复触发 watch 构建。

  Webpack 监听依赖通过构建器输入文件系统分类，避免把 Taro 虚拟入口误登记为缺失文件并循环重建；loader 等待异步依赖注册完成后再返回产物。

  扩展所有 demo 的 Windows、macOS、Linux CLI 验收，覆盖生产、开发首编译、连续源码修改及 Web 刷新。修复百度小程序 CSS 产物身份与重放、入口 chunk 的独立样式引用、Webpack 生成前后的 CSS/JS 边界和 Rspack 已注册 loader 的增量生成；修复 uni 样式注入入口缓存跨构建失效。原生目标保持已有接入边界，仅验收 CLI 构建，不声明设备或 utility 样式覆盖。Refs #1159。

  仓库构建依赖为 Rollup 4.63.0 增加 CJS/ESM watcher 补丁，修复 Linux 原子替换源码后重复依赖监听失效；补丁随冻结锁文件应用，不随本库 npm 包安装。浏览器验收区分客户端路由与新文档，避免 hash/history 跳转清空有效的开发连接。

## 1.0.4

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - @weapp-tailwindcss/shared@2.0.3

## 1.0.3

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/shared@2.0.2`

## 1.0.2

### Patch Changes

- 🐛 **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic
- 📦 **Dependencies** [`8d9cc88`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d9cc8878cc430a4953579e2c76213402f0932e1)
  → `@weapp-tailwindcss/shared@2.0.1`

## 1.0.1

### Patch Changes

- 🐛 **修复样式注入去重时 raw `@import` 与 `url()` 写法识别不一致的问题，避免等价导入被重复插入。** [#960](https://github.com/sonofmagic/weapp-tailwindcss/pull/960) by @sonofmagic

## 1.0.0

### Major Changes

- 🚀 **发布 `weapp-style-injector` 1.0.0，收口分包样式注入配置为 `rules`：可以用对象映射、tuple 或 `from`/`to` 对象直接描述“哪个样式入口会注入到哪些产物中”。** [`be1cdb0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/be1cdb0e6a6ab898abad3fd2fcfcdde5b81e0d9c) by @sonofmagic
  - 这是破坏性变更：移除 `styleEntries`、`subPackages.imports`、预设插件 `subpackageImports` 等过长或偏内部的公开配置入口。

### Patch Changes

- 🐛 **在 `weapp-tailwindcss` 主配置中新增 `styleInjector`，默认关闭。启用后会内置复用 `weapp-style-injector` 的样式入口注入能力，并在 Vite/Webpack 中按 `appType` 自动选择 uni-app、Taro、Mpx 或通用预设；当主插件通过 `disabled: true` 或 `disabled: { plugin: true }` 关闭时，样式注入也会同步关闭。** [`747dcf3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/747dcf34a1cf77a14b859ee86f537ce2cd89bddd) by @sonofmagic
  - 同时修复 `@weapp-tailwindcss/postcss` 中 `Px2rpxOptions` 在 NodeNext 类型解析下无法正确导出的声明问题。
  - `weapp-tailwindcss` 直接复用 `weapp-style-injector` 的现有实现，避免在主包内重复维护样式注入逻辑，同时保持 `weapp-style-injector` 原有独立入口不变。

- 🐛 **收口 `weapp-style-injector` 的公开导出入口，移除未文档化的 `uni-app`、`taro`、`subpackage` 深入口，保留根入口、通用 Vite/Webpack 插件入口以及 uni-app/Taro 的 Vite/Webpack 预设入口。** [`2863217`](https://github.com/sonofmagic/weapp-tailwindcss/commit/28632172a1b4c63b94b4798ab7c3f3f1104eff8c) by @sonofmagic

- 🐛 **修复分包样式注入在 Webpack、Taro Vite 与 uni-app H5 产物中的边界处理，避免 H5 分包页面误生成小程序样式后缀并丢失页面原始样式；新增同一分包内多样式入口配置，可分别向 pages、components 与 `*.weapp.*`、`*.ali.*` 等平台源码文件注入不同入口；同时新增独立的 uni-app、MPX、Taro Webpack、Taro Vite 分包集成回归项目。** [`5997f42`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5997f42672bdada25dcb15a77fc4f69ccd167668) by @sonofmagic

## 0.0.3

### Patch Changes

- 🐛 **修复 uni-app Vite 预设在 `generateBundle` 中直接写入 bundle 资产的问题，改为通过 `emitFile` 生成分包样式入口，以兼容 Vite 8/Rolldown。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
- 📦 **Dependencies** [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  → `@weapp-tailwindcss/shared@2.0.0`

## 0.0.3-next.2

### Patch Changes

- 📦 **Dependencies** [`aaba811`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaba811cfc2ad003d3daf2cf290c9d8b770c6dfb)
  → `@weapp-tailwindcss/shared@2.0.0-next.1`

## 0.0.3-next.1

### Patch Changes

- 📦 **Dependencies** [`2d2acf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d2acf29cfee02ffb32783c8bd3c5de8d9aab9df)
  → `@weapp-tailwindcss/shared@2.0.0-next.0`

## 0.0.3-next.0

### Patch Changes

- 🐛 **修复 uni-app Vite 预设在 `generateBundle` 中直接写入 bundle 资产的问题，改为通过 `emitFile` 生成分包样式入口，以兼容 Vite 8/Rolldown。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

## 0.0.2

### Patch Changes

- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3`

## 0.0.2-alpha.1

### Patch Changes

- 📦 **Dependencies** [`cbead4c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cbead4ced4b7cba116488d745d47bf826bc83859)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.1`

## 0.0.2-alpha.0

### Patch Changes

- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.0`

## 0.0.1

### Patch Changes

- 🐛 **提取常用字符串/数组工具到 shared，并在相关包中复用。** [`ccc0a33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccc0a330b5cd455665a0f2f2c3e8895b27a04b52) by @sonofmagic
- 📦 **Dependencies** [`ccc0a33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccc0a330b5cd455665a0f2f2c3e8895b27a04b52)
  → `@weapp-tailwindcss/shared@1.1.2`
