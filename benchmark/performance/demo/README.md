# 发布版接入成本周测试

本套件在独立消费项目中比较不接入、预生成静态样式、正常接入三个模式。默认只读生成报告，不修改生产 API、demo 源码或冻结预算。

## 工作流

`.github/workflows/demo-performance-weekly.yml` 每周一 UTC 00:30（北京时间 08:30）运行，合并到默认分支后生效；也支持手动运行。调度不保证准点，报告记录实际开始时间。

工作流从 `scripts/ci/demo-matrix/catalog.mjs` 生成矩阵。28 个 demo 的登记情况、107 个 CLI 目标、Windows/macOS/Linux、现有 Node 22/24 覆盖由同一清单维护，不另抄目标列表。安装按 demo／系统／Node 去重。RN 仅代表默认禁用插件的原生构建；WebView 构建不代表设备验收；IDE 专属项目在报告中持续列出。

plan job 只解析一次 npm latest。测量分片下载该 manifest，校验源码 SHA、固定发布版、操作系统、Node 主版本。聚合使用 plan 的预期清单，拒绝重复、缺失、错误版本或采样不足；失败时仍上传已经取得的原始数据。JSON、Markdown、HTML 和分片日志保留 90 天。报告留在 Actions，不发 Issue 或评论。

npm 解析失败或计划 artifact 缺失时，聚合仍按清单生成失败报告，版本和指标显示 N/A；不会重新解析 latest 或改用仓库版本。runner 无法启动、checkout 或测量工具安装失败等基础设施故障仍依赖 Actions 自身日志。

合并前可以通过已在默认分支登记的 Benchmark 工作流，以当前分支手动设置 `weekly_demo_cost=true` 调用新工作流。原有 PR 性能检查和微基准不受影响。

## 命令

```sh
# 解析版本和矩阵，不运行测量
pnpm perf:demo:report --plan --out-dir .tmp/weekly-plan

# 定向运行当前操作系统与 Node 对应的一个分片
pnpm perf:demo:report --only web/react-vite-tailwindcss-v4:web --phases build,hmr --out-dir .tmp/weekly-local

# 分片按同一份固定版本计划执行；不同分片可在不同 runner 并行
pnpm perf:demo:report --manifest .tmp/weekly-plan/manifest.json --job shard-0 --out-dir .tmp/weekly-shard

# 即使分片不完整，也先生成三种报告再以非零状态退出
pnpm perf:demo:report --manifest .tmp/weekly-plan/manifest.json --merge .tmp/weekly-shards --out-dir .tmp/weekly-report

# 尚无预算时只检查完整性，不能因为接入组较慢就失败
pnpm perf:demo:guard --report .tmp/weekly-report/report.json

# 两批独立采样显式冻结预算；普通 CI 永远不调用该命令
pnpm perf:demo:baseline:update --first .tmp/first/report.json --second .tmp/second/report.json --budget .tmp/cost-budget.json
pnpm perf:demo:guard --report .tmp/weekly-report/report.json --budget .tmp/cost-budget.json
```

`--version` 接受 latest 或确切发布版本；`--phases` 接受 install、build、hmr 的组合；`--reverse` 反转轮换顺序。疑似退化最多提供一次完整的反向报告，通过 guard 的 `--confirmation` 验证身份与结果，保留两批原始数据。缩减采样必须显式 `--diagnostic`，不能作为正式周报或预算依据。

## 测量边界

- 准备阶段独立安装 npm 发布依赖、捕获真实框架配置、生成每个操作状态的静态输入，全部排除在计时外。实际解析路径必须在消费项目内，禁止本地包回退。共有直接依赖固定版本，peer 实例差异保留在锁文件中。
- 准备阶段将已下载包复制到各组独立 store，副本不使用硬链接；这仅减少重复网络下载。正式冷安装仍逐轮使用全新空 store，离线安装与构建缓存按组隔离。
- 不复制 workspace peer 快照；那会把全仓可选 peer 带入普通项目。每组保存独立 manifest、完整锁文件和 integrity，框架依赖从仓库锁文件取确切版本。
- 三组一致复用仓库已登记且匹配实际解析版本的框架补丁（例如 Rollup 连续监听修正），禁止修改被测 weapp-tailwindcss 发布包。补丁原文、版本与 SHA-256 保留在分片 dependencies 和 JSON 中。结果代表该明确记录的 demo 工具链，不能冒充完全无补丁框架的体验；补丁改变会改变锁文件趋势身份。
- uni-app 默认保留符号链接，无法从 pnpm 嵌套布局解析部分传递依赖；该框架三组均使用 pnpm 的 `hoisted` 布局，其余框架使用默认 `isolated` 布局。项目与 store 仍各自独立，布局记入报告和趋势兼容身份，不能与旧布局直接比较。
- `weappTwIgnore` 页面标记在两种基线中使用普通 `String.raw`，每轮准备先核验被测发布版导出确实与内建函数同一；其他运行时 API 不做推测替换。额外的 `debug-uni-app-x` 磁盘诊断在三组均关闭且不安装，避免 profiling 污染正常体验的数字。
- 静态预编译按 TSX、JSX、TypeScript 和 SFC script 语法调用被测发布版，解析失败直接阻断，不能将原文当成安全类名转换成功。Taro Vite 支付宝的两种基线保留既有 `.browserslistrc` 框架兼容资产，通过 bundler API 提供并记入 `baselineCompatibility`；不加载 Tailwind 生成或转换实现。
- 安装包含生命周期脚本。冷 pnpm store、热 store 离线重装、已有原生依赖上的离线增量安装各 7 轮；记录包数量、压缩包大小、文件空间和 store 空间。压缩包大小来自 pnpm 已完成下载事件，不包含重试与 HTTP 协议流量。未报告大小时为 N/A 并阻断完整性。
- 构建的冷／热指项目缓存；操作系统文件缓存不宣称已清空。每组构建 7 轮，退出到产物验证是明确的两个步骤，耗时截至构建进程退出。冷缓存删除受控缓存，热缓存保留编译器缓存但移除旧输出。
- dev 启动截至本轮页面或产物验证完成。Web dev 的模块通常驻留内存，因此报告页面就绪，不伪造落盘时间。小程序报告产物就绪，不能冒充设备页面生效。
- HMR 每组使用同一个 watcher 连续预热 2 轮、每类采样 20 轮，整批完成后关闭进程再开始下一组；同一 runner 不同时驻留三组 watcher。组次序按分片轮换，`--reverse` 反转整批次序，每个样本记录 `modeOrder`。安装、构建及启动仍逐轮轮换。每次按唯一 marker、实际消费类名和样式验证，不使用固定等待作为成功依据；逐状态读取两组语义证据进行等价比较。浏览器重新导航明确标记 reload；小程序为 native-watch。
- Web 比较实际页面节点结构及计算尺寸／颜色；静态组和接入组探针与可达样式必须一致。作者 CSS 探针有实际消费方。配置失效指 Tailwind CSS 主题配置变更及恢复；纯样式注入项目没有 Tailwind 配置指标。
- 未变化的 CSS 输入不随文本 marker 重写，避免把文本热更新测成源码加样式的复合操作；样式确实变化时，静态组等待本轮已挂载的内联或外链 CSS，再提交依赖它的源码；恢复状态也走同一屏障。当前策略为 `changed-input-only-v2`。`styleSavePolicy` 进入趋势身份，旧口径报告不能与新口径直接比较。
- 每次观察到更新完成后，下一次保存前保留 150 ms 静默间隔，避开 Chokidar 的 50/100 ms change/remove 去重窗口。三组一致，该输入间隔在计时外；每次保存后仍等待本轮真实 marker 和样式。样本与趋势身份记录 `interSaveQuietMs`，不能与旧的连续无间隔保存口径混比。
- Web demo 的 weapp 目标是转换预览：原始挂载 CSS 保存 rpx 转换证据，浏览器计算样式另存，不能将浏览器忽略 rpx 的布局当作小程序设备效果。
- RSS 是进程树峰值估计，不包括观察器。POSIX 使用 `ps`，间隔 250 ms；Windows 在计时前初始化常驻系统进程快照采样器，间隔 50 ms。报告环境身份记录采样方法。HMR 记录 watcher 截至本轮的峰值，不能解释成单次操作独占内存。产物观察器轮询间隔 30 ms，页面验证成本包括在 save-to-validated-page 中。

## 统计与失败

报告格式为 `weapp-demo-cost/v1`，每行保留全部三组原始样本、median、p95、语义标记、环境和发布版身份。总接入增量是 enabled − native，实时处理增量是 enabled − static；百分比分别除对应基线。零基线、失败、缺样本显示 N/A，改善保留负值。

预算按两批报告中较高的开销加相对／绝对容差冻结，同时检查接入组总耗时、相对静态组的额外耗时及 RSS。使用单侧配对符号检验辅助判断；跨周环境不兼容时拒绝归因为版本退化。网络冷安装不作为退化判据。

目前 React Vite Web 已完成正常采样数的真实定向验证，Gulp 构建与连续更新已通过缩减采样诊断；SCSS 的变量、嵌套和 Tailwind 指令预编译已通过发布版验证。这些结果不代替其他框架及样式注入规则的云端实测，适配或语义失败属于失败，不作为通过或零开销。PR 已进入正式评审，全矩阵验收状态仍以当前提交的完整报告为准。首轮生产优化必须在可比较的基线和独立 profile 取得之后开展。

## 验证

```sh
pnpm test:perf:demo
pnpm agents:check
```

定向测试不需要全端预检；本地全面验收仍需本轮 `pnpm e2e:preflight prepare`、原生 Chrome 交互证据和 verify。普通云端 CLI 测量不声称完成微信 IDE、HBuilderX 或设备验收。静态输入在每次准备阶段重新生成并归档为 static-inputs.json，计时构建只验证，不更新该输入基线。
页面验证同时读取计算样式和浏览器已经加载的原始 CSS 响应，不重复请求外链样式。Nuxt 的 `vue-tracer-overlay`、`nuxt-devtools-container` 和 `nuxt-devtools-inspect-panel` 属于开发工具，不进入应用 DOM 等价比较；其出现情况写入浏览器观察证据，应用及 teleport 节点仍完整比较，开发工具的实际运行开销仍在计时内。

## 生成会话局部失效诊断

先构建当前 engine 和主包，再执行：

```sh
node benchmark/performance/scripts/compare-generation-invalidation.mjs --base-ref origin/main --out-dir .tmp/generation-invalidation
```

该诊断将基准提交和当前生成会话池分别打包，两组共用当前已构建的其他依赖，明确隔离会话池这一项改动。它不是两个完整发布版本或 demo HMR 的对照。2、8、24 个入口分别预热 2 轮、采样 20 轮，两批使用相反顺序；每轮比较完整 CSS 哈希，保留样本、median、p95、进程 RSS 和独立 CPU profile。RSS 是整个工作进程峰值，不是单次操作增量。结果留在指定目录，不修改预算。

### 源码 tarball 对照（与 npm 周报隔离）

在基准提交和修改提交分别构建运行时依赖闭包，然后运行：

```sh
node benchmark/performance/scripts/source-generation/pack.mjs --source <源码身份> --out-dir <打包目录>
node benchmark/performance/scripts/source-generation/run.mjs --before <基准打包目录>/artifacts.json --after <修改打包目录>/artifacts.json --only web/vue-vite-tailwindcss-v4:web --out-dir .tmp/source-demo-comparison
```

使用现有 demo 清单和静态预生成、产物／页面等价检查，每个版本安装完整内部 tarball 闭包；不使用 workspace 链接，也不调用 npm 周报的发布身份兜底。报告使用独立 `weapp-source-demo-comparison/v1` 格式，保存 tarball SHA-256、实际解析路径、原始样本及两批反向顺序对照。正式采样沿用 7／2／20；`--diagnostic` 只用于定位失败，不参与预算。该入口不测安装下载，也不自动更新性能预算。`--phases build`、`--phases startup`、`--phases hmr` 可限定阶段（hmr 包含启动）；`--confirmation` 仅运行一次 before→after 的完整批次，用于反转第二批 after→before 的疑似退化场景。确认结果必须另存目录并保留原始两批，不能循环重试直到通过。
