# weapp-style-injector

通过 `weapp-style-injector/types` 引用框架选项类型，可避免依赖 Vite、Webpack 适配器实现。

> [English](./README.md) | 简体中文

`weapp-style-injector` 用于在小程序构建产物中生成样式入口，并把入口通过 `@import` 注入匹配的页面或组件样式。它覆盖 Vite、Webpack、uni-app、Taro 和 Mpx 等常见构建场景。

它不负责决定 Tailwind CSS 要扫描哪些文件：

- `cssEntries` 让 `weapp-tailwindcss` 识别 Tailwind CSS 入口。
- 每个入口的 `@source` 决定该入口提炼哪些候选类。
- `styleInjector.rules` 决定生成的分包入口应该注入哪些样式产物。

## 推荐入口

| 场景 | 入口 |
| --- | --- |
| 已使用 `weapp-tailwindcss` | 使用主插件的 `styleInjector` 选项 |
| 通用 Vite 插件 | `weapp-style-injector/vite` |
| 通用 Webpack 插件 | `weapp-style-injector/webpack` |
| uni-app Vite 预设 | `weapp-style-injector/vite/uni-app` |
| uni-app Webpack 预设 | `weapp-style-injector/webpack/uni-app` |
| Taro Vite 预设 | `weapp-style-injector/vite/taro` |
| Taro Webpack 预设 | `weapp-style-injector/webpack/taro` |
| Mpx Webpack 预设 | `weapp-style-injector/webpack/mpx` |

`uni-app`、`taro`、`subpackage` 等解析模块属于包内实现细节，不作为应用项目的公开接入入口。

## 通过 weapp-tailwindcss 使用

`weapp-tailwindcss` 已内置本包。已有项目不需要再安装或注册一个独立插件，只需开启 `styleInjector`：

```ts title="vite.config.ts"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss({
      cssEntries: [
        resolve(projectRoot, 'src/main.css'),
        resolve(projectRoot, 'src/sub-normal/index.css'),
        resolve(projectRoot, 'src/sub-independent/index.css'),
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
})
```

uni-app 预设会从 `pages.json` 读取分包根目录。上面的规则会在每个分包内寻找 `index.css`，生成对应平台的分包入口，并在匹配的页面样式前插入相对引用：

```css title="dist/build/mp-weixin/sub-normal/pages/index.wxss"
@import "../index.wxss";

.page-local {
  border-width: 3rpx;
}
```

主包入口与分包入口仍需分别限定扫描范围。例如：

```css title="src/main.css"
@import "tailwindcss" source(none);

@source "./pages/**/*.{vue,js,ts}";
@source not "./sub-normal/**/*";
@source not "./sub-independent/**/*";
```

```css title="src/sub-normal/index.css"
@import "tailwindcss" source(none);

@source "./pages/**/*.{vue,js,ts}";
```

这样主包专属类只进入主入口，普通分包和独立分包专属类只进入各自入口。多个入口共同使用 `text-white` 之类的类时，各入口保留自己的副本是预期行为。

## 独立使用

未使用 `weapp-tailwindcss`，或者只需要注入已经生成好的样式入口时，可以独立注册框架预设：

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
        'components.css': ['components/**/*.wxss'],
      },
    }),
  ],
})
```

不传规则时，uni-app、Taro 和 Mpx 预设会自动探测常见入口，并让分包样式引用主包样式入口：

```ts
StyleInjector()
```

需要显式引用主包样式时，可以使用 `ref`：

```ts
StyleInjector({
  rules: [
    [{ ref: 'app.css' }, {
      include: ['pages/**/*.wxss'],
      exclude: ['pages/legacy/**/*.wxss'],
    }],
  ],
})
```

## 常用配置

| 配置 | 用途 |
| --- | --- |
| `imports` | 向所有匹配产物注入固定入口 |
| `perFileImports` | 根据产物文件名动态返回入口 |
| `rules` | 描述“分包样式入口 -> 目标产物” |
| `include` / `exclude` | 限定插件处理的产物 |
| `dedupe` | 避免重复插入已有 `@import`，默认开启 |

## 示例与文档

- [内置 Style Injector 分包隔离 demo](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo/subpackage-uni-app-vite-tailwindcss-v4)
- [Tailwind CSS 多入口与分包隔离](https://tw.weapp.dev/zh-cn/docs/quick-start/independent-pkg)
