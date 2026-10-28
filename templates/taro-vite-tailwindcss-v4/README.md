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
pnpm build:harmony-hybrid
pnpm open
```

## 模板说明

- 生成模式不需要配置 `postinstall: "weapp-tw patch"`
- `package.json` 中保留了其他平台的构建脚本，可按需启用
- 如果你需要 webpack 方案，请使用 `taro-webpack-tailwindcss-v4`
- H5 与 `harmony-hybrid` 显式使用 Web 生成目标、浏览器主题根和兼容降级；RN/`jdrn` 禁用小程序样式插件，其他小程序目标保留原有单位转换。
- Web 单位与 Taro 的 `designWidth: 750`、`deviceRatio[750]: 1`、`baseFontSize: 16` 配套，`32rpx` 转为 `1rem`，与小程序原有的 rem 基准一致。H5 根字号范围为 16–32px；Hybrid 保留 Taro 的分段缩放。375px 视口下，`40px`/`40rpx` 均对应 `1.25rem`/20px，Tailwind 的 `1rem` 对应 16px。调整设计宽或比例时，须同步修改 `config/index.ts` 的单位换算规则与 H5 `pxtransform` 配置。
- Hybrid 的浏览器样式验证覆盖 Web 资源；鸿蒙宿主 API 和原生 bridge 仍需在真实容器验收。

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `Taro`：<https://taro.zone/>
