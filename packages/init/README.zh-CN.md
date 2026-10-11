# @weapp-tailwindcss/init

> [English](./README.md) | 简体中文

这个包负责初始化 `weapp-tailwindcss` 相关配置。

默认模式面向 Tailwind CSS 4 / `weapp-tailwindcss` 5：只更新 `package.json` 并创建 CSS-first 入口 `src/app.css`，不会写入 `postcss.config.*`、`tailwind.config.*`，也不会添加 `@tailwindcss/postcss` 或 `autoprefixer`。

```ts
import { init } from '@weapp-tailwindcss/init'

await init({ cwd: process.cwd() })
```

需要维护旧版 Tailwind 3 项目时，显式传入 `mode: 'legacy'`，初始化器才会生成旧式 PostCSS 与 Tailwind 配置。

## 官网

更多接入方式、配置说明和框架示例见 [weapp-tailwindcss 官方文档](https://tw.weapp.dev)。

依赖版本按目标主版本范围选择最高稳定版，不依赖 registry 返回顺序。没有匹配稳定版时，初始化会在写入项目文件前报错，不回退到其他主版本或预发布版。
