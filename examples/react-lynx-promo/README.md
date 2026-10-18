# ReactLynx Promo Dashboard

`@weapp-tailwindcss/lynx` 宣传视频使用的真实 ReactLynx 界面。页面中的样式由 Tailwind CSS 4 静态候选生成，并通过 Rspeedy/Rspack 进入 Lynx bundle。

```bash
pnpm --filter @weapp-tailwindcss/example-react-lynx-promo build
pnpm --filter @weapp-tailwindcss/example-react-lynx-promo test
pnpm --filter @weapp-tailwindcss/example-react-lynx-promo exec tsc --noEmit
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts --update=none
```

该界面只用于展示已验证的基础布局、颜色、间距、边框、圆角与任意值，不表示 Lynx 支持全部 Tailwind CSS utility。

## 开发录制

`src/components/BuildStatus.tsx` 是录制中实际编辑的组件。`Bundle ready` 为稳定的示例状态，不是构建进度监控器；构建成功以终端日志和重新加载后的原生页面为准。页面不展示虚构的耗时、产物体积或候选数量。

录制时连续修改同一条 `className`，每一步保存后运行真实构建，并重新加载原生页面：

1. 起始：`p-[8px] rounded-[4px] bg-[#1e40af]`。
2. 修改间距和任意值圆角：`p-[24px] rounded-[28px] bg-[#1e40af]`。
3. 修改背景色：`p-[24px] rounded-[28px] bg-[#047857]`。

间距、圆角使用显式 `px` 任意值，保证录制标注与编码样式一致。状态卡标题为 `20px`，正文为 `16px`，文字固定白色；蓝色到绿色的变化只修改背景类，不切换文案或数据。

头像是 GitHub 用户 `sonofmagic` 的真实头像，来源为 `https://avatars.githubusercontent.com/u/15621541?v=4`，在 2026-10-19 下载到 `src/assets/github-avatar.jpg`。`<image>` 使用 Tailwind 类固定 `96px × 96px`，圆角随卡片同时由 `4px` 改为 `28px`。Rspeedy 将该本地图片内联到 bundle，原生页面展示时无需联网。

仓库提交最终态。录制结束后恢复最终态，并重新执行 static 回归；不要把临时起始态提交为基线。

## Static 基线

宣传示例的定向回归会串行构建当前工作树的依赖、插件和 development bundle，核对最终态 encoder CSS 全量快照及实际解码的颜色、间距、圆角。起始态与间距态复制到独占临时目录后真实构建，三个阶段都核对原生编码属性，测试不会改写正在录制的示例源码。各阶段的 CSS、bundle 与状态卡源码保存在 `e2e/.artifacts/lynx-promo-static/`。基线只覆盖样式生成与编码，不替代原生设备截图验收。

需要更新宣传示例基线时，限定执行以下命令，然后用上方 `--update=none` 命令重验：

```bash
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts -u
```
