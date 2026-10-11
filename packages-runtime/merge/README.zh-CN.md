# @weapp-tailwindcss/merge

> [English](./README.md) | 简体中文

Tailwind Merge v3 的跨端运行时封装。它在合并冲突 utility 的同时，让任意值、`rpx` 与小程序安全 class 转义保持和 `weapp-tailwindcss` 一致。

## 安装

```bash
pnpm add @weapp-tailwindcss/merge
```

## 使用

```ts
import { twMerge } from '@weapp-tailwindcss/merge'

const className = twMerge(
  'rounded px-2 text-[28rpx]',
  'px-4 text-surface-700',
)
```

默认运行时返回可直接用于小程序模板的安全 class。其他目标端自行负责 class 序列化时，可以创建不转义的运行时：

```ts
import { create } from '@weapp-tailwindcss/merge'

const { twMerge } = create({ escape: false })
```

需要更小的预配置 class group 时使用 `slim` 入口；只需要拼接与转义、不需要冲突合并时使用 `lite` 入口。

## 文档

配置与迁移说明见 [merge 指南](https://tw.weapp.dev/zh-cn/docs/community/merge/overview)。
