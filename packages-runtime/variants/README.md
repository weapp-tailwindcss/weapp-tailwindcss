# @weapp-tailwindcss/variants

> English | [简体中文](./README.zh-CN.md)

A cross-platform `tailwind-variants` runtime. It keeps the upstream `tv`, `cn`, slots, compound variants, and extension model while integrating Tailwind Merge and mini-program-safe escaping.

## Installation

```bash
pnpm add @weapp-tailwindcss/variants
```

## Usage

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

Use `create({ escape: false })` for raw class output or pass a runtime Tailwind Merge configuration when your design system extends the default class groups.

## Documentation

See the [runtime utilities documentation](https://tw.weapp.dev/docs/community/merge/overview) for escaping and merge behavior.
