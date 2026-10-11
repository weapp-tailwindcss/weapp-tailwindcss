---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137407271
baseline: e976c47772afcdaea3cbe674c84b5146f7d6edc7
regressions:
  - benchmark/version-compare/test/build-memory-artifact.test.mjs
  - benchmark/version-compare/test/gc-natural-process.test.mjs
  - benchmark/version-compare/test/gc-bounds.test.mjs
  - benchmark/version-compare/test/gc-diagnostics.test.mjs
  - benchmark/version-compare/test/gc-workload-isolation.test.mjs
  - packages/postcss/test/generated-css-ast-lifecycle.test.ts
  - packages/postcss/test/generated-framework-selectors.test.ts
  - packages/weapp-tailwindcss/test/compiler/runtime-snapshot.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-watch-dependencies.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-watch-output.test.ts
---

# Mpx HMR 内存失败与分配诊断的证据边界

## 症状

此前 PR #1269 的 Linux 两轮 RSS 增长与 macOS 未复现，已记录于[平台证据复盘](mpx-memory-platform-evidence.md)。该记录的任务、baseline 和全仓性能起点保持原意；本轮补充新的准确提交、Oxc 虚拟缓冲区来源和同路径分配对照，不将两次任务的门禁结论互换。

PR #1282 的准确 head `afd51b8e4872e9fbe1c8acc3146ccda0a17efb99` 在 [Benchmark 38137407271](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137407271) 的 attempt 1 失败。各框架实际 checkout 为 `173efea65758e9fe20a37b4e3aa2b3aa48c9b25b`，与 head 的 tree 相同，基线为 `e976c47772afcdaea3cbe674c84b5146f7d6edc7`。Synthetic、Taro Vite、Taro webpack、Uni 和 weapp-vite 通过；[Mpx job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137407271/job/114467147937) 的构建通过，HMR peak/steady RSS 两项在原反向确认后仍失败。

原配置为 Linux、Node 22.23.3、3 次 build、3 次 HMR、每次回滚、180000 毫秒超时、30 毫秒轮询，未调整阈值或追加样本。

| 原始门禁指标（MiB） | 基线 | 候选 | 变化 |
| --- | ---: | ---: | ---: |
| HMR peak | 1530.098 | 2074.828 | +35.601% |
| HMR steady | 1511.719 | 1826.902 | +20.849% |
| 反向确认 HMR peak | 1271.340 | 2089.176 | +64.329% |
| 反向确认 HMR steady | 1262.939 | 1834.980 | +45.294% |

四段 HMR 的进程树均为同拓扑的 6 个进程，差异集中在 Mpx 主构建进程。缓存条目数、来源扫描和 active assets 计数一致，但条目数不能界定保留字节。两个构建中位数仅 +0.458%、插件 +0.896%；此前 `70ff` 的构建 +6.168% 是另一准确提交的独立失败，不能混写成这轮失败。

## 根因与纠正

已证实的解释边界是 Oxc raw-transfer 的虚拟缓冲区，而非这轮 Linux RSS 失败的完整根因。实际 `oxc-parser@0.153.0/src-js/raw-transfer/common.js` 每次创建 `6442450928` 字节的 ArrayBuffer，源码明确大部分页不会被触及；缓冲区先强引用缓存，闲置 10 秒后转为 WeakRef，后续可以复用。`process.memoryUsage().arrayBuffers` 中约 6 GiB 不等于 6 GiB 物理 RSS，也不能独立证明 CSS AST 泄漏。既有 `70ff` 的 `e976` 基线已出现相同数值及约 1528 MiB 的第三轮 heapUsed。

runtime signature 使用 Oxc 的 `ast` transport，不创建上述 raw-transfer 缓冲区。它仍会分配 JS AST、字面量列表和 signature 字符串，须按实际输入、调用次数及生命周期分析，不能因为源码路径相同就假定没有新增开销。现有 snapshot 回归覆盖未变源码的语义 hash 复用与失效移除。

PostCSS 修复让嵌套展开、框架选择器准备和生成样式裁剪共享同一 Root，相关持久回归验证大输入无需中途整树序列化或重新 parse。只读审查未发现新 Root、selector 或 signature 的跨轮持有链；该审查不代替对象保留图，也不证明 Linux 内存门禁已通过。

Mpx 的 CSS 来源显式限定到 demo 的 `src` 和分包 `.mpx`，来源监听按正向 glob 的静态前缀注册，输出目录按真实 compiler outputPath 排除。TypeScript 范围也限定在 demo。基线与候选的这些配置、watch-dependencies、watch-output、signature/snapshot 和候选恢复源码无差异；新增 tests/lessons 不在这些扫描根内，未发现新测试扩增扫描范围的证据。

## 验证

原 job artifact `11701364213` 的 `matrix-raw.json`（942658 字节，SHA256 `d28a406957fcea517653c9fa19bbca8305b566b972b51c130b3c30dea62dfeaa`）和反向确认 raw（SHA256 `78685a01ee00dc517d7b03bc7c8d348da55a623f938bf2dfa704f3c0fc217ef4`）均保留；没有删除失败或用本地诊断替换门禁结论。每轮 build 的 PID、进程树、时序和内存样本由 `build-memory-artifact.test.mjs` 约束，旧统计及 blocking guard 不消费新增诊断字段。

本地在同一绝对路径的独占工作树，对 `c5919d7122180774d4c6334e26f9be5953f2c9c0` 候选及 `e976` 基线分别执行一次有界对应诊断。候选相关产品源码与 `afd` 相同；基线先运行 `pnpm --filter @weapp-tailwindcss/postcss build` 和 `pnpm --filter weapp-tailwindcss build`，两包构建通过。两侧均为 macOS、Node 22.22.3，实际 Mpx CLI 2.2.30、webpack plugin 2.11.1、webpack 5.105.4、TypeScript 6.0.3 和 ts-loader 9.5.7。

诊断复用已验证的同一 preload、原 3 次 mutation 与逐次 rollback。只在真实 Mpx 服务进程启用 inspector 1 MiB allocation sampling（包含自然 major/minor GC 已回收对象）、PerformanceObserver 和 250 毫秒内存记录。没有 force GC、heap snapshot、改变 guard 或重复守卫直到通过。首个诊断因 hook 未匹配 CLI 的 `.js` 后缀缺证，保留该失败并验证修正后的真实 CLI 身份；缺证结果未作为通过样本。

| 本地诊断指标 | 基线 | 候选 |
| --- | ---: | ---: |
| 分配树 `selfSize` 累计（MiB） | 15217.105 | 14909.954 |
| `samples.size` 另计数（MiB） | 15235.073 | 14925.392 |
| 主服务 RSS 最大值（MiB） | 2193.641 | 1430.266 |
| 自然 major GC 次数 | 7 | 9 |
| checkpoint 完成时 heapUsed（MiB） | 564.816 | 554.854 |

分配归属统一采用 `selfSize`，不混用两种 profiler 计数。两种总计的差分分布于 631/697 个节点，包括 join、crypto hash、webpack 和 inspector，不能全部归给采样器自身。累计分配包含已经自然回收的对象，既不是 retained heap，也不是 RSS。GC 的 startTime/duration 来自 V8，而 heapUsed 在 observer 回调交付时测量，不能称为准确的 GC 后保留字节；checkpoint 还包含 profile 物化开销。RSS 最大值同样覆盖诊断 checkpoint，不能与原 guard 同名指标互换。

| 函数子树累计分配（MiB，彼此重叠，不可相加） | 基线 | 候选 |
| --- | ---: | ---: |
| createAmbiguousRestoredRuntimeCandidates | 284.134 | 285.131 |
| collectStrictEscapedRuntimeCandidates | 191.720 | 171.773 |
| tryCreateJsRuntimeAffectingSignature | 73.739 | 56.918 |
| normalizeMiniProgramGeneratedCssForPostcss | 61.021 | 26.071 |
| prepareMiniProgramFrameworkSelectors | 0 | 1.000 |
| pruneMiniProgramGeneratedCssRoot | 0 | 53.003 |
| TypeScript checkSourceFile | 568.338 | 562.402 |
| Babel normalizeFile | 1095.568 | 1024.059 |

createAmbiguous 的 self 分配从 48.020 到 179.050 MiB，但完整子树仅变化约 1 MiB；不能把父子归属变化当成新增保留。以上是采样估计，不是调用次数。扫描 debug 两侧均为 entries 8、files 13、snapshot 1。

最终 17 个 JS/WXSS 的大小与 SHA256 逐项相同，共 1594514 字节，两个大 JS 为 717960 和 714083 字节。仍未逐次记录临时 signature/CSS 输入字节、hash、调用次数和每个中间产物，最终产物相同不证明所有中间输入及次数相同。两份 profile SHA256 分别为基线 `18edc19de05fecbf09a0d0fe9fbbd6914a3f91c7eb00c9dbf3ebf08f51a0aa6b`、候选 `5474a21f4ade5ad2a9f65d4c363f646ad066e897831f40e0671f5ce36d3711d8`。

两侧源码均恢复到原 SHA256 `a367cd2429fb83f8e62278df50d12bed02eddfb2ef28ec876a0f5b3ca8a70e7b`，服务及基线全部 6 个采样 PID 已确认退出。基线诊断后恢复候选分支及 postcss/core dist，分别 274/719 个文件与候选备份逐文件字节和 hash 一致，工作树干净。没有启动浏览器、操作 IDE 登录态或运行本地全面验收。

最初诊断复盘提交只新增文档，规则与 diff 检查通过，没有为文档重跑产品测试；该提交不代表本轮 Linux 门禁已通过。

### Hosted 原轮次的自然 GC 补证

为下一准确 head 的 Linux 原轮次加入私有自然 GC 记录。base/current 与既有反向确认使用同一控制器提交的 preload/helper，每个 case/run 独占会话目录，分别保存两文件 SHA256。仅匹配实际 Mpx CLI 的 realpath，记录 PID、PPID、Node 版本、角色及双时钟；控制器记录原有 spawn、ready、mutation/rollback 边界，不插入等待。

PerformanceObserver 的自然 GC 回调同步写入 NDJSON，限制为 2048 个事件、每批 256 项和实际写入 2 MiB。短写逐次计入真实字节，完整行才计入成功记录；读取端保留损坏尾行之前的有效前缀，明确报告缺证、截断、写入成本和记录完整性。major 内存仍是回调交付时的快照，不是准确的 GC 后保留量。

不增加 timer、signal/exit hook、inspector 或 force GC；原 3/3、mutation/rollback、RSS sampler、统计、反向确认及 guard 不消费诊断数据。真实 Node 子进程验证自然 GC、默认 SIGINT/SIGTERM 退出与非目标入口隔离；工作流合同逐字段比较开关前后的 raw、summary 和 guard，并检查原进程数、采样器数、写入及回滚次数。

- `CI=1 pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs --update=none`：集成树 10 文件、42 项通过。
- 同一最终诊断实现分别在 Node 22.22.3、24.18.0 执行该定向套件，各 42 项通过；新增模块严格 lint、工作流 actionlint 通过。

这是诊断补证，尚未解释或撤销原 Linux 两项内存失败。保留 `partial`，最终按新准确 head 的 hosted 原始证据继续判断。

## 适用边界

本地内存方向与原 Linux 失败相反，GC 次数也不同。它未证实新增保留热点，不能据此把原失败归为环境噪声或宣称已修复。下一准确 head 的 Linux 原工作流仍需完整验收；低开销自然 GC、PID、时间和 mutation/rollback 阶段记录用于进一步定位，不属于性能修复，原 guard 不消费该记录，也不改变采样和生命周期。

## 规则评估

不新增 AGENTS 规则，不制造缺乏归因的内存补丁或镜像测试。现有生命周期回归、准确提交身份和完整原始证据约束已经覆盖操作边界；保持 partial，直到 Linux 失败有对应证据或验收结论。
