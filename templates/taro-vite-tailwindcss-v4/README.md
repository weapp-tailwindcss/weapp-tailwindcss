# taro-vite-tailwindcss-v4

`Taro + Vite + React + Tailwind CSS v4` 模板。

## 适用场景

- 使用 `Taro` 的 `Vite` 方案开发小程序
- 需要 `Tailwind CSS v4` 与 `weapp-tailwindcss` 的最新集成方式
- 想保留多端构建脚本，但主要目标端是微信小程序

## 技术栈

- `Taro React`
- `Vite`
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
- `package.json` 中保留了其他平台的构建脚本，可按需启用
- 如果你需要 webpack 方案，请使用 `taro-webpack-tailwindcss-v4`

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `Taro`：<https://taro.zone/>
