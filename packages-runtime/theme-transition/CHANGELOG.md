# theme-transition

## 2.1.2

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

## 2.1.1

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

## 2.1.0

### Minor Changes

- 新增圆形、淡入淡出、幕布擦除和滑动淡入四种内置主题过渡预设，并允许通过 `preset` 选择效果，同时保留原有圆形动画作为默认行为。

### Patch Changes

- 修复圆形主题切换收尾闪烁，并在 View Transition 完成后释放动画资源，避免反复切换时 Chrome 合成资源持续占用；键盘或程序化触发的无指针切换会直接降级，不再从页面左上角播放动画。

## 2.0.5

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic

## 2.0.4

### Patch Changes

- 🐛 **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic

## 2.0.3

### Patch Changes

- 🐛 **修复亮色切回暗色时 View Transition 首帧层级与方向状态错误导致的白屏闪烁问题。** [`0ea3d90`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0ea3d90b2a38085b8630b4bee9bb7788d7863ea1) by @sonofmagic

- 🐛 **本次发布整理了从 `5.1.2` 之后的主要变更：修复 Tailwind v4 多 `cssEntries` 场景下的主样式误匹配与分包样式映射问题，补齐 Taro webpack5/Vite、Rspack、H5/web 兼容与平台环境支持，并同步修复主题过渡的首帧闪烁问题。** [`64faef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64faef437046ca1b3f438a2e55d101895500f7a5) by @sonofmagic

## 2.0.2

### Patch Changes

- 🐛 **将反向 clip-path 关键帧生成逻辑从 `Array.prototype.toReversed` 改为兼容性更高的数组复制后反转写法，避免在较低 `lib` 目标的 TypeScript 检查中报错。** [`ebbbe84`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ebbbe84650ae8fa6f3671a1e141c872ad91115c4) by @sonofmagic

## 2.0.2-alpha.0

### Patch Changes

- 🐛 **将反向 clip-path 关键帧生成逻辑从 `Array.prototype.toReversed` 改为兼容性更高的数组复制后反转写法，避免在较低 `lib` 目标的 TypeScript 检查中报错。** [`ebbbe84`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ebbbe84650ae8fa6f3671a1e141c872ad91115c4) by @sonofmagic

## 2.0.1

### Patch Changes

- [`0a0c780`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0a0c7803d0ec9e1c67f555d12c074a6d3f33b1ac) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: use tsdown to bundle

- [`7c7b732`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7c7b732c511f47a089e73ecfd7ace091532e170f) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: update package.json meta exports

## 2.0.0

### Major Changes

- [`5699ec0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5699ec003b37eb742e2e57a9748f4ebedc91b300) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - restructure `useToggleTheme` to expose `capabilities`/`environment` metadata alongside `toggleTheme`, replacing the previous return signature
  - add a default export for the Tailwind plugin to align with Tailwind CSS v4 `@plugin` usage while keeping the named export for Tailwind CSS v3
  - document the new API surface and widen tests to cover the additional behaviour

## 1.0.2

### Patch Changes

- [`c7892d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c7892d699d798abe27c63d1345423a5ac147cc76) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 优化 css 生成

## 1.0.1

### Patch Changes

- [`745acb0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/745acb0bce58573d4e41a57ccbb6b281b820b5e0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: export function name

## 1.0.0

### Major Changes

- [`d50007c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50007c5174b8d5b8350844c72dc5cb92a7fcfa7) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: release theme-transition for dark toggle
