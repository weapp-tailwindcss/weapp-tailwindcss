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

1. 起始：`rounded-[8px] p-2 bg-[#171e20]`。
2. 修改间距和任意值圆角：`rounded-[18px] p-4 bg-[#171e20]`。
3. 修改背景色：`rounded-[18px] p-4 bg-[#10241b]`。

仓库提交最终态。录制结束后恢复最终态，并重新执行 static 回归；不要把临时起始态提交为基线。

## Static 基线

宣传示例的定向回归会串行构建当前工作树的依赖、插件和 development bundle，核对 encoder CSS 全量快照及实际解码的颜色、间距、圆角，日志保存在 `e2e/.artifacts/lynx-promo-static/`。基线只覆盖样式生成与编码，不替代原生设备截图验收。

需要更新宣传示例基线时，限定执行以下命令，然后用上方 `--update=none` 命令重验：

```bash
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-promo.test.ts -u
```
