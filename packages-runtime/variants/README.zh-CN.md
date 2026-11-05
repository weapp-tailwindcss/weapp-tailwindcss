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

升级至 `tailwind-variants` v4 后，空类名列表返回 `''`。`cn` 保留 `cn(...classes)(config)` 延迟调用方式，`cnBase` 只聚合和转义。封装继续支持在 `tv`、`createTV`、`create` 和延迟 `cn` 调用中传入 `twMergeConfig`。传入 `twMerge` 函数时，由该函数负责冲突合并，并经过相同的 unescape、rpx 归一化和 escape 流程；`twMerge: false` 则禁用冲突合并。

## 文档

转义与合并行为见[运行时工具文档](https://tw.weapp.dev/zh-cn/docs/community/merge/overview)。
