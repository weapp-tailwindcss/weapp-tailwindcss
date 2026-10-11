---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38085811295
baseline: e976c47772afcdaea3cbe674c84b5146f7d6edc7
regressions:
  - e2e/hosted-workflow-contract.test.ts
  - e2e/demo-workflow-command.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/snapshot-source-path.test.ts
  - e2e/uni-app-app-js-misescape.test.ts
  - e2e/taro-dev-signals.test.ts
  - packages/postcss/test/generated-framework-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-uni-rule-removal.unit.test.ts
---

# Watch 与 Coverage Nightly 的执行边界修复

## 症状

[E2E Watch 38085811295](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38085811295) 有 24 个失败 job。Web、主包和分包 shard 实际都从完整小程序轮次开始；Windows weapp-vite 的主包已通过，但命令在首个分包中途达到 840 秒总超时。Taro 已输出带 ANSI 颜色的 `built in …`，就绪检查仍超时。复杂 corpus 的 group 选择器没有进入最终 CSS。

[Coverage Nightly 38089432046](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38089432046) 的 Windows static 出现 20 文件、41 项失败，Linux/macOS Node 22 达到 45 分钟 job 上限而被取消。Linux Node 24 全部通过，其中 static 用时 1748 秒，随后多平台构建再用时 433 秒。

## 根因与纠正

- Watch 的 nightly step 漏传矩阵的执行 profile。PR 与 nightly 改为共用 YAML anchor 的完整环境映射，回归直接读取实际 workflow，检查参数、artifact 身份唯一性与 shard 覆盖。
- Windows weapp-vite 的完整主包、两个分包串行共用一段命令预算。按已有 scope 拆成主包与分包 job，保留全部 mutation 与 issue33 轮次；两个分包按两段独立 workload 分配总预算，单次更新阈值保持原值。
- Coverage 的整个顶层 static 集合串行运行，新增编译器、watch 和进程生命周期回归不断累积。每个 OS/Node 组合按相同规则划为四片，保持每片串行，在不同 checkout 执行。框架矩阵和多平台构建每个 host 仅执行一次。
- Windows 对所有阶段使用 shell，导致原生 Node 命令的空参数和特殊字符被重新解释。原生命令直接 spawn，pnpm 复用现有 CLI 身份适配器。真实子进程验证空参数、中文、引号及 shell 字符。
- 进程清理不能仅凭历史 PID。采集初始出生身份，停止前再次比较启动时间；独立后代测试先确认登记成功，再释放父进程。
- 文件系统路径与快照标识混用。glob 结果在进入文件读取时还原原生路径；CSS 来源先区分 POSIX/Windows 语义，再在报告边界转为逻辑路径。跨盘、根路径、UNC、相对路径和项目外来源均有回归；JSON 输出解析后比较字段，模块路径通过 realpath 比较身份。
- Taro 就绪信号直接对 stdout/stderr 的任意 chunk 匹配，ANSI 颜色和分块会破坏 `built in …` 的边界。改为两个流分别缓存完整日志行、消除 ANSI 后识别编译、watch 与错误信号；保持原稳定窗口和超时门槛。
- Tailwind 的复杂 group 变体包含 universal 选择器。框架的 `postcss-html-transform` 在最终小程序兼容转换前删除该规则，导致 JS 中存在已转译 class，而最终 CSS 缺失。PostCSS 所有者在生成阶段展开嵌套后，仅准备带 class 的规则中的 universal 元素选择器，保留原始 utility 身份；框架过滤完成后仍由最终阶段转译 class。配置经生成编排显式传递，覆盖 legacy/nested、自定义选择器列表、`universal:false`、classless preflight 与增量组装，真实 Vite 的 weapp/alipay 构建验证框架输入及 CSS/JS 产物身份。
- watch corpus 对小程序按既有语义移除的 `@supports` 与 hover 工具类漏声明预期，但应保留的 group 规则也缺失。为实际使用 complex corpus 的 Gulp、Mpx、Taro mutation 补齐明确移除合同，继续验证这些类在消费方的身份与条件结构确实消失；group 必须保留 CSS，不能加入移除名单。Taro Vite Vue 模板恢复全量类名断言。
- Nightly 的临时 uni CLI、Lynx WASM 诊断和原生会话祖先路径问题，见[专项复盘](e2e-nightly-wasm-fixtures.md)。

## 验证

- `pnpm install --frozen-lockfile`、`pnpm --filter weapp-tailwindcss... run build`：通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hosted-workflow-contract.test.ts e2e/snapshot-source-path.test.ts e2e/snapshotUtils.test.ts e2e/tailwind-patch-extraction.test.ts e2e/uni-app-x-toolchain.test.ts e2e/frameworkIdeDiagnostics.test.ts e2e/demo-workflow-command.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-short-process.test.ts e2e/demo-workflow-windows-cleanup.test.ts --update=none`：12 文件、135 项通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-app-js-misescape.test.ts --update=none`：8 项通过，真实 App/H5 构建保留业务字符串和安全类，原有快照匹配。
- Vitest 实际 BaseSequencer 的只读分片检查：223 个当时已发现文件分为 56/56/56/55，集合完整且无重复。不执行测试主体。
- `actionlint .github/workflows/e2e-watch.yml .github/workflows/e2e-coverage-nightly.yml`：通过。
- 合并后 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-framework-universal.integration.test.ts test/bundlers/generator-css-deferred-selectors.test.ts test/watch-hmr-uni-rule-removal.unit.test.ts --update=none`：3 文件、80 项通过，含真实 Vite 两平台与 full/incremental 配置流。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/generated-framework-selectors.test.ts --update=none` 与 `test/mini-program-generated-css.test.ts`：分别 9 项、45 项通过。
- 合并后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-dev-signals.test.ts e2e/hosted-workflow-contract.test.ts --update=none`：2 文件、17 项通过。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_SKIP_HBUILDERX=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/gulp-tailwindcss-v4.test.ts e2e/mpx-tailwindcss-v4.test.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts e2e/uni-app-vite-tailwindcss-v4.test.ts e2e/subpackage-uni-app-vite-tailwindcss-v4.test.ts e2e/weapp-vite-tailwindcss-v4.test.ts --update=all`：仅对这 9 个项目重生成 static，34 项通过。97 份文件重写后只有 Taro Vite React 普通分包 WXSS 增加 8 行 group utility 规则，与此前缺失样式的根因一致；其余基线不变。相同命令改为 `--update=none` 再次构建，9 文件、34 项全部通过。
- `pnpm architecture:check`、`pnpm release status`、目标源码与测试 ESLint：通过。中文 patch intent 覆盖 `@weapp-tailwindcss/postcss` 与 `weapp-tailwindcss`，不手动改版本号。
- `CI=1 E2E_WATCH_CASE=taro-vite-react-tailwindcss-v4 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MINI_PROGRAM_SCOPE=main-package E2E_WATCH_TIMEOUT_MS=60000 E2E_WATCH_COMMAND_TIMEOUT_MS=600000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=10000 E2E_WATCH_MAX_ATTEMPTS=1 E2E_WATCH_SAVE_SNAPSHOTS=1 TARO_E2E_WATCH_NATIVE=1 pnpm e2e:watch e2e/watch/hot-update/demo/taro-vite-react-tailwindcss-v4.test.ts e2e/watch/taro-demo-dev.test.ts --update=none`：真实 dev 就绪与主包热更新 2 文件、2 项通过，耗时 109 秒。模板/脚本均完成 baseline、complex、hex 轮次，content 完成 issue33 增删改，样式与主样式通过；complex 轮次继续核对 group 的消费与 CSS。报告为 `e2e/benchmark/e2e-watch-hmr/2026-10-11T04-05-34-435Z-taro-vite-react-tailwindcss-v4.json`。
- `CI=1 E2E_WATCH_CASE=gulp-tailwindcss-v4 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MINI_PROGRAM_SCOPE=main-package E2E_WATCH_TIMEOUT_MS=60000 E2E_WATCH_COMMAND_TIMEOUT_MS=600000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=6000 E2E_WATCH_MAX_ATTEMPTS=1 E2E_WATCH_SAVE_SNAPSHOTS=1 pnpm e2e:watch e2e/watch/hot-update/demo/gulp-tailwindcss-v4.test.ts --update=none`：真实主包 watch 通过，耗时 32 秒。模板 complex corpus 按明确合同移除条件规则，同时保留 group；模板、脚本、样式和回滚均通过。报告为 `e2e/benchmark/e2e-watch-hmr/2026-10-11T04-07-17-708Z-gulp-tailwindcss-v4.json`。
- 两轮真实 watch 完成后，`git status --short` 只剩本任务的 static 基线与复盘，源码恢复；按专属工作树 cwd 检查，无遗留测试进程。本轮没有浏览器资源。

## 适用边界

本轮本地执行定向回归与受影响构建，没有启动全仓或全端验收，没有操作微信 IDE 登录态。Windows 路径与进程表分支通过明确平台输入的回归覆盖；本机不提供真实 Windows runner，修复后的 hosted 全矩阵结果需要由对应工作流验证。旧 head 的成功和条件跳过均不能作为新实现已通过的证据。

## 规则评估

不新增 AGENTS 规则。现有跨平台路径、命令身份、回归和测试范围约束已覆盖这些边界；把具体执行映射和进程身份要求固化成可执行测试，避免继续重复扩充规则。
