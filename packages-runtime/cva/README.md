# @weapp-tailwindcss/cva

> English | [简体中文](./README.zh-CN.md)

A cross-platform `class-variance-authority` runtime that preserves the familiar `cva` API while producing class names compatible with mini-program escaping.

## Installation

```bash
pnpm add @weapp-tailwindcss/cva
```

## Usage

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

Use `create({ escape: false })` when the target runtime accepts raw Tailwind class names.

## Documentation

See the [runtime utilities documentation](https://tw.weapp.dev/docs/community/merge/overview) for the shared escaping model.
