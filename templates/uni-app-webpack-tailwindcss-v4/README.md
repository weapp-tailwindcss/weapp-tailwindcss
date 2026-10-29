# uni-app-webpack-tailwindcss-v4

`uni-app webpack + Tailwind CSS v4` 模板，当前已过时。

## 当前状态

> 该模板已过时，主要保留给存量项目兼容参考，不建议继续作为新项目起点。

## 适用场景

- 需要在 `uni-app webpack` 工程中接入 `Tailwind CSS v4`
- 希望保留传统 `vue-cli-service` 体系
- 需要验证 `weapp-tailwindcss` 在 webpack 路径下的工作方式

更推荐直接使用：

- `uni-app-tailwindcss-v4`
- `uni-app-vite-vue3-tailwind-vscode-template`
- `uni-app-hbuilderx-tailwindcss-v4`

## 技术栈

- `uni-app webpack`
- `Tailwind CSS v4`
- `weapp-tailwindcss`
- `pnpm`

## 使用前提

- Node.js `22.12+`（`weapp-tailwindcss@5.2.0` 起）
- `pnpm`
- 微信开发者工具

## 快速开始

```bash
pnpm install
pnpm dev:mp-weixin
```

## 常用命令

```bash
pnpm dev:mp-weixin
pnpm build:mp-weixin
pnpm dev:h5
pnpm build:h5
pnpm build:app-plus
pnpm open:dev
pnpm open:build
```

## 模板说明

- 这是 `webpack` 路径模板，不是 `vite` 方案
- 适合做兼容验证或存量项目迁移参考
- 如需新建项目，优先考虑 `uni-app-tailwindcss-v4` 或 `uni-app-vite-vue3-tailwind-vscode-template`

### App 样式入口

App 的全局 CSS 由 `App.vue` 的 `<style>` 引入，不能放到 `main.ts` 的 JS import 中：uni-app Vue 2 的 App v3 编译器只会把前者纳入 view 样式图。条件编译让其他平台保留原有 `main.ts` 入口，避免因切换 loader 管线引入额外 preflight。App 端继续由 `weapp-tailwindcss` 生成 Web CSS，并保留 service/view 共享的原始 class；小程序端继续使用转义 class 与 rpx。

App 的业务 CSS 内联在 `app-view.js` 中并在启动时注入，`view.css` 是框架样式，因此不能以存在 `app.css` 或 `view.css` 作为业务样式验收。仓库模板构建回归会执行真实 `app-view.js` 的最小 DOM 注入合同，并核对 service class、CSS selector 和单位；这属于编译产物验证，原生基座与 WebView 的运行效果仍须通过对应设备链路确认。

只更新该模板的 App 与微信小程序语义基线后，须以禁止更新模式复验：

```bash
E2E_TEMPLATE_CASE='uni-app-webpack-tailwindcss-v4(?: app-plus| mp-weixin)?$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/templates-build-smoke.test.ts -u
E2E_TEMPLATE_CASE='uni-app-webpack-tailwindcss-v4(?: app-plus| mp-weixin)?$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/templates-build-smoke.test.ts --update=none
```

以上环境变量写法适用于 POSIX shell；PowerShell 可先设置 `$env:E2E_TEMPLATE_CASE` 为相同值，再执行对应 `pnpm` 命令。

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `uni-app`：<https://uniapp.dcloud.net.cn/>
