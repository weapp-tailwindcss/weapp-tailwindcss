---
title: Tailwind CSS 多入口与分包隔离
description: 使用 cssEntries、@source 与内置 styleInjector，让主包、普通分包和独立分包分别生成自己的 Tailwind CSS 样式入口。
keywords:
  - tailwindcss
  - 多入口
  - 分包
  - 独立分包
  - styleInjector
  - weapp-style-injector
  - weapp-tailwindcss
  - 小程序
  - uni-app
  - taro
  - mpx
---

# Tailwind CSS 多入口与分包隔离

小程序拆分主包、普通分包和独立分包后，通常不希望把所有 Tailwind 工具类复制到每一份样式产物中。更合理的结果是：

- 主包入口只生成主包使用的工具类。
- 普通分包入口只生成该分包使用的工具类。
- 独立分包入口只生成该独立分包使用的工具类。
- 分包页面通过 `@import` 引用本分包入口，同时保留页面自己的局部 CSS。

独立分包尤其需要单独的样式入口，因为主包中的全局样式不会作用到独立分包。

## 三项配置分别负责什么

| 配置 | 职责 |
| --- | --- |
| `cssEntries` | 告诉 `weapp-tailwindcss` 哪些文件是 Tailwind CSS 入口 |
| 入口中的 `@source` | 决定当前入口扫描哪些模板和脚本、生成哪些候选类 |
| `styleInjector.rules` | 生成分包入口资产，并把入口通过 `@import` 注入匹配的页面或组件样式 |

`styleInjector` 不负责扫描模板，也不会替代 `cssEntries`。反过来，`cssEntries` 只负责识别和生成入口，不会自动让分包页面引用入口。三者需要一起配置。

## 目录结构

下面以 uni-app Vite + Tailwind CSS 4 为例：

```text
src/
├── main.css
├── main.ts
├── pages/
│   └── index/index.vue
├── sub-normal/
│   ├── index.css
│   └── pages/
│       ├── index.css
│       └── index.vue
└── sub-independent/
    ├── index.css
    └── pages/
        ├── index.css
        └── index.vue
```

`main.css`、两个分包根目录下的 `index.css` 是三份 Tailwind 入口。页面目录中的 `index.css` 只是页面局部样式，不包含 Tailwind 入口指令。

## 配置 cssEntries 与内置 Style Injector

`weapp-tailwindcss` 已内置 `weapp-style-injector`，无需再注册一个独立插件：

```ts title="vite.config.ts"
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const require = createRequire(import.meta.url)
const projectRoot = dirname(fileURLToPath(import.meta.url))
const uniMpVueRuntimePath = require.resolve('@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js')

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      tailwindcssBasedir: projectRoot,
      cssEntries: [
        path.resolve(projectRoot, 'src/main.css'),
        path.resolve(projectRoot, 'src/sub-normal/index.css'),
        path.resolve(projectRoot, 'src/sub-independent/index.css'),
      ],
      styleInjector: {
        rules: {
          'index.css': [
            'pages/**/*.css',
            'pages/**/*.wxss',
            'pages/**/*.acss',
            'pages/**/*.ttss',
            'pages/**/*.qss',
            'pages/**/*.jxss',
          ],
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js': uniMpVueRuntimePath,
    },
  },
})
```

uni-app 预设会读取 `pages.json` 中的分包根目录。规则里的 `index.css` 会分别匹配：

- `src/sub-normal/index.css`
- `src/sub-independent/index.css`

目标 glob 覆盖常见小程序样式后缀和 H5 的 `.css`。如果项目只构建微信小程序，可以缩小为 `pages/**/*.wxss`。

## 限定三个入口的扫描范围

主包入口只扫描主包页面，并显式排除两个分包：

```css title="src/main.css"
@import "tailwindcss" source(none);
@config "../tailwind.config.js";

@source "./pages/**/*.{vue,js,ts}";
@source not "./sub-normal/**/*";
@source not "./sub-independent/**/*";
```

普通分包入口只扫描普通分包：

```css title="src/sub-normal/index.css"
@import "tailwindcss" source(none);
@config "../../tailwind.config.sub-normal.js";

@source "./pages/**/*.{vue,js,ts}";
```

独立分包入口只扫描独立分包：

```css title="src/sub-independent/index.css"
@import "tailwindcss" source(none);
@config "../../tailwind.config.sub-independent.js";

@source "./pages/**/*.{vue,js,ts}";
```

每个 `@config` 的 `content` 也应保持相同边界。不要让主配置重新扫描全部分包，否则会绕过入口中的隔离意图。

## 页面只引入局部 CSS

分包页面不需要手工引入根目录的 Tailwind 入口：

```vue title="src/sub-normal/pages/index.vue"
<template>
  <view class="normal-page-local bg-twv4-uni-normal text-white">
    normal subpackage
  </view>
</template>

<style src="./index.css"></style>
```

```css title="src/sub-normal/pages/index.css"
.normal-page-local {
  border-width: 3rpx;
}
```

构建时，内置 Style Injector 会生成分包入口，并把引用插入页面产物。

## 预期产物

以微信小程序为例：

| 产物 | 应包含 | 不应包含 |
| --- | --- | --- |
| `main.wxss` | 主包专属工具类 | 普通分包、独立分包专属工具类 |
| `sub-normal/index.wxss` | 普通分包专属工具类 | 主包、独立分包专属工具类 |
| `sub-independent/index.wxss` | 独立分包专属工具类 | 主包、普通分包专属工具类 |
| `sub-normal/pages/index.wxss` | 页面局部 CSS、`@import "../index.wxss"` | 三组入口工具类的内联副本 |
| `sub-independent/pages/index.wxss` | 页面局部 CSS、`@import "../index.wxss"` | 三组入口工具类的内联副本 |

页面产物类似：

```css title="dist/build/mp-weixin/sub-normal/pages/index.wxss"
@import "../index.wxss";

.normal-page-local {
  border-width: 3rpx;
}
```

隔离针对的是入口专属候选。若主包和多个分包都使用 `text-white`，每个入口各自生成该共享工具类是正常现象。

## 独立使用 weapp-style-injector

如果项目没有使用 `weapp-tailwindcss`，或者只需要注入已经生成的样式入口，可以独立注册框架预设：

```ts
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { StyleInjector } from 'weapp-style-injector/vite/uni-app'

export default defineConfig({
  plugins: [
    uni(),
    StyleInjector({
      rules: {
        'index.css': ['pages/**/*.wxss'],
      },
    }),
  ],
})
```

已经使用 `weapp-tailwindcss` 时，优先使用内置 `styleInjector`，避免注册两套相同的构建生命周期。

## 验证

先构建微信小程序：

```bash
pnpm build:mp-weixin
```

如果项目支持其他平台，再至少检查一个非微信目标，例如支付宝或抖音：

```bash
pnpm build:mp-alipay
pnpm build:mp-toutiao
```

验证时不要只检查固定的 `app.wxss` 文件名，应按真实平台后缀检查 `.wxss`、`.acss`、`.ttss` 等产物，并同时做正向和反向断言，确认入口之间没有串包。

## 完整示例

仓库中的 [subpackage-uni-app-vite-tailwindcss-v4](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo/subpackage-uni-app-vite-tailwindcss-v4) demo 同时覆盖：

- 内置 `styleInjector` 的隔离入口模式。
- 主包、普通分包、独立分包的候选隔离。
- 微信、支付宝、抖音和 H5 产物。
- 用于兼容性回归的单入口模式。
