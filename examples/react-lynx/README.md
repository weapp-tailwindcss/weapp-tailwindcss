# ReactLynx Tailwind CSS 4 兼容性实验室

该示例是 `@weapp-tailwindcss/lynx` 的多页面兼容性实验室，不是单一展示页。固定验证 Tailwind CSS `4.3.3`、Lynx Engine `4.0.1`、`@lynx-js/css-defines` `0.0.16`。当前 ReactLynx compiler 只接受到 `engineVersion: '3.9'`，因此 bundle 版本固定为 `3.9`，由 4.0.1 host 加载验证。

页面按总览、布局、排版与视觉、变换与交互、Variants、任意值与指令拆分。catalog 覆盖 Tailwind CSS 4 官方 utility 功能族、variant 类型、指令与任意值语法分支；颜色、尺寸等无限值域使用代表值，不做无意义穷举。所有 class 都以完整静态字符串保存在 `src/compatibility/catalog/`，禁止运行时拼接。

## CSS 入口

```css
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

实验室另有独立 fixture 验证 `@reference`、`@config`、`@plugin`、prefix 和 important。Tailwind CSS 仍完全由 `weapp-tailwindcss` 生成，没有接入官方 PostCSS/Vite 生成插件。

## 证据层级

- `generated`：PostCSS 解析真实 `dist/.lynx/main/main.css`，确认候选 selector 与预期属性。
- `bundled`：解析 `tasm.json.css.cssMap`，再结合真实 encoder removal 日志确认规则是否保留。
- `runtime.ios` / `runtime.android`：固定 4.0.1 host 的 reporter、`boundingClientRect`、交互/像素 checkpoint 与截图。
- `@lynx-js/css-defines` 只提供属性与版本提示，不能替代原生运行结果。

页面只显示已提交 JSON 中的结果。已知不支持项不会令测试失败；只有 catalog、静态证据或双端结论发生漂移时才要求显式审查。

## 命令

```bash
pnpm --filter @weapp-tailwindcss/example-react-lynx build
pnpm --filter @weapp-tailwindcss/example-react-lynx test
pnpm e2e:lynx
pnpm e2e:lynx:android
pnpm e2e:lynx:ios
pnpm e2e:lynx:native
pnpm e2e:lynx:update
```

Rspeedy `0.17.0` 默认只落盘最终 `dist/main.lynx.bundle`；静态证据与原生 artifact 采集会由 E2E 构建流程设置 `DEBUG=lynx`，因此中间 CSS/TASM 固定位于 `dist/.lynx/main/`。不要恢复已废弃的 `output.distPath.intermediate` 配置。

`e2e:lynx` 是跨平台静态 gate。原生命令把 host 复制到 `os.tmpdir()` 下并注入 bundle，不改写仓库构建目录；诊断产物写入 `e2e/.artifacts/lynx-native/`。`e2e:lynx:update` 只有在同一 catalog、同一 Engine 4.0.1 的 iOS 与 Android 完整报告同时存在时才会更新基线。
