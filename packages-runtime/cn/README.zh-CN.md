# @weapp-tailwindcss/cn

> [English](./README.md) | 简体中文

基于 npm `cn` 引擎的面向小程序 Tailwind CSS 类名组合工具，兼容条件类名、嵌套数组、Tailwind 冲突合并和 `rpx` 任意值。`text` / `border` / `bg` / `outline` / `ring` 的 rpx 长度会与颜色类共存，例如 `cn('text-red', 'text-[80rpx]')`。

```ts
import { cn } from '@weapp-tailwindcss/cn'

cn('p-4', enabled && 'p-2')
```
