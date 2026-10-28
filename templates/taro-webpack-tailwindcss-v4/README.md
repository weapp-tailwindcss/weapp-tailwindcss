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
pnpm build:harmony-hybrid
pnpm open
```

## 模板说明

- 生成模式不需要配置 `postinstall: "weapp-tw patch"`
- 这是 webpack 方案，不同于 `taro-vite-tailwindcss-v4`
- 适合存量项目对照或 CI 兼容回归
- H5 与 `harmony-hybrid` 显式使用 Web 生成目标、浏览器主题根和兼容降级；RN/`jdrn` 维持独立构建链路，其他小程序目标保留原有单位转换。
- Web 单位与 Taro 的 `designWidth: 750`、`deviceRatio[750]: 1`、`baseFontSize: 16` 配套，`32rpx` 转为 `1rem`，与小程序原有的 rem 基准一致。H5 根字号范围为 16–32px；Hybrid 保留 Taro 的分段缩放。375px 视口下，`40px`/`40rpx` 均对应 `1.25rem`/20px，Tailwind 的 `1rem` 对应 16px。调整设计宽或比例时，须同步修改 `config/index.ts` 的单位换算规则与 H5 `pxtransform` 配置。
- 当前发布版 `weapp-tailwindcss@5.6.3` 的 Web 生成阶段尚未执行通用单位选项，因此在 Taro `h5.postcss` 中显式安装纯单位转换插件 `postcss-rule-unit-converter@0.2.6`。它由框架 loader 处理作者样式，并经 `weapp-tailwindcss` 的框架管线重放处理生成样式；不承担 Tailwind 生成。待升级至包含 Web 生成单位修复的正式版，并通过 H5/Hybrid 独立构建与单位回归后，可将规则迁回 `cssOptions.unitConversion`，再移除此插件及直接依赖。
- Hybrid 的浏览器样式验证覆盖 Web 资源；鸿蒙宿主 API 和原生 bridge 仍需在真实容器验收。

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `Taro`：<https://taro.zone/>
