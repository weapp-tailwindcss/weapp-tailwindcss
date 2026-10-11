# @weapp-tailwindcss/cva

> [English](./README.md) | 简体中文

`class-variance-authority` 的跨端运行时封装。它保留熟悉的 `cva` API，同时输出兼容小程序转义规则的 class。

## 安装

```bash
pnpm add @weapp-tailwindcss/cva
```

## 使用

```ts
import { cva } from '@weapp-tailwindcss/cva'

const button = cva('rounded px-4 py-2', {
  variants: {
    intent: {
      primary: 'bg-sky-500 text-white',
      secondary: 'bg-slate-100 text-slate-900',
    },
  },
  defaultVariants: {
    intent: 'primary',
  },
})

const className = button({ intent: 'secondary' })
```

目标运行时可以直接接收原始 Tailwind class 时，使用 `create({ escape: false })` 创建不转义的实例。

## 文档

共享转义模型见[运行时工具文档](https://tw.weapp.dev/zh-cn/docs/community/merge/overview)。
