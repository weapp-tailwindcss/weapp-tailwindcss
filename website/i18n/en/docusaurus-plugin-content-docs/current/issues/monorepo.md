---
title: Used in monorepo
description: Due to the hoist mechanism in monorepo, the communication between weapp-tailwindcss and tailwindcss may be blocked. In this case, you need to explicitly specify the path of tailwindcss.
keywords:
  - FAQ
  - Troubleshooting
  - compatibility
  - monorepo
  - used in
  - issues
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# used in monorepo

In `monorepo`, due to the existence of the `hoist` mechanism, the communication between `weapp-tailwindcss` and `tailwindcss` may be blocked. In this case, you need to explicitly specify the path of `tailwindcss`.

Here we take the configuration of `taro@4` and the configuration of `config/index.ts` as an example

## Tailwind CSS 4

```ts
const config = {
  webpackChain(chain) {
    chain.merge({
      plugin: {
        install: {
          plugin: WeappTailwindcss,
          args: [
            {
              cssOptions: {
                rem2rpx: true,
              },
              // highlight-next-line
              cssEntries: [
//The path to app.css
                path.resolve(__dirname, '../src/app.css'),
              ],
            },
          ],
        },
      },
    })
  },
}
```

Using this configuration, you can use it in `monorepo`
