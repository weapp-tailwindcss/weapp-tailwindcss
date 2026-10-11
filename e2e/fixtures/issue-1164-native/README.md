# Harmony 原生 CSS 最小对照

本目录不加载 weapp-tailwindcss、debugX 或官方 Tailwind 插件。背景、尺寸、圆角使用等价原生 inline CSS，组件仍保留空白、`//`、块注释、含作者规则四种 scoped SCSS。作者规则保留 8px padding。页面按钮用于观察更新是否重置内存状态。

复制到仓库外的独立**真实目录**，不要把项目根目录做成符号链接；为它提供 demo 的 `node_modules`（依赖目录可以链接）。使用 HBuilderX 5.25 alpha 打开这个目录，以 VDOM、样式隔离 1.0 运行到 Harmony。编译器版本与渲染模式必须从本轮日志确认。

在同一运行会话依次操作：

1. 确认四组橙色 100px 容器、红色 48px 圆形、作者 padding 均正确；点击按钮，记录 `state=1`、PID、截图与布局树。
2. 删除 `components/line.uvue` 中单独的 `//`，将文字改为 `line-no-comment`，保存一次。
3. 加回 `//`；四组背景改为 `#007aff`、容器高度改为 `120px`、圆角改为 `12px`，line 文字改为 `line-blue-comment`。
4. 恢复四个组件。每轮分别检查编译产物、当前设备文字及样式，记录 PID 与 App Launch 次数。

2026-09-08 实测三轮均显示“热更新完成”，但紧接着 App Launch、PID 变化；第一轮 `state=1 → state=0`。没有失败后重装，仍不属于保持运行状态的纯 HMR。不要将这个结果归因于不存在于配置中的 Tailwind 插件。

仅验证原生编译产物的自动入口：

```sh
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1164_NATIVE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1164-native-static.test.ts --update=none
```

该入口在 `os.tmpdir()` 创建独立物理项目，记录所选 CLI，编译后检查四组实际产物并关闭自己的项目。它不代替以上设备操作。首次基线更新只把末尾参数换为 `-u`，随后再禁止更新复验。
