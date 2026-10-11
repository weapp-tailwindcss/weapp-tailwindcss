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
pnpm open:dev
pnpm open:build
```

## 模板说明

- 这是 `webpack` 路径模板，不是 `vite` 方案
- 适合做兼容验证或存量项目迁移参考
- 如需新建项目，优先考虑 `uni-app-tailwindcss-v4` 或 `uni-app-vite-vue3-tailwind-vscode-template`

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `uni-app`：<https://uniapp.dcloud.net.cn/>
