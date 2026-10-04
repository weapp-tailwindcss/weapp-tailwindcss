# 真实 Vite demo 的 Oxc 验证

本脚本对 `demo/web/vue-vite-tailwindcss-v4` 的真实配置执行生产构建和文本、新增类、删除、恢复 HMR，比较同一 Oxc 版本的普通 AST 传递和 raw transfer。脚本不进入发布包。

前置条件：目标仓库依赖、core 和其依赖包的 dist 已构建，仓库的 Playwright Chromium 可启动。demo 必须真实解析到 `--root` 的 core 包；不能用指向其它 checkout 的依赖链接。浏览器固定 headless，整个 runner 串行执行，每个 worker 只有一个 dev server 和一个页面。

从仓库根目录执行（`--root` 和 `--output` 支持绝对路径）：

```sh
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/self-check.json --self-check
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/verify.json --pairs 1
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/report.json --pairs 3
pnpm exec tsx packages/weapp-tailwindcss/benchmark/oxc-vite/runner.ts --root . --output .tmp/oxc-vite/report-weapp.json --target weapp --pairs 3
```

先固定一次自检和一次基础设施验证，再采集三组交替样本。自检只验证目标包身份、raw transfer 支持及 parser 包装调用，不启动 Vite 或浏览器。正式 worker 不运行 parser 预热。失败时保留 JSON、日志及有限页面证据；修正已定位的问题后使用新的输出路径，不能丢弃失败样本反复测到通过。

默认 `--target web`；`--target weapp` 使用 demo 自带的小程序输出配置，在 Chromium 中验证转换后的页面和样式，不代表小程序 IDE/设备验收。Web 路径可能不调用 core Oxc，应结合调用计数判断。

冷构建计时包含 Vite import 和真实配置 `build(write:false)`，每种模式使用独立 Node 进程及临时 Vite cache，不清理操作系统文件缓存。构建产物以完整内容 SHA-256 比较。构建与开发服务分别显式设置 `NODE_ENV=production/development`，并断言开发配置，避免 Vite build 遗留的环境关闭 Vue HMR。HMR 从保存开始计时，到 DOM、计算样式与页面 session 验证完成；150ms 轮间等待不计时。删除与恢复沿用 demo 默认 CSS 保留策略，不宣称清空 CSS 规则缓存。

只临时编辑已捕获的 App.vue，并在 finally 中核对内容归属后恢复；外部修改不会覆盖。生产构建不落盘，demo 源码最终必须逐字恢复，因此不更新 demo static 基线。自己的浏览器、dev server、临时缓存均在 finally 释放。不要同时在目标 checkout 编辑 demo；锁只防止这个 runner 并行运行。

报告保存 Node、平台、CPU、commit、源码/依赖输入哈希、各阶段真实 core Oxc 调用计数、所有原始耗时与产物哈希。零 Oxc 调用的阶段不能用于归因 raw transfer 加速。峰值 `process.resourceUsage().maxRSS` 单位 KiB，只覆盖 worker Node，**不包含 Chromium 或其它子进程**。这里是 Web demo 的有限采样，不代表完整项目、其它平台或所有内存开销。
