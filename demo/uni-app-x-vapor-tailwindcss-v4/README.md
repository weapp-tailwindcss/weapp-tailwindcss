# uni-app-x-vapor-tailwindcss-v4

`uni-app x + Vapor + Tailwind CSS v4` 的 #1119 最小回归 demo。

## 关键配置

- `vite.config.ts` 直接注册 `WeappTailwindcss(uniAppX(...))`
- `main.css` 使用 `@import "tailwindcss"` 与 `@source`
- `App.uvue` 的全局 `<style>` 使用 `@import './main.css'`，把生成入口加入 HBuilderX 构建图
- 显式配置 `cssEntries`，使用项目根目录解析主入口和非 App Iconify 入口的绝对路径
- 不注册 `@tailwindcss/postcss`，也不注册 `@tailwindcss/vite`
- uni 插件由共享选择器加载：HBuilderX 使用当前 IDE 提供的编译器路径，npm CLI 使用项目依赖；IDE 插件缺失时立即失败，不混用两个版本。IDE 日志中的 `[uni-toolchain]` 记录实际入口。

## 运行

```bash
pnpm run dev:app-harmony
```

也可以直接用 HBuilderX 导入当前目录运行。

## Issue 回归

页面同时保留 Tailwind `leading-[26px]` 和原生 `line-height: 26px` 对照，便于比较生成的 Harmony style bytes。
