# @weapp-tailwindcss/merge

> English | [简体中文](./README.zh-CN.md)

A cross-platform wrapper around Tailwind Merge v3. It resolves conflicting utilities while keeping arbitrary values, `rpx`, and mini-program-safe class escaping consistent with `weapp-tailwindcss`.

## Installation

```bash
pnpm add @weapp-tailwindcss/merge
```

## Usage

```ts
import { twMerge } from '@weapp-tailwindcss/merge'

const className = twMerge(
  'rounded px-2 text-[28rpx]',
  'px-4 text-surface-700',
)
```

The default runtime returns escaped classes suitable for mini-program templates. Create an unescaped runtime when another target owns class serialization:

```ts
import { create } from '@weapp-tailwindcss/merge'

const { twMerge } = create({ escape: false })
```

Use the `slim` entry for a smaller preconfigured class-group set or `lite` when you only need joining and escaping without conflict resolution.

## Documentation

See the [merge guide](https://tw.weapp.dev/docs/community/merge/overview) for configuration and migration details.
