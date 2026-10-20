# ReactLynx Tailwind CSS 4 兼容性实验室

该示例是 `@weapp-tailwindcss/lynx` 的多页面兼容性实验室。当前依赖为 Tailwind CSS `4.3.3`、Lynx Engine `4.0.1`、`@lynx-js/css-defines` `0.0.18`。报告从实际解析的已安装包、两端 host 和配置中读取版本，不使用历史报告中的 `0.0.16`。当前 ReactLynx compiler 的 bundle 版本固定为 `engineVersion: '3.9'`，由 4.0.1 host 加载验证。

页面按总览、布局、排版与视觉、变换与交互、Variants、任意值与指令拆分。跨端 catalog 统一来自 `@weapp-tailwindcss/test-catalog`，覆盖 utility 功能族、variant 类型、指令与任意值语法分支；颜色、尺寸等无限值域使用代表值。所有 class 都以完整静态字符串保存在共享目录中，禁止运行时拼接。

## CSS 入口

```css
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
@source not "./**/*.test.{ts,tsx}";
@source not "./**/*.d.ts";
@source "../../../tools/tailwindcss-test-catalog/compatibility-candidates.txt";
```

实验室另有独立 fixture 验证 `@reference`、`@config`、`@plugin`、prefix 和 important。Tailwind CSS 仍完全由 `weapp-tailwindcss` 生成，没有接入官方 PostCSS/Vite 生成插件。

## 证据层级

- `generated`：PostCSS 解析真实 `dist/.lynx/main/main.css`，确认候选 selector 与预期属性。
- `bundled`：解析 `tasm.json.css.cssMap`，再结合真实 encoder removal 日志确认规则是否保留。
- `runtime.ios` / `runtime.android`：固定 4.0.1 host 的 reporter、`boundingClientRect`、交互/像素 checkpoint 与截图。
- `@lynx-js/css-defines` 只提供属性与版本提示，不能替代原生运行结果。

每个候选分别记录生成和编码状态，`.flex-col` 不能证明 `.flex` 存在。`@source` 等构建指令按生成结果判断，派生 utility 被 encoder 删除会保留为独立的编码失败，不再反推指令失败。`active` / `hover` 与 `group` / `peer` 分别判定：当前 active 注入已验证；hover 的必要媒体条件由完整原生负向证据拒绝，后续 hover 输入和伪状态仍为 `not-tested`；group/peer 在 encoder 阶段拒绝，不能借 active 的成功传播支持结论。

页面显示已提交 JSON 中的历史结果。当前基线来自 2026-10-19 正式 run `39272094832` 的完整双端报告，Android 54 支持/64 限制、iOS 53 支持/65 限制；原始证据经归档重放后更新。catalog 或实际依赖变化后，这些报告不能作为新一轮验收。启动原生 runner 或更新基线之前，必须重新生成当前静态证据，再取得同一目录身份的两端真实报告。纯协议回归显式使用合成输入或历史模式，不会生成新的兼容性结论。

## 命令

```bash
pnpm --filter @weapp-tailwindcss/example-react-lynx build
pnpm --filter @weapp-tailwindcss/example-react-lynx test
pnpm e2e:lynx
pnpm e2e:lynx:static:update
pnpm e2e:lynx:android
pnpm e2e:lynx:ios
pnpm e2e:lynx:native
pnpm e2e:lynx:update
```

Rspeedy `0.17.2` 默认只落盘最终 `dist/main.lynx.bundle`；静态证据与原生 artifact 采集会由 E2E 构建流程设置 `DEBUG=lynx`，因此中间 CSS/TASM 固定位于 `dist/.lynx/main/`。不要恢复已废弃的 `output.distPath.intermediate` 配置。

`e2e:lynx` 是跨平台静态 gate。原生命令把 host 复制到 `os.tmpdir()` 下并注入 bundle，不改写仓库构建目录；诊断产物写入 `e2e/.artifacts/lynx-native/`。`e2e:lynx:update` 只有在同一 catalog、同一 Engine 4.0.1 的 iOS 与 Android 完整报告同时存在时才会更新基线。
