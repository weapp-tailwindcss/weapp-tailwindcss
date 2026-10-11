---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38085811295
baseline: e976c47772afcdaea3cbe674c84b5146f7d6edc7
regressions:
  - e2e/hosted-workflow-contract.test.ts
  - e2e/demo-workflow-command.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/demo-workflow-sampling.test.ts
  - e2e/demo-workflow-short-process.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
  - e2e/demo-workflow-cancellation.test.ts
  - e2e/snapshot-source-path.test.ts
  - e2e/apps-generator-mode-compare.test.ts
  - e2e/uni-app-app-js-misescape.test.ts
  - e2e/taro-dev-signals.test.ts
  - packages/postcss/test/generated-framework-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-uni-rule-removal.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/watch-issue33-snapshot-gate.test.ts
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
- 首轮 PR head `b4239a1ea5af9b3f22d9c92ccd992b338289d6b1` 的 [PR Gate 38110762945](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38110762945/job/114386645312) 暴露 4 项已有工作流合同未同步：原 static 命令、未声明的 hot-update override、nightly 的性能确认开关和 PR 固定 Node 22 的 artifact 表达式。新增 E2E 合同通过不能替代原合同检查。同步原测试后，按解析后的 YAML 实际矩阵逐行还原环境、命令与 artifact，验证分片完整、scope 互斥、严格预算和实际 Node 版本身份，不以某一段旧表达式字符串作为行为证明。
- 后续 head `0be08166231418ea142637d028063a435edb7df1` 的 [Watch 38115113180](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115113180) 中，Windows Node 22/24 的分包 issue33 内层均已通过，外层仍要求未执行的主包 script 快照。外层改为依据已验收报告的实际载体检查本轮增删改元数据，逐个分包验收，排除命令启动前的旧快照；主包仍保留 template/script 三阶段要求。生产者显式保存与报告一致的原始 `sourceIdentity`，显示路径继续保留用于诊断；验收三阶段均按不透明来源身份匹配，不借宿主路径或时间戳 marker 推断载体。真实失败产物重放、缺阶段及同 marker 错误来源拒绝与边界见[快照 scope 复盘](watch-issue33-snapshot-scope.md)。
- 同一 head 的 [Coverage 38115119083](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115119083) 暴露生成器比较入口遗漏的统计基线；按实际恢复的 group 样式限定同步 CSS、README 和三份报告，详见[生成器基线复盘](coverage-nightly-generated-group-baselines.md)。Ubuntu Node 22/24 与 Windows Node 22 的差异一致，未放宽断言或改变样式生成行为。
- Windows static 的模拟 POSIX 根路径测试通过被改写的 `process.platform` 选择是否调用真实文件系统，混用了声明的平台和绑定真实宿主的 native realpath。以默认 `node:path` 实现的对象身份界定真实宿主，外平台 fixture 只解析逻辑路径。
- Windows 的“独立后代”回归实际创建非 detached 子进程，父退出时由 Job 管理终止，无法执行合作恢复。fixture 改为真正跨平台 detached/unref 后代，并在父 close 后明确验证后代仍已登记、源码仍处于修改态；只有取消触发恢复并确认退出后才通过。
- 正常短命令约 50 毫秒退出时，`runStep` 立即用 2 秒清理截止收紧已经启动的 5 秒身份采集。Windows 冷 PowerShell 的首轮扫描因此被中止。正常退出先停止新增采样，等待已开始的有界采集落定，再进入原清理预算；取消和采集失败仍立即停止。保留原采集/清理绝对截止，覆盖慢首次扫描、取消期间迟到拒绝和身份失败，不放宽预算。
- Windows shard 1 的取消夹具只报告握手文件 ENOENT，原入口忽略 stderr，无法从该日志独立还原活动 CLI 分支。确定性构造 Windows pnpm 包装入口后，证明夹具替换为原生 `node -e` 时错误继承 `shell:true` 会在写文件前语法退出；先复现 SIGINT/SIGTERM 两例失败，再以 `shell:false` 恢复原生参数语义。测试保留 error/exit/stderr，隔离与取消语义无关的活动 CLI 身份；文件握手后还等待真实采集同时登记本体与独立后代，再取消。CLI 身份仍由专门命令回归验收，没有放宽启动轮询或进程预算。

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
- 首轮 PR 失败合同对应 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflows.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：2 文件、161 项通过，未修改 workflow 的执行门槛、预算或测试集合。
- 合入后 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/watch-issue33-snapshot-gate.test.ts test/ci/workflows.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：3 文件、182 项通过。
- 合入后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/snapshot-source-path.test.ts e2e/snapshotUtils.test.ts e2e/demo-workflow-command.test.ts e2e/demo-workflow-sampling.test.ts e2e/demo-workflow-short-process.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-windows-cleanup.test.ts --update=none`：8 文件、107 项通过，含真实短 Node、参数透传、独立后代合作恢复和 2200 毫秒慢首轮探针。
- 显式生产者来源身份补充后 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/watch-issue33-snapshot-gate.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：2 文件、139 项通过，含 23 项快照验收与实际 metadata 工厂回归；目标文件以 `eslint --no-ignore --max-warnings=0` 严格检查通过。
- `CI=1 E2E_WATCH_CASE=weapp-vite-tailwindcss-v4 E2E_WATCH_ROUND_PROFILE=issue33 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MINI_PROGRAM_SCOPE=subpackages E2E_WATCH_TIMEOUT_MS=320000 E2E_WATCH_COMMAND_TIMEOUT_MS=1680000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=6000 E2E_WATCH_MAX_ATTEMPTS=1 E2E_WATCH_SAVE_SNAPSHOTS=1 pnpm e2e:watch e2e/watch/hot-update/demo/weapp-vite-tailwindcss-v4.test.ts --update=none`：真实分包 watch 1 项通过，202.86 秒。两个分包均完成 baseline、complex、hex、issue33 增删改和新增类回归，外层通过本轮源码身份与六份成功阶段元数据验收。报告为 `e2e/benchmark/e2e-watch-hmr/2026-10-11T06-15-24-087Z-weapp-vite-tailwindcss-v4.json`；结束后源码恢复，按本工作树 cwd 检查没有遗留 Node 测试进程。
- 合入取消夹具补充后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-cancellation.test.ts --update=none`：5 项通过，确定性覆盖 Windows fallback 的 shell 属性与 SIGINT/SIGTERM 真实登记后代取消；目标文件严格 ESLint 通过。

## 适用边界

本轮本地执行定向回归与受影响构建，没有启动全仓或全端验收，没有操作微信 IDE 登录态。Windows 路径与进程表分支通过明确平台输入的回归覆盖；本机不提供真实 Windows runner，修复后的 hosted 全矩阵结果需要由对应工作流验证。旧 head 的成功和条件跳过均不能作为新实现已通过的证据。

## 规则评估

不新增 AGENTS 规则。现有跨平台路径、命令身份、回归和测试范围约束已覆盖这些边界；把具体执行映射和进程身份要求固化成可执行测试，避免继续重复扩充规则。
