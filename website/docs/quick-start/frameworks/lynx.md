---
title: ReactLynx / Rspeedy
description: 在 ReactLynx + Rspeedy 项目中接入 Tailwind CSS 4 与 weapp-tailwindcss。
keywords:
  - Lynx
  - ReactLynx
  - Rspeedy
  - Rspack
  - Lynx CSS
  - 跨端开发
  - Tailwind CSS 4
  - weapp-tailwindcss
---

# ReactLynx / Rspeedy

`@weapp-tailwindcss/lynx` 通过 Rspeedy 的 Rspack 生命周期生成 Lynx 可消费的普通 CSS。它保留 ReactLynx 原生 `className`，不引入运行时样式表或 JSX 转换。

配置项、固定字段和 encoder 边界见 [ReactLynx / Rspeedy 配置参考](../../config/react-lynx)。

## 安装

```bash npm2yarn
npm install -D @weapp-tailwindcss/lynx tailwindcss
```

当前集成要求 Node.js `^22.18.0 || >=24.11.0`、Rspeedy `>=0.16.0` 和 Tailwind CSS `>=4.0.0`，仅支持 ReactLynx + Rspeedy 构建目标。

## 注册 Rspeedy 插件

```ts title="lynx.config.ts"
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginReactLynx(), pluginLynxTailwindcss()],
})
```

插件固定使用 `platform: 'lynx'`、`generator.target: 'web'` 与 Lynx 兼容输出。Tailwind CSS 4 的 theme 变量会在构建期静态化；应用自行定义的动态 CSS 变量保持不变。

## 配置 Tailwind CSS 入口

在应用 CSS 入口中引入 Tailwind CSS 4，并用 `@source` 指向实际源码。Lynx 不需要浏览器 preflight，推荐只引入 theme 与 utilities，以减少 Rspeedy 对浏览器专用规则的兼容警告。

```css title="src/global.css"
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

随后可以直接使用 ReactLynx 的 `className`：

```tsx
<view className="flex items-center justify-center bg-sky-500 p-6">
  <text className="text-lg font-bold text-white">weapp-tailwindcss + Lynx</text>
</view>
```

## 任意值与动态类名

任意值必须以完整静态字符串出现在 `@source` 覆盖的文件中：

```tsx
<view className="h-[45rpx] w-[123px] rounded-[18px] bg-[#123456] p-[13px]" />
```

不要运行时拼接 `w-[${width}px]`。动态场景应枚举完整类名，或在 CSS 中显式注册候选：

```css
@source inline("w-[120px] w-[240px] bg-[#123456]");
```

Tailwind 能生成 CSS 不代表 Lynx 支持每个属性和选择器。当前 Lynx encoder 会删除 `padding-inline`、`mask-type` 等不支持的属性，以及包含复杂 `:is()` / `:where()` 的选择器。需要横向内边距时，优先使用 `pl-*` 与 `pr-*` 等物理方向 utility。伪元素、交互状态、媒体查询和复杂视觉效果必须在目标端验收。

## 构建警告

完整的 `@import "tailwindcss"` 会带入浏览器 preflight。Rspeedy 可能报告并移除 `:root`、`:host`、`:where(...)`、`::file-selector-button` 等 Lynx 不支持的规则。

- 浏览器专用 preflight 警告：改用上面的 theme + utilities 入口。
- 业务 utility 对应的属性或选择器警告：调整 Tailwind 写法，不能只忽略警告。

## 验证与示例

仓库中的完整示例位于 [`examples/react-lynx`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/examples/react-lynx)，可以用来对照项目结构和 CSS 入口。你的 Rspeedy 项目应使用自己的开发或构建命令。

示例固定 Tailwind CSS `4.3.3`、Lynx Engine `4.0.1`、bundle `engineVersion: '3.9'` 与 `@lynx-js/css-defines` `0.0.16`。catalog 使用代表值覆盖官方 utility 功能族、variant、指令和任意语法分支。

静态 gate 分别记录 Tailwind 是否生成规则和 Lynx encoder 是否保留规则。双端支持只由固定 Pixel 7/API 35 与 iPhone 16 Pro/iOS 18.5 的 runtime 报告决定，`css-defines` 不能替代运行时结论：

请在自己的 Android 与 iOS 目标中分别检查：

- Tailwind 规则已经进入 bundle，encoder 没有误删目标 utility 或 selector。
- 运行时布局、伪类、媒体查询、渐变和任意值与预期一致。
- 不支持的属性、复杂 selector 和设备差异都有明确记录；“生成成功”不能替代真实运行时验收。

当前集成只覆盖 ReactLynx + Rspeedy 构建目标，不覆盖 Rspeedy Web 输出、非 React Lynx 框架或 React Native 风格的运行时样式映射。
