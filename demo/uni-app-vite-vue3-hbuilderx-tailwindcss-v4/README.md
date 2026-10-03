# uni-app-vite-vue3-hbuilderx-tailwindcss-v4

`uni-app + Vite + Vue3 + HBuilderX + Tailwind CSS v4` demo.

## 关键配置

- `vite.config.ts` 直接注册 `WeappTailwindcss(hbuilderx(...))`
- `main.css` 使用 `@import "tailwindcss"` 与 `@source`
- `App.vue` 全局 `<style>` 中实际导入 `./main.css`
- 显式配置 `cssEntries`，使用项目根目录解析到 `main.css`、普通分包 CSS 和独立分包 CSS 的绝对路径
- 不注册 `@tailwindcss/postcss`，也不注册 `@tailwindcss/vite`

## 运行

```bash
pnpm install
pnpm dev:mp-weixin
pnpm build:mp-weixin
```

`dev:mp-weixin` 直接使用选中 HBuilderX 安装的编译器持续监听源码，不自动打开微信开发者工具；可通过 `HBUILDERX_CLI_PATH` 或 `HBUILDERX_CHANNEL` 选择安装。uni 插件工厂与编译器使用同一工具链，普通 npm 构建仍使用项目依赖。微信 IDE 由用户预先打开，E2E 统一经仓库会话入口连接。

也可以直接用 HBuilderX 导入当前目录运行。
