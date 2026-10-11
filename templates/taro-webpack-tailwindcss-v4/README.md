# taro-webpack-tailwindcss-v4

`Taro + webpack + React + Tailwind CSS v4` 模板。

## 适用场景

- 需要在 `Taro webpack` 体系下接入 `Tailwind CSS v4`
- 希望保留传统 webpack 构建链路
- 需要一个用于兼容验证或迁移参考的模板

## 技术栈

- `Taro React`
- `webpack`
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
pnpm dev:weapp
```

## 常用命令

```bash
pnpm dev:weapp
pnpm build:weapp
pnpm build:h5
pnpm open
```

## 模板说明

- 生成模式不需要配置 `postinstall: "weapp-tw patch"`
- 这是 webpack 方案，不同于 `taro-vite-tailwindcss-v4`
- 适合存量项目对照或 CI 兼容回归

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `Taro`：<https://taro.zone/>
