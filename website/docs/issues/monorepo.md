---
title: 在 monorepo 中使用
description: 在 monorepo 由于存在 hoist 机制，可能会导致 weapp-tailwindcss 和 tailwindcss 通信受阻，这时候需要显式的去指定 tailwindcss 的路径
keywords:
  - 常见问题
  - 故障排查
  - 兼容性
  - monorepo
  - 中使用
  - issues
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 在 monorepo 中使用

在 `monorepo` 由于存在 `hoist` 机制，可能会导致 `weapp-tailwindcss` 和 `tailwindcss` 通信受阻，这时候需要显式的去指定 `tailwindcss` 的路径

这里我们以 `taro@4` 的配置 `config/index.ts` 配置为例

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
                // app.css 的路径
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

使用这样的配置，就能在 `monorepo` 中使用了
