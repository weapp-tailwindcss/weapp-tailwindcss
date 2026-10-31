# Skyline 字体变量对照

复用当前 demo 的依赖和 Vite 配置，通过独立 `UNI_INPUT_DIR` 编译共享组件的 WebView、Skyline 两页。默认 `src` 和日常构建不包含这些探针；只有此入口在微信目标启用 `cssOptions.skyline`。

从仓库根目录运行：

```sh
pnpm --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4 skyline-typography:build
pnpm --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4 skyline-typography:dev
```

产物分别位于 demo 的 `dist/skyline-typography/build/mp-weixin` 和 `dist/skyline-typography/dev/mp-weixin`。在已登录的微信 IDE 中导入对应项目，分别打开 `pages/skyline-typography/webview`、`pages/skyline-typography/skyline`；按钮用于覆盖、清除字体变量及切换工具类和主题。

`HelloWorld.vue` 保留 scoped SCSS 的 `@reference` / `@apply`，用于检查初始化块不会使局部样式混入完整全局工具类。其余组件分别覆盖无样式、scoped、外部样式及嵌套边界。

H5、支付宝使用同一入口并指定目标，例如在 demo 目录执行：

```sh
pnpm exec node fixtures/skyline-typography/run.mjs build -p h5
pnpm exec node fixtures/skyline-typography/run.mjs build -p mp-alipay
```

自动化入口为 `e2e/skyline-typography-static.test.ts` 和显式开启 `E2E_IDE=1` 的 `e2e/skyline-typography-ide.test.ts`。IDE 用例复用现有服务并保留登录态，不启动或重置账号。
