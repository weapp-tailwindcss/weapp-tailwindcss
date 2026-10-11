# uni-app-x-vdom-tailwindcss-v4

`uni-app x + VDOM + Tailwind CSS v4` demo。

## 关键配置

- `vite.config.ts` 直接注册 `WeappTailwindcss(uniAppX(...))`
- `main.css` 使用 `@import "tailwindcss"` 与 `@source`，`main.iconify.css` 只在非 App 端生成 Iconify 工具类
- `App.uvue` 的全局 `<style>` 使用 `@import './main.css'`，把生成入口加入 HBuilderX 构建图
- 显式配置 `cssEntries`，使用项目根目录解析主入口和非 App Iconify 入口的绝对路径
- 不注册 `@tailwindcss/postcss`，也不注册 `@tailwindcss/vite`

## 运行

```bash
pnpm install
pnpm dev:h5
pnpm dev:mp-weixin
pnpm dev:android:emulator
pnpm dev:ios:simulator
```

也可以直接用 HBuilderX 导入当前目录运行。

## 本地 E2E

App 端依赖本机 HBuilderX、Android 模拟器或 iOS 模拟器，只在本地运行，不纳入 CI/CD。

```bash
pnpm e2e:hbuilderx:local:app
pnpm e2e:hbuilderx:local:android
pnpm e2e:hbuilderx:local:ios
```

如果本机安装了完整 Xcode，但 `xcode-select` 仍指向 CommandLineTools，可以临时指定：

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm e2e:hbuilderx:local:ios
```

## Issue 回归

- `components/issue-1019-button/issue-1019-button.uvue` 提炼自
  [`unibestX` 的 `weapp-tailwindcss` 分支](https://github.com/cq112233/unibestX/tree/9f0366d359002fa1c55e015eba24227a654629cf)，
  保留 `uview-ultra/components/up-button/up-button.uvue` 中触发 #1019 的 scoped SCSS、嵌套 BEM、伪元素和变量 fallback 结构。
- `packages/postcss/test/uni-app-x.test.ts` 验证原生兼容转换不会误删上述作者样式，
  `e2e/hbuilderx-local/cases.ts` 则在 H5 浏览器中验证 scope 属性和 computed style。
- 同一 demo 也用于 #1021 Android HMR 回归；每一步都同时检查构建产物、页面 marker、截图颜色和元素尺寸。
