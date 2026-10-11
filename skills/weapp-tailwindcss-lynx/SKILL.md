---
name: weapp-tailwindcss-lynx
description: 为 ReactLynx + Rspeedy 配置 @weapp-tailwindcss/lynx 0.3.2 与 Tailwind CSS 4，覆盖 Rspeedy plugin、Lynx 原生 CSS、静态 className、theme 变量静态化、任意值、encoder 警告和 iOS/Android 运行端验证。Use for ReactLynx, Rspeedy, Lynx native CSS, arbitrary value compatibility, or Lynx bundle styling；不用于 React Native、uni-app App、Web 或普通小程序构建。
---

# weapp-tailwindcss Lynx

通过 Rspeedy/Rspack 构建图生成 Lynx 原生运行时可消费的 Tailwind CSS，保留 ReactLynx `className`，不引入运行时样式表或 JSX 转换。

完整的 `generator`、`rspack` 和固定平台字段见站点的 [ReactLynx / Rspeedy 配置参考](https://tw.weapp.dev/zh-cn/docs/config/react-lynx)。

## 工作流

1. 确认项目是 ReactLynx + Rspeedy，而不是 React Native、uni-app App 或 Rspeedy Web。
2. 检查 `@lynx-js/rspeedy`、Tailwind CSS、Node 与 `@weapp-tailwindcss/lynx` 版本。
3. 读取 [references/rspeedy-integration.md](references/rspeedy-integration.md)，配置 `pluginLynxTailwindcss()` 和 theme + utilities CSS 入口。
4. 保持完整静态 `className` 或枚举；动态候选使用 `@source inline(...)`，不要拼接半截任意值。
5. 区分 Tailwind 已生成、Lynx encoder 已接受和真实运行端已生效三个层级。
6. 检查 Rspeedy 警告；业务 utility 被删除时调整属性或 selector，不把警告全部视为 preflight 噪声。
7. 先跑单测和真实 bundle，再在目标端验证伪类、媒体、渐变、重要值和复杂视觉效果。

## 不可破坏的边界

- 插件固定 `platform: 'lynx'` 与 `generator.target: 'web'`，但输出仍经过 Lynx 原生兼容处理。
- 不使用小程序 safe class；ReactLynx 保留原始 `className`。
- 不使用 React Native manifest、Metro、Babel transform 或 `tw()` runtime。
- 浏览器 preflight 不适合 Lynx；默认只引入 Tailwind theme 与 utilities。
- Tailwind 能生成某条规则不代表 Lynx encoder 或设备运行时支持它。

## 输出要求

输出安装、完整 Rspeedy/CSS 配置、候选写法、encoder 警告结论、bundle 证据和目标端验证步骤。
