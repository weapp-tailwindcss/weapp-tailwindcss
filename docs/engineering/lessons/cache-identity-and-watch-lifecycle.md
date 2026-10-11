---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/49eb14473c573cc2923ce2a2b4153ff0a136b9c3
baseline: 49eb14473c573cc2923ce2a2b4153ff0a136b9c3
regressions:
  - packages/postcss/test/cache-identity.test.ts
  - packages/postcss/test/cache-capacity.test.ts
  - packages-runtime/runtime/test/aggregator-cache.test.ts
  - packages/engine/test/v4.cache-capacity.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/css-entries-capacity.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-state-ownership.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-source-watch-registration.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/client-boundaries.test.ts
  - benchmark/performance/test/watch-lifecycle.test.mjs
---

# 缓存身份、构建生命周期与渐进架构优化

## 症状

审查 main 时复现了 CSS 短哈希碰撞、同名插件闭包混用、自定义运行时映射被跳过和 FIFO 冒充 LRU。新增真实 watch 场景进一步发现，候选和配置更新虽然触发了构建，但生成会话或 CSS 入口仍可能保留旧状态。

PostCSS 的 `.x{z-index:19842}` 与 `.x{z-index:127198}` 短哈希相同；不同作者变量保护成相同占位内容也会串用结果。同名 `Once` 闭包从 red 改成 blue 后仍输出 red。运行时关闭 escape、配置 `@ → AT` 的 unescape map 后，`AT` 未还原为 `@`。

## 根因与纠正

- 缓存索引不等于输入身份。PostCSS 命中时核对完整原始输入及配置；函数用弱引用身份区分。用户插件可能依赖外部状态，因此不缓存最终结果。Root 输入还携带来源位置，不按纯字符串缓存复用。
- fast path 只能跳过已证明无贡献的转换。默认转换器登记内部探针，自定义转换器完整执行。运行时缓存命中更新顺序，维持 256 条上限和实例隔离。
- design system/模块、CSS 入口、PostCSS 配置与处理器的长期缓存增加容量边界；同次管线初始化复用配置签名。保留无 watcher 调用的依赖内容校验，不用时间戳猜测代替正确性。
- Vite 按来源发现、候选刷新、CSS 资产、生成队列和组装划分状态。主组装模块从 494 行降为 264 行；退出时排空队列并释放状态，watch 中间轮次保留增量数据。来源 revision 变化时重新 transform 实际 CSS 消费入口，dispatcher 转发缓存模块、模块解析和关闭钩子。
- Webpack 必须在 loader 执行前通知依赖失效，资产阶段复用本轮变更记录。生成器返回的配置/插件依赖进入运行时判断；资产缓存同时识别原始 CSS 和 loader 生成结果，不能只依赖 JS chunk hash、入口文本或类名集合。
- 保持 source-scan、engine、postcss 与运行时各包独立，公开 API、包名和导入路径兼容。架构门禁新增客户端值依赖检查，区分 UI/主题的构建入口与运行时入口。

## 验证

环境：2026-09-28，macOS / Apple M4 Max，Node 24.18.0，pnpm 12.6.0，Tailwind CSS 4.3.3。独立工作树基于上述 baseline；真实 watch 测量提交为 `3761d59c144848d34257c1d9841f3744a4e7d18f`，测量时工作树干净。交付前已重放到最新 main `1484a54a917647228e6ecb1526578eb79b2f1a69`；上游仅更新 cssCalc 文档，已用 git diff 确认生产源码、测试、基准脚本及锁文件与测量版本一致。

### 通过

- PostCSS 新增 5 个真实管线回归，修改前全部失败，修改后通过；包含碰撞、闭包替换、外部状态和动态变量。相关配置/处理器回归通过。
- runtime 的映射、包装顺序、淘汰、失败恢复与隔离回归通过；cn、merge、cva、variants 的定向消费测试分别通过 7、29、8、20 条。
- engine 的容量、依赖刷新、生成会话与 node adapter 定向测试通过 18 条；CSS 入口淘汰回归通过。
- Vite 生命周期、dispatcher、CSS-only、uni-app x 等定向回归通过；Webpack v5 单元回归通过 168 条。
- 主包、PostCSS、engine、runtime 等受影响产物构建通过；类型检查与 runtime tsd 通过；主包 core/vite/vite-web/webpack 的 ESM/CJS 导入通过。
- `pnpm architecture:check` 通过：34 个包、1310 个源码文件。`pnpm agents:check`、`git diff --check` 和修改源码的 ESLint 检查通过。
- 新增 benchmark Vite/Webpack 产物基线位于 `benchmark/performance/test/fixtures/watch/`，使用 `pnpm --filter benchmark-performance watch:baseline` 生成；普通测试连续三轮验证最终 CSS 与基线一致，未修改现有 demo 或 IDE 快照。

### 性能证据

所有正式采样使用 2 次预热、7 次测量，串行执行，不修改现有性能预算。PostCSS 12 个场景的输出哈希与原始基线一致，运行时 36 个场景的输出稳定且通过门禁。

| PostCSS 场景 | 基线 median（ms） | 修改后 median（ms） | 修改后 p95（ms） |
| --- | ---: | ---: | ---: |
| main / 5000 规则 | 187.52 | 182.20 | 204.01 |
| content / 5000 规则 | 200.31 | 185.73 | 214.95 |
| structured / 5000 规则 | 282.95 | 249.88 | 261.40 |
| cache-hit / 5000 规则 | 1.71 | 1.70 | 1.73 |

这是单机配对样本，不据此宣称所有项目具有相同提速比例。

真实 watch 的每个样本在同一 watcher 中依次增加候选、删除作者样式、变更配置，再逐项恢复；耗时为整轮六次修改的总和。显式关闭 `preserveDeletedCss`，严格验证删除和恢复。

| 构建器 | 来源片段数 | 整轮 median（ms） | 整轮 p95（ms） | 进程 RSS 高水位（MiB） | 测量轮次 GC 后堆范围（MiB） |
| --- | ---: | ---: | ---: | ---: | ---: |
| vite | 10 | 599.02 | 614.90 | 328.67 | 59.26–62.74 |
| vite | 50 | 595.71 | 599.40 | 373.70 | 60.04–62.64 |
| vite | 100 | 594.07 | 613.59 | 378.23 | 62.97–64.53 |
| webpack | 10 | 854.83 | 915.80 | 512.86 | 88.73–90.29 |
| webpack | 50 | 869.48 | 906.96 | 556.30 | 95.06–96.56 |
| webpack | 100 | 897.05 | 973.45 | 558.89 | 101.04–101.47 |

六组恢复产物均只有一个输出哈希。RSS 为该报告进程的累计高水位；九轮生命周期样本及缓存容量测试不能代替数小时压力测试。原始 main 在 Vite 候选删除及 Webpack 配置变化步骤失败，因此不拿失败基线计算真实 watch 提速比。

复现入口：

```sh
pnpm --filter benchmark-performance report -- --suite postcss --runs 7 --warmups 2
pnpm --filter benchmark-performance report -- --suite runtime --runs 7 --warmups 2
pnpm --filter benchmark-performance watch:report -- --runs 7 --warmups 2
pnpm --filter benchmark-performance test -- --update=none
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack.v5.unit.test.ts test/bundlers/vite-source-watch-registration.unit.test.ts test/bundlers/vite-state-ownership.test.ts --update=none
```

原始证据保存在本轮工作树的忽略目录：`.tmp/watch-delivery.json`、`.tmp/watch-static.json`、`.tmp/webpack-baseline-failure.log`、`.tmp/watch-baseline-realpath.log`，以及 `benchmark/performance/.tmp/architecture-postcss-final/`、`benchmark/performance/.tmp/architecture-runtime-corrected/`。文档中的表保留了可随代码审查的摘要。

### 测量纠正

最初热点场景同时放大字符串长度和循环次数，造成基准自身的平方工作量；已固定热点输入长度，仅扩大冷请求数量。cn 冷启动也改为创建真实 cn 引擎，避免误测 merge。

临时目录曾同时使用 macOS 的 `/var` 与 `/private/var` 身份，引发空 layer 包装差异；采用已有真实编译契约的 realpath 根目录后消除。跨入口生成竞态的假设未得到证据支持，实验性串行化已撤回。Webpack 在 `afterProcessAssets` 采集本轮资产，避免读取已经变成 SizeOnlySource 的历史对象；等待监听重新就绪后才写下一份输入。没有放宽预算、隐藏失败或归一化 CSS 来绕过哈希比较。

## 适用边界

### PR #1251 CI 修复

首轮 Release Gate（run `36364376024`，head `e90e824`）在 Nuxt SSR 构建中复现 `CSS generation queue has been disposed`：Nuxt 连续使用同一插件配置，客户端 closeBundle 后原先闭包中的队列已经释放。插件工厂现在以 resolved config 分配独立状态，并按环境上下文路由钩子，保留每个实例的正常释放。新增主入口/Web 入口连续 client → SSR → client 的真实 Vite 回归及多环境交错钩子测试；定向 Nuxt build 在修复前失败、修复后通过。

另外更新旧指纹测试：函数签名的契约是同一函数稳定、不同闭包可区分，不再断言函数名或未转义的内部字符串编码。相关 58 条 PostCSS 定向测试通过。

本轮通过的是定向单测、真实解析器/编译器、程序化 watcher、构建与类型证据。未启动全仓/全端验收，未运行微信 IDE、HBuilderX、iOS/Android/Harmony 或浏览器 UI 验收；因此不声称这些环境通过。全面测试仍须先执行本轮多端预检。未等待远端 CI，也未发布 npm。

## 规则评估

不新增或放宽 AGENTS 规则。现有缓存隔离、构建图、生命周期和性能证据规则足够，通过持久回归、客户端依赖门禁及职责文档落实。


### 后续 CI：测试契约、HMR 就绪与性能

在 `a285583` 上，PR 单测分片发现 runtime 的旧 mock 仍要求自定义转换器被默认探针跳过，style-injector 用例则把“最后一个输出钩子”写成“最后一个插件”。更新为自定义转换器逐 token 执行，以及最后一个 generateBundle 钩子仍是 style-injector，保留原始输出断言。

Synthetic Performance Gate 首轮 p95 为 549.45ms，超过 541ms。保存首轮报告后，同 SHA/配置仅复测一次（run 36365289592 attempt 2），对应 job 108754035134 成功，预算未修改。

Taro Vite 分片的回退在本地定向 watch 对照复现，额外耗时集中在 tasks.css。细分调用发现：外部框架插件导致整个确定性平台管线重复处理；包内 CSS macro 每次新建 prepare 函数，也使正确的函数身份指纹无法复用该纯转换。外部插件现在仍逐次完整执行，平台结果仅按它们的输出 AST、真实来源位置与输入映射缓存；本次依赖消息不进入缓存。匿名 Input 的随机 id 不作为内容身份，缓存命中后绑定回本轮 Input。包内 macro 使用稳定 prepare 函数并显式登记纯转换；第三方同名或扩展插件不继承缓存策略。

探索记录分别保存在 `.tmp/pr1251-perf-targeted.json`、`pr1251-perf-root-identity.json`、`pr1251-perf-staged.json`、`pr1251-perf-compact.json`、`pr1251-perf-owned-macro.json`、`pr1251-perf-final.json`，保留失败与中间结果，不以反复重跑偶然通过代替优化。最终本地 5 次 HMR 采样（首轮预热后的 4 个稳态样本）插件 median 为基线 836ms、当前 886ms；峰值 RSS 3221.31MiB → 3235.50MiB。早期对应插件 median 为 842.5ms → 1052.5ms。回退已收窄，远端同环境门禁仍需确认，不据此宣称 CI 全绿。

Windows repeated-watch 第 2 轮日志显示 `[HMR] Update check failed: apply() is only allowed in ready status (state: prepare)`。探针已渲染和 WebSocket 握手不足以证明上一轮更新已完成；测试探针暴露当前 module.hot 状态，浏览器必须等到 idle 且模块请求结束后才能触发下一次写入。新增浏览器状态回归通过；`subpackage-taro-webpack-react-tailwindcss-v4:h5` 本地 production、initial、replace、add、restore、refresh 全部通过。已单独运行 `pnpm e2e:demo:matrix subpackage-taro-webpack-react-tailwindcss-v4:h5 --update --build-only` 重生成对应 static 基线，结果无语义差异。

GitHub 在本轮期间合入 main 到 PR（`487a844`）；已检查新增内容为 #1250 的快照候选/JS 字符串修复，并快进保留上游提交，未覆盖远端历史。


### 21bd1c7：选择器热点与首节点空白

Windows repeated-watch、五个真实框架 benchmark 分片和 Performance guard 在该 head 通过。Synthetic 的 5000 条主样式 p95=614.40ms（预算541ms）、median=462.57ms，保留失败报告 `.tmp/pr1251-head21-synthetic/synthetic.json`，没有对该 head 连续重跑。

本地 CPU profile 显示主要重复工作在 RuleExit：普通 class 仍经过 fallback parser，两个 specificity cleaner 还重复读取会分配数组的 Rule.selectors。增加严格的单个未转义 class/id 快速路径；有伪类、属性、转义、组合和列表时保持完整解析。占位符清理先检查实际可能替换的文本，根 scope host 追加同样先排除不可能命中的规则。

相同 CPU 采样参数（2次预热、3次测量）下，5000 条 main median 217.95 → 170.09ms，p95 229.49 → 187.99ms；12个场景输出哈希全部一致。报告为 `.tmp/pr1251-postcss-cpu/` 与 `.tmp/pr1251-postcss-cpu-after/`，对应 profile 保留在 `.tmp/pr1251-postcss.cpuprofile` 和 `.tmp/pr1251-postcss-after.cpuprofile`。这是本机热点验证，不代替新 head 的 Ubuntu 门禁。

PR 单测第三分片同时发现 `test/postcss/v4.test.ts` 的两个文件头空白差异。原因是用户删除 leading comment 的动作先于 layer 提升，提升后的子节点再次带入内部缩进。现在只在用户阶段确实删除原始首节点时，把原首节点的顶层空白传到最终首节点；原本没有被删除首节点的输入保持已有格式。原测试与 tracked fixtures 已恢复一致，未更新失败快照。

第二分片的通用 styleHandler 插件用例还暴露了阶段边界复用错误：框架重放需要过滤重复生成插件，通用作者阶段不能照搬该过滤；生成后的 AST 也不能再执行一遍字符串输入保护，否则会重新解析并固定原 layer 内缩进。分开两类插件执行入口、只准备一次输入后，主包 `test/postcss` 105条通过/4条既有跳过，保留原始全部快照。

### 9891687：Root 缓存命中分配

该 head 的 Synthetic、三个 PR 单测分片与 Windows watch 已通过。真实 Taro Vite benchmark（run `36372337743`、attempt 1、job `108771153579`）仍失败：HMR 插件稳态 median 为 2117 → 2313ms（+9.26%），构建峰值 RSS 为 1585.45 → 1669.31MiB（+5.29%）。保留 `.tmp/pr1251-head989-taro/` 和原日志，没有重跑这次失败。

Root 结果命中原先仍会构造整棵 AST 的 JSON、复制输入 CSS/map，并在重新绑定来源时再次收集和序列化 Input。现在只在未命中时捕获节点字段、raws、容器结构、位置与输入映射快照；命中检查逐节点比较，并直接返回本轮 Input 绑定。快照字段形状共享，累计快照最多保留 128000 个节点，仍保留 256 条结果上限。来源、source map、扩展元数据与闭包变化均使缓存失效；无法检查的扩展输入绕过缓存。回归覆盖多输入绑定、原地修改、结构变化、遍历状态、raws 与 POSIX/Windows/相对来源身份。

本机微基准（2 次预热、7 次测量）中，5000 条规则命中 median 8.88 → 5.84ms、p95 33.34 → 6.78ms；报告在 `.tmp/pr1251-rootmatch-before.json`、`.tmp/pr1251-rootmatch-shapes.json`。真实 Taro 使用精确 main `739f8116` 对照当前修改，按现有 matrix 脚本执行 3 次构建和 5 次 HMR，完整报告保存在 `.tmp/pr1251-perf-root-snapshot.json`，其中历史标签 `web-revision-only` 指本次工作树。

| 本机指标 | main | 当前修改 |
| --- | ---: | ---: |
| 构建耗时 median / p95（ms） | 11797.93 / 12739.66 | 11622.65 / 14687.08 |
| 构建插件 median / p95（ms） | 2465 / 2647 | 2383 / 2537 |
| 构建峰值 RSS median / p95（MiB） | 1885.50 / 1901.45 | 1852.55 / 1861.77 |
| HMR 插件 median / p95，全部 5 次（ms） | 840 / 901 | 851 / 965 |
| HMR 插件 median / p95，按脚本排除首轮后（ms） | 837.5 / 901 | 847.5 / 866 |
| watch 峰值 RSS（MiB） | 3214.38 | 3224.94 |

未隐藏首轮构建与 HMR 的高值。本机稳态回退收窄、构建内存降低，仅证明优化方向；Ubuntu 门禁仍须在新 head 验证，预算保持不变。

验证命令：`pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none`、主包 `vitest run test/postcss --update=none`、benchmark 的 `vitest run test/watch-lifecycle.test.mjs --update=none`，以及 PostCSS 构建/类型、受影响文件 ESLint、`pnpm architecture:check` 和 `pnpm agents:check`。真实对照命令为 `node benchmark/version-compare/scripts/run-matrix.mjs --versions-file .tmp/pr1251-perf-roots.json --build-runs 3 --hmr-runs 5 --timeout 180000 --only demo-taro-vite-react-tailwindcss-v4__mp-weixin --out .tmp/pr1251-perf-root-snapshot.json`。没有改动 demo 输入或 static 基线。

### fe149b25f：最终清理的重复解析与选择器分配

该 head 的 Synthetic、Release、三个 PR 单测分片及已完成的 Windows watch 通过；Taro Vite 分片仍失败（run `36374678581`、attempt 1、job `108778001066`）：HMR 插件 median 1832 → 2132ms（+16.38%），构建峰值 RSS 1604.87 → 1697.00MiB（+5.74%）。首轮日志和 artifact 保存在 `.tmp/pr1251-headfe-taro.log` 与 `.tmp/pr1251-headfe-taro/`，未重跑该失败。

本轮切换至 Node 22.22.3，在真实 Taro watch 中采集 CPU 分段，profile 在 `.tmp/pr1251-watch-cpu/`。Root 缓存命中仅占少量耗时；仍可消除的成本集中在最终清理：多个函数每次读取 `Rule.selectors` 都重新拆分列表，`finalizeMiniProgramCss` 还会在移除不支持的 at-rule 后打印并再次解析同一份 CSS。现在只有可能包含目标占位符、浏览器选择器或 container 的规则才进入相应列表处理；复杂语法继续完整解析。at-rule 清理与最终平台转换共用 AST，异常语法保留原扫描修复和字符串兜底。

仅选择器优化的中间样本在 `.tmp/pr1251-cleanups-node22.json`，稳态 HMR 插件 median 1011.5 → 972.5ms，但构建 RSS median 1711.58 → 1800.30MiB 仍偏高。加入 AST 复用后的同配置报告为 `.tmp/pr1251-finalize-node22.json`（3 次构建、5 次 HMR，macOS，main `739f8116` 对照当前工作树）：

| 本机指标 | main | 当前修改 |
| --- | ---: | ---: |
| 构建耗时 median / p95（ms） | 14068.88 / 14589.57 | 13474.94 / 13916.47 |
| 构建插件 median / p95（ms） | 2900 / 3007 | 2684 / 2732 |
| 构建峰值 RSS median / p95（MiB） | 1800.41 / 1821.17 | 1767.47 / 1805.56 |
| HMR 插件 median / p95，全部 5 次（ms） | 1022 / 1230 | 965 / 1010 |
| HMR 插件 median / p95，按脚本排除首轮后（ms） | 1102 / 1230 | 959.5 / 966 |
| watch 峰值 RSS（MiB） | 3063.33 | 3083.56 |

两轮样本均保留，基线自身也存在波动，不把这些小样本差值当作稳定提速比例。最终恢复后的 7 份 WXSS 与 main 对照逐文件 SHA-256 完全一致，证据为 `.tmp/pr1251-finalize-css-hashes.json`。真实对照命令沿用上一节，运行时切换为 Node 22.22.3，输出改为 `.tmp/pr1251-finalize-node22.json`。预算未修改，新 head 仍须通过 Ubuntu 门禁。

PostCSS 包 1214 条通过、3 条既有跳过；随后新增的单次解析、扫描修复与无效语法兜底 3 条通过。选择器回归覆盖不分配普通类名列表、属性中的逗号、转义伪类、重复占位符、原生标签与 container 列表；原始快照保持不变。额外执行主包 `test/postcss`、Vite/Webpack watch golden、PostCSS 构建/类型、受影响文件 ESLint、架构与 AGENTS 检查。没有改动 demo 输入或 static 基线。
