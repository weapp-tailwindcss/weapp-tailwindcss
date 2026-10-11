# v5 迁移清单

## 1. 建立基线

记录旧版本、构建命令和一个可见页面。保存迁移前小程序/H5/App 产物或截图，确保可以回滚。

## 2. 升级运行环境

- 当前 `weapp-tailwindcss` manifest：Node `^22.18.0 || >=24.11.0`。
- 当前文档只维护 Tailwind CSS 4。
- HBuilderX 项目至少使用 5.11。
- 当前包同时发布 ESM 与 CJS 入口；不要为旧 Node 加 ESM-only Tailwind 官方插件兜底。

## 3. 清理旧职责

删除：

- `postinstall: "weapp-tw patch"`。
- 业务项目直接依赖的旧 `tailwindcss-patch`，除非其他独立工具明确需要。
- 同一次受管构建中的 `tailwindcss` PostCSS 插件、`@tailwindcss/postcss`、`@tailwindcss/vite`。
- 只为 H5/Web 编写的 `disabled: isH5`。
- Webpack 4 专用插件入口。

保留业务 PostCSS 插件、框架插件和独立纯 Web 应用自己的生成链路。

### 旧 CLI 迁移

npm 上 `@weapp-tailwindcss/cli` 3.x 与 4.0.0-alpha.x 属于旧原生小程序 Gulp 工具链。当前 CLI 从 5.x 重新发布：

- CLI 从 `weapp-tailwindcss` 核心包拆到独立 `@weapp-tailwindcss/cli`。
- 不再提供旧版 `init`、Sass/Less 或项目目录扫描流程。
- 预处理器、模板/脚本转换和项目 asset graph 由现有 bundler 集成负责。
- 新 CLI 默认 Web target；`--target weapp` 只处理生成 CSS。

迁移后安装三个显式依赖，并更新脚本：

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch
```

## 4. 重建 Tailwind CSS 入口

```css
@import "tailwindcss" source(none);
@source "../src";
@source not "../src/uni_modules";
@source not "../node_modules";
@source not "../dist";
@source not "../unpackage";
```

- 使用纯 `.css` 文件。
- 从应用入口真实导入。
- 为普通分包和独立分包列出全部真实入口。
- 从项目根目录解析绝对 `cssEntries`。

## 5. 注册当前插件

- Vite：`weapp-tailwindcss/vite`。
- Webpack 5：`weapp-tailwindcss/webpack`。
- Rspack：`weapp-tailwindcss/rspack`。
- Gulp：`weapp-tailwindcss/gulp`。
- uni-app x：在 Vite 入口外使用 `uniAppX()` preset。
- Taro：小程序与 H5 都注册；Vite 项目放到 `config/index` 的 `compiler.vitePlugins`。

## 6. 验证职责边界

1. 全新安装后不执行 patch。
2. 构建日志中只有一个 Tailwind 生成链路。
3. CSS 入口被模块图加载，`cssEntries` 只负责入口语义。
4. 新增 `mt-[11px] w-[173px] bg-[#102938]` 后，小程序出现 safe selector，H5 保留浏览器可用 selector。
5. JS/模板只有扫描命中的 class 被转换，API、路由和资源路径保持原样。
6. 同一 dev 进程连续修改任意值，确认 HMR 不复用过期候选。

## 7. App 与 HBuilderX

- Android/iOS 切换前停止旧运行任务并重新 launch。
- 记录实际输出目录；uni-app x 可能使用 `.uvue/app-*` 或 `unpackage` 缓存目录。
- 以设备页面、logcat、模拟器日志或 WebView 探针确认真实页面，不把 HBuilderX 启动页当成 ready。

## 常见失败

| 现象 | 根因优先级 |
| --- | --- |
| 完全没有 CSS | 入口未实际导入；`cssEntries` 不是生成开关 |
| CSS 重复或顺序异常 | 仍存在第二个 Tailwind 生成器 |
| H5 是 safe class | 目标环境识别错误，必要时显式 `generator.target: 'web'` |
| App 缺样式 | preset、入口、平台识别或真实运行产物未命中 |
| JS 字符串没转 | `@source` 未覆盖，或 class set 刷新时序错误 |
| 新 CLI 没改 WXML/JS | 这是 5.x 的职责边界；完整项目改用 bundler 插件 |
