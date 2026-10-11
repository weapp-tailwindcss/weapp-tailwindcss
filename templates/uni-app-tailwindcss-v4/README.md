# uni-app-tailwindcss-v4

`uni-app + Vue 3 + Tailwind CSS v4` 模板。

## 适用场景

- 需要 `uni-app` 的多端能力
- 想使用 `Tailwind CSS v4`
- 主要通过命令行和 VS Code 进行开发

## 技术栈

- `uni-app`
- `Vue 3`
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

- 生成模式不需要配置 `postinstall: "weapp-tw patch"`
- 保留了 `up:pkg` 与 `up:uniapp` 用于依赖升级
- 如果你更偏 HBuilderX 工作流，可使用 `uni-app-hbuilderx-tailwindcss-v4`

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `uni-app`：<https://uniapp.dcloud.net.cn/>
