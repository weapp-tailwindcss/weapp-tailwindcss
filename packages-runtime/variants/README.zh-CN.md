# @weapp-tailwindcss/variants

> [English](./README.md) | 简体中文

`tailwind-variants` 的跨端运行时封装。它保留上游 `tv`、`cn`、slots、compound variants 与扩展模型，同时集成 Tailwind Merge 和小程序安全转义。

## 安装

```bash
pnpm add @weapp-tailwindcss/variants
```

## 使用

```ts
import { tv } from '@weapp-tailwindcss/variants'

const button = tv({
  base: 'rounded px-4 py-2 font-medium',
  variants: {
    intent: {
      primary: 'bg-sky-500 text-white',
      secondary: 'bg-slate-100 text-slate-900',
    },
  },
})

const className = button({ intent: 'primary' })
```

需要原始 class 输出时使用 `create({ escape: false })`。设计系统扩展了默认 class group 时，可以传入对应的 Tailwind Merge 配置。

## 文档

转义与合并行为见[运行时工具文档](https://tw.weapp.dev/zh-cn/docs/community/merge/overview)。
