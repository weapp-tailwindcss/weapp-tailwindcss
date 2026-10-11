# @weapp-tailwindcss/cli

> [English](./README.md) | 简体中文

面向 Web 与小程序 CSS 的 Tailwind CSS v4 命令行工具。默认保持浏览器语义生成 Web CSS，也可以通过 `--target weapp` 显式输出小程序兼容 CSS。

> [!IMPORTANT]
> npm 上的 `3.x` 与 `4.0.0-alpha.x` 属于旧版原生小程序 Gulp 工具链。当前 CLI 从 `5.x` 版本线开始发布，不再提供旧版 `init`、Sass/Less 或项目目录扫描流程。

## 安装

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss
```

## 快速开始

`weapp-tw` 与 `weapp-tailwindcss` 是等价的命令入口：

```bash
pnpm exec weapp-tw -i src/input.css -o dist/output.css
pnpm exec weapp-tw build -i src/input.css -o dist/output.css --minify
pnpm exec weapp-tailwindcss canonicalize "py-3 p-1 px-3"
```

CLI 复用 `weapp-tailwindcss` 的 Tailwind v4 generator、design system 与 CSS 转换能力，不依赖或调用 `@tailwindcss/cli`。

## 输出目标

| 目标 | 行为 |
| --- | --- |
| `web` | 默认目标，保留 Tailwind CSS 的浏览器选择器、转义与 Web 语义。 |
| `weapp` | 只转换生成后的 CSS，使其兼容小程序样式环境。 |

`--target weapp` 不扫描或改写 WXML、JavaScript、TypeScript、JSX、TSX 或已有 WXSS。完整小程序项目应继续使用 `weapp-tailwindcss` 的 Vite、Webpack、Rspack 或 Gulp 集成。

## Watch

watch 默认使用 `@parcel/watcher` 原生文件系统事件。使用 `--poll` 或 `--poll=500` 可切换为轮询；原生 watcher 不可用时会自动降级。

```bash
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch --poll=500
```

## 程序化调用

```ts
import { runCli } from '@weapp-tailwindcss/cli'

const exitCode = await runCli(['-i', 'src/input.css', '-o', 'dist/output.css'])
```

导入包不会自动执行命令。`runCli` 沿用命令行的 stdout、stderr 与 `process.exitCode` 语义。

## 文档

完整参数、stdin/stdout、source map、watch 与 `canonicalize` 用法见 [CLI 使用指南](https://tw.weapp.dev/zh-cn/docs/tools/weapp-tw-cli)。

接入或升级排障时，可以运行 `weapp-tw doctor`。它会检查实际配置中是否注册了官方 Tailwind 生成器；仅存在普通 PostCSS 配置不会触发重复生成警告。
