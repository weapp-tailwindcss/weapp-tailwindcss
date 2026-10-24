---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - packages/weapp-tailwindcss/test/compiler/generator-service-fingerprint.test.ts
  - packages/weapp-tailwindcss/test/compiler/generator-service-pool.test.ts
  - packages/weapp-tailwindcss/test/compiler/generator-service-isolation.test.ts
  - packages/weapp-tailwindcss/test/compiler/graph-generation-session.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-extension.integration.test.ts
  - benchmark/version-compare/test/dispatch-inputs.test.mjs
  - benchmark/version-compare/test/gc-diagnostics.test.mjs
  - benchmark/version-compare/test/gc-workload-isolation.test.mjs
  - benchmark/version-compare/test/allocation-controller.test.mjs
  - benchmark/version-compare/test/allocation-mapping.test.mjs
  - benchmark/version-compare/test/allocation-evidence.test.mjs
  - benchmark/version-compare/test/allocation-instrumentation.test.mjs
  - benchmark/version-compare/test/allocation-sampling.test.mjs
  - benchmark/version-compare/test/allocation-watch.test.mjs
  - benchmark/version-compare/test/taro-diagnostics.test.mjs
  - benchmark/version-compare/test/mpx-instrumentation.test.mjs
  - benchmark/version-compare/test/mpx-operations.test.mjs
  - benchmark/version-compare/test/mpx-operation-evidence.test.mjs
  - benchmark/version-compare/test/mpx-worker.test.mjs
  - benchmark/version-compare/test/mpx-observer-lifecycle.test.mjs
  - benchmark/version-compare/test/mpx-observer-generation.test.mjs
  - benchmark/version-compare/test/mpx-observer-webpack.test.mjs
  - benchmark/version-compare/test/vite-instrumentation.test.mjs
  - benchmark/version-compare/test/vite-operation-evidence.test.mjs
verification:
  - claim: Vite 与 Mpx 共用生成操作诊断在最终整合源码及实际 Node 22 上通过，不能替代真实框架诊断或正式预算
    kind: unit
    status: passed
    sha: fb3a82dd6d807357a71d6f6346afbbacbc9d7a44
    environment: macOS arm64，实际 Node 22.23.3，CI=1，29 文件 209 项，零跳过；包含最终主树 Vite 完成锚点校验
    command: node node_modules/vitest/vitest.mjs run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1 --no-file-parallelism
  - claim: f811 的正式 Synthetic HMR 复杂度超出原预算，本地另一个环境未复现不能抵销首败
    kind: ci
    status: failed
    sha: f81163842e54c11ec7be9da2c30f44485fc3274a
    environment: Ubuntu，正式 Benchmark，原 21 次采样与 1.25 指数限额，测试 merge SHA b39a34d6c55cf9f022118be93141f9edfd2161e9
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40077357864/job/120823906536
  - claim: f811 的正式 Taro Vite HMR RSS 首轮和原有反序确认均超出原预算，尚无活堆归因
    kind: ci
    status: failed
    sha: f81163842e54c11ec7be9da2c30f44485fc3274a
    environment: Ubuntu，正式 Benchmark，原工作负载、5% 与 64MiB 限额
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40077357864/job/120824630989
  - claim: f811 的正式 Uni Vite HMR RSS 首轮和原有反序确认均超出原预算，尚无活堆归因
    kind: ci
    status: failed
    sha: f81163842e54c11ec7be9da2c30f44485fc3274a
    environment: Ubuntu，正式 Benchmark，原工作负载、5% 与 64MiB 限额
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40077357864/job/120824630994
  - claim: f811 的 Mpx 实际输入协议和全文工件复核完成，输入不完全逐请求等量且不能解释正式 RSS 失败
    kind: ci
    status: passed
    sha: f81163842e54c11ec7be9da2c30f44485fc3274a
    environment: Ubuntu，实际 Node 22.23.3，八个 inputs-only worker，无 allocation
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40077388173
  - claim: 无 observer 的真实源码语义及既有 benchmark 契约在实际 Node 22 上通过，不代表真实 Mpx 诊断完成
    kind: unit
    status: passed
    sha: daf3c348cf38622c642069652d2274671af341b3
    environment: macOS arm64，实际 Node 22.23.3，CI=1，27 文件 190 项，零跳过
    command: node node_modules/vitest/vitest.mjs run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1 --no-file-parallelism
  - claim: Mpx 输入诊断在准备包构建时因 observer 尚未加载而失败，没有进入实际 Mpx 采样
    kind: ci
    status: failed
    sha: 189c9e385afbfaf0744e76bbbc96c4430879e2f3
    environment: Ubuntu，显式 inputs-only 诊断，current 准备副本的 build:pkgs 阶段
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40073897707/job/120815885894
  - claim: Mpx 诊断协议、受控源码执行及原有 benchmark 回归通过，尚不代表真实 Mpx 构建或性能归因
    kind: unit
    status: passed
    sha: f4a240c4bd97dd7f6cc76fa3609f422b25db2c94
    environment: macOS arm64，实际 Node 22.23.3，CI=1，24 文件 178 项，零跳过
    command: node node_modules/vitest/vitest.mjs run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1 --no-file-parallelism
  - claim: ab1aa7d 的正式 Mpx 首轮同时超过耗时及 RSS 预算，未触发仅 RSS 反序确认
    kind: ci
    status: failed
    sha: ab1aa7d59e6fa22e1208e15453f2217bed3cfb40
    environment: Ubuntu，正式 Benchmark 工作流，三次冷构建与三轮 HMR，原采样及预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40066210730/job/120790757674
  - claim: 8f0d56a 的独立正式 Mpx 采样通过原预算，不能解释或抵销此前首败
    kind: ci
    status: passed
    sha: 8f0d56a7b355a86fc11a9f23748ae88e8f7adb90
    environment: Ubuntu，正式 Benchmark 工作流，三次冷构建与三轮 HMR，原采样及预算，未重跑
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40067923070/job/120795374942
  - claim: Taro inputs-only 诊断完成且候选逐项一致，但运行时 CSS 来源哈希未对齐，不能解释正式 RSS 首败
    kind: ci
    status: passed
    sha: 4801004a68644b7da5d10f5f452ee73f5deef067
    environment: Ubuntu，8 个实际 Node 22.23.3 worker，两侧各 3 次冷构建和同 watcher 三轮修改回滚，仅输入诊断
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40063475127
  - claim: 同实例同源服务复用保持候选、产物、revision 与关闭隔离，真实 watch 保留候选替换及来源删除
    kind: integration
    status: passed
    sha: 59a086b174b5da439f61a847810c58b972985054
    environment: macOS arm64，Node 24.18.0，pnpm 12.14.0，该提交叠加本节尚未提交的服务池源码及测试，49 文件 437 项
    command: pnpm --config.verifyDepsBeforeRun=false --filter weapp-tailwindcss exec vitest run test/compiler test/tailwindcss/v4-source-preparation.test.ts test/tailwindcss/native-generation-session.test.ts test/tailwindcss/generator-close.test.ts test/tailwindcss/native-session-close.test.ts test/bundlers/generator-css.unit.test.ts test/bundlers/vite-framework-extension.integration.test.ts --update=none --maxWorkers=1
  - claim: Git 基线输入、Uni CLI 身份和双侧自然 GC 环境遵循既有统计与确认契约
    kind: unit
    status: passed
    sha: 1067d215a5a7851f549c1b9f142380084015cf37
    environment: macOS，Node 24.18.0，pnpm 12.14.0，CI=1，Git 与进程夹具
    command: pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1
  - claim: Mpx 冷构建未通过原 RSS 预算
    kind: ci
    status: failed
    sha: 8e8f8ead4c5a1b5de38c63d74e847fa3a8ce3425
    environment: Ubuntu，Node 22.23.3，三次冷构建
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40032430975/job/120685419564
  - claim: uni-app HMR 首轮和反序确认均未通过原 RSS 预算
    kind: ci
    status: failed
    sha: 8e8f8ead4c5a1b5de38c63d74e847fa3a8ce3425
    environment: Ubuntu，Node 22.23.3，同一 watcher 连续三轮修改和回滚
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40032430975/job/120685419407
  - claim: c3f5 正式 Uni HMR 同时超过耗时与内存预算，没有进入仅内存反序确认
    kind: ci
    status: failed
    sha: c3f5e0884e783efda1948c9dff4480b1d25f95cc
    environment: Ubuntu，Node 22，3 次 HMR 修改与回滚，2 个预热后 steady 样本
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40043575795/job/120721913856
  - claim: c3f5 显式自然 GC 诊断通过原预算，但实际候选数量不同，不能解释正式首败
    kind: ci
    status: passed
    sha: c3f5e0884e783efda1948c9dff4480b1d25f95cc
    environment: Ubuntu，实际 worker Node 22.23.3，build 3 / HMR 3，显式自然 GC 诊断
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40043661543
  - claim: 新输入证据和包含已回收对象的分配采样遵循固定阶段、检查名及预算隔离
    kind: unit
    status: passed
    sha: d6a77403f88f037466d72bd8889e78d133fe02d2
    environment: macOS arm64，校验官方 SHA256 的 Node 22.23.3，提交前相同代码内容，CI=1
    command: pnpm exec node node_modules/vitest/vitest.mjs run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1
  - claim: d4ee 的正式 Uni 性能 job 在原门禁下通过，历史首败与诊断限制仍保留
    kind: ci
    status: passed
    sha: d4ee686ad35f050ada02b643a3bfb5ab694d72ea
    environment: Ubuntu，正式 Benchmark 工作流，原采样与预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40051887228/job/120746755655
  - claim: dff 的 Taro Vite HMR RSS 首轮与反序确认均超过原预算，原因尚待分配证据定位
    kind: ci
    status: failed
    sha: dffce96e901fb06783219b464b27a03090af58ac
    environment: Ubuntu，Node 22，首次 build 3 / HMR 3，反序 build 0 / HMR 3，poll 30ms
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40059017762/job/120769919334
  - claim: dff 的 weapp-vite HMR RSS 首轮与反序确认均超过原预算
    kind: ci
    status: failed
    sha: dffce96e901fb06783219b464b27a03090af58ac
    environment: Ubuntu，Node 22，首次 build 3 / HMR 3，反序 build 0 / HMR 3，poll 30ms
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40059017762/job/120769919318
---

# 框架隔离后的内存证据与诊断边界

## 症状

`8e8f8ead4c5a1b5de38c63d74e847fa3a8ce3425` 的 Mpx 冷构建和 uni-app HMR 在构建成功的情况下超过原 5% / 64 MiB 内存预算。其他框架通过不抵消这两项失败，性能汇总失败也不是第三个独立根因。

| 场景 | peak RSS 增幅 | steady RSS 增幅 |
| --- | ---: | ---: |
| Mpx 三次冷构建中位数 | 15.23% / 167.47 MiB | 17.25% / 176.97 MiB |
| uni-app HMR 首轮 | 9.03% / 100.23 MiB | 8.65% / 85.39 MiB |
| uni-app HMR 反序确认 | 8.38% / 92.51 MiB | 6.83% / 67.82 MiB |

后续 `c3f5e0884e783efda1948c9dff4480b1d25f95cc` 的正式 Uni job 仍首败：HMR plugin P95 从 148 到 162 ms（+9.459% / +14 ms），peak RSS 从 873.328 到 1205.570 MiB，steady RSS 从 794.020 到 1076.982 MiB。两侧实际执行 3 次修改与回滚；报告的 `2/2` 是剔除预热后的 steady 样本数，不能解释成缩短为两轮。该轮包含耗时违规，按既有 `requiresHmrMemoryConfirmation` 规则没有触发仅内存违规的反序确认。这是未通过的首轮，不能声称其反序确认失败，也不能扩大确认范围来规避耗时失败。

## 根因与纠正

### Taro Vite 的后续首败与诊断范围

`dffce96e901fb06783219b464b27a03090af58ac` 的 Taro Vite 正式门禁在首次及反序确认均超出 5% / 64 MiB：首次 peak 为 3007.46 → 3182.82 MiB（+175.36 MiB / 5.83%），steady 为 2891.79 → 3045.64 MiB（+153.84 MiB / 5.32%）；反序 peak 为 2887.40 → 3156.41 MiB（+269.01 MiB / 9.32%），steady 为 2832.40 → 3071.27 MiB（+238.87 MiB / 8.43%）。两侧均有九个进程，差额主要位于执行 Taro 构建的 Node 进程。相同进程数不能排除堆、原生分配或保留链差异，也不能将首败归为随机噪声。

该正式 run 没有开启 GC、输入或分配诊断，现有 RSS 轨迹不能定位分配来源。本轮将已有显式诊断扩展至该确切 Taro Vite React 项目，并登记仓库 runner 作为 Node 实际入口；普通 PR、固定工作负载、限额、预算与反序规则不变。旧实现的两个确定性入口用例失败，修订后真实 worker 验证输入与分配两种模式、CLI 包身份、改写 argv、缺失 runner 和失效元数据。它们只证明诊断入口可用；同输入的 Linux 分配证据和正式预算通过仍待完成，不以工具回归代替产品性能结论。

同 run 的 weapp-vite 也首败：首次 peak 1366.88 → 1579.19 MiB（+212.30 MiB / 15.53%），steady 1352.43 → 1517.37 MiB（+164.94 MiB / 12.20%）；反序 peak 1356.54 → 1619.50 MiB（+262.96 MiB / 19.38%），steady 1347.14 → 1526.30 MiB（+179.17 MiB / 13.30%）。这提供了检查 Vite 共用路径的线索，尚不能证明两个框架具有相同根因。原始 artifact 与失败状态保留，不以其他框架或历史 head 的通过抵消。

内存根因尚未确定。Mpx 的低内存基线轮次出现额外晚期 major GC，说明 GC 时序影响样本，但没有累计分配或保留路径证据，不能据此将失败归因于环境噪声。现有反序确认只适用于 HMR，没有冷构建确认，不扩大其含义。

2026-10-23 23:50 UTC 在 macOS / Node 22.22.3 运行一对有界 uni-app 诊断。两侧各三次真实 HMR 修改和回滚，未强制 GC；源码、配置、依赖清单及锁文件哈希保持。基线和当前 peak RSS 为 1136.59 / 1136.75 MiB，steady RSS 为 1027.98 / 1020.45 MiB，没有复现 Linux 的增幅。这只是诊断，不是原环境的性能验收。

两侧均创建一个 Core、九个 generator session 和十八个 native session。六个唯一 native 来源键以及生成输入的来源哈希、长度和项目根一致。可缓存样式转换均未命中 29 次，最终缓存均为 29 条 / 8475 个节点；当前 profile 的十三次记录属于同一 owner，revision 始终为 1。计数相同不能排除单次分配量或保留链差异。日志中的 CSS 长度沿用 `string.length`，不能称为完整 UTF-8 字节或 CSS/JS 产物对照。

样式选项 fingerprint 含按进程分配的函数身份编号，跨进程 hash 不同不能证明配置语义不同。配置快照保留字符串值，只复制数据容器；候选约数百个，不能仅凭发现重复 Set / 数组就解释约百 MiB 差额。优化需先量化实际输入、累计分配和保留路径，不能恢复跨实例共享的可变 handler、AST 或 runtime。

Linux 显式自然 GC 诊断 `40043661543` 使用同一 `c3f5` head、`fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417` 基线及 Node 22.23.3，结果通过原预算：HMR peak 1150.859 → 1001.293 MiB，steady 1133.934 → 982.965 MiB，冷构建 peak 中位数 632.047 → 646.133 MiB。但冷构建两侧 source/generator 候选为 287/391 和 289/393，修改阶段为 290/400 和 292/402；差异在首次构建已存在，不能归因于修改回滚残留。此前的正式 `c3f5` 失败两侧数量则均为冷构建 287/391、HMR 290/400。

诊断两版本的完整 demo Git tree、入口原文以及配置文件相同，但没有采到完整候选名字、来源映射和运行时改写哈希，因此不能以静态 demo 相同证明实际生成输入等量。`knownCssSources` 长度多 18、remembered CSS 多 21 与两侧根路径长度差 3 有关系的可能性尚未验证。自然 GC 的 major/minor 计数为基线 4/365、当前 5/356，首次时序差异在启动阶段出现。最后一次当前 major 回调比事件延后约 506 ms，中间存在 minor GC；该回调的堆统计不能冒充同步 major 后存活堆。诊断成功不能取消原首败，也不足以归因为 GC 噪声。

### 同一编译实例内重复创建生成器的确定性证据

为区分实例隔离的必要成本和同一实例内的重复工作，在 macOS / Node 24.18.0 对准确基线 `fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417`、准确当前版本 `4801004a68644b7da5d10f5f452ee73f5deef067` 运行真实 `@import "tailwindcss";` 输入。一个 `FrameworkCompilerSession` 创建四个不同 scope，来源、配置和首次候选 `block` / `p-4` 相同；通过原生编译适配和 design system 工厂记录实际调用与对象身份。另设仅在测试内移除 `${engineIdentity}\0` 缓存前缀的受控组，产品代码和正式预算均不改动。

| 四个 scope 首次构建完成时 | 原生会话 | 原生 compile | 独占 design system 加载 | design system 对象总数 |
| --- | ---: | ---: | ---: | ---: |
| `fdc3d585` 基线 | 1 | 1 | 1 | 2 |
| `4801004` 实例隔离版本 | 4 | 4 | 4 | 5 |
| `4801004` 仅移除身份前缀的受控组 | 1 | 1 | 1 | 2 |
| 本轮实例内服务池源码 | 1 | 1 | 1 | 2 |

四组首次生成的 CSS SHA-256 均为 `a0e6b54219242a90eee6bcc1ded100f8d99ad6c5abe3591196620f77ddc181cd`。本轮源码基于 `59a086b174b5da439f61a847810c58b972985054` 加未提交修改，已包含原生释放协调修复；不能把该 SHA 单独解释为包含服务池。原始实验保存在忽略目录 `.tmp/engine-session-audit/evidence/`，按准确 SHA 和实验模式分别归档；持久回归位于上方登记的三个 `generator-service-*` 文件。

这些数据证明身份前缀阻断了同实例中等价生成请求的原生状态复用。它们没有测量 Linux RSS、累计分配或保留链，也没有证明真实 Taro / weapp-vite 各 CSS 入口的完整配置键相同，不能解释此前百 MiB 级 RSS 差额。`4801004` 的正式 Taro job 已在本补丁之前通过，不能把该通过归功于本轮优化。原有失败和整篇 `partial` 状态保持。

纠正方式是在每个 `createResolvedCompiler` 内持有独立服务池，保留引擎身份隔离。完整解析来源和除候选以外的完整生成配置参与服务键，包含 target、扫描模式、来源规则、排除项、预处理、样式、preflight 和回调身份。Set / Map 按内容规范化，数组保留顺序；相同源码但捕获值不同的闭包仍按函数对象区分。不同 Core / 构建实例继续创建不同原生服务，同一实例中样式能力不同的 scope 不复用生成器。

每个 root 只持有自己的引用计数租约、候选、输出缓存和 revision。等价租约的生成与候选验证在服务内串行，排队前复制输入；单 root 删除只释放自身引用，最后引用或 owner 关闭才排空并关闭原生服务。依赖失效将旧服务退役，新请求取得新服务，旧任务无法重新登记旧服务。生成失败或交付复制失败都清空增量游标；跨 root 返回完整 CSS，同 root 连续成功保留真正的增量路径。命中 root 输出缓存不移动服务游标，避免把其他 root 的增量错误应用到当前产物。

本轮回归覆盖两个独立 owner、一个 owner 的四个 scope、交错并发增删、缓存命中后继续增量、同源码不同闭包、样式和来源切换、三轮共同依赖失效、引用释放及清理失败。真实 Tailwind preflight / 主样式 / 局部样式产物逐字节对照独立 owner；四 scope 所有者关闭后保留原生会话为零，两个独立引擎仍各有自己的服务。旧 graph 过期结果测试分别验证同源服务排队和不同来源服务新结果先提交，未删去旧结果晚到保护。

域回归执行 `test/compiler`、四个生成器 / 原生生命周期文件及 `generator-css.unit`、`vite-framework-extension.integration`，共 49 文件 / 437 项通过，零跳过。真实 watch 保留原有 29 → 43 候选替换和文件删除断言；这只是当前 macOS 源码结果，不替代 `4801004` 的 Linux watch 首败调查。`tsc -p tsconfig.typecheck.json --noEmit`、严格 scoped ESLint（显式禁用 `format/prettier`）、`pnpm architecture:check`、`pnpm --filter weapp-tailwindcss build` 和 `pnpm agents:check` 通过；构建包含 ESM / CJS 入口与声明文件。没有执行需全端预检放行的本地全面验收，也没有更改任何性能预算、超时、缓存开关或设备门禁。

## 验证

首败及反序工件保留，uni-app ZIP 的 SHA-256 为 `72d1198021d24f3e075b8cba46973c799ccc379682e9168e19ee1d96e3794162`。本地诊断的计数、自然 GC、来源对齐、出处和清理记录保存在任务的忽略工件中；全部二十个观察到的相关进程退出，工作树干净，未操作其他任务或 IDE。

后续应固定 Linux、Node 22.23.3、准确 PR head 和上述 Git 基线，定向采集自然 GC 证据。诊断与正式放行分开：保留原 RSS 统计、预算、HMR 反序规则及失败退出；若仍无法解释差额，再对首次出现差异的阶段采集等量 allocation / retainer 证据。不能盲目重跑直到偶然通过，也不能用插桩运行取消既有首败。

`1067d215a5a7851f549c1b9f142380084015cf37` 为已有 Benchmark 工作流补充可选 `baseline_ref` 和 `gc_diagnostics` 手动输入。前者为空时保持发布版比较；非空时必须为仓库中实际存在的完整 commit SHA，通过环境变量交给既有 Git 基线比较。后者默认关闭，启用时要求 `only` 显式选择登记的 Mpx / Uni Vite 项目，并固定采样 shard 的 Node 22.23.3。Uni 的诊断只在显式手动运行中启用，普通 PR 的原有 Mpx 诊断和全部门限保持原逻辑。

GC 控制器通过登记的包名和 manifest 中的 bin 解析真实 CLI，校验包身份后复用原 preload，不把框架名或文件名当作进程身份。未知项目、错误包身份和错误 bin 有回归；workload 夹具覆盖两侧、冷构建、连续 HMR 及有无诊断的环境隔离。主树整合后的完整 benchmark 测试为十三文件 / 104 项通过，作者另有三文件 / 32 项定向验证及修改文件 ESLint 通过。这些是既有 GC 功能的回归，不覆盖后续新增输入和分配诊断。

`c3f5` 正式 Uni 工件 ID 为 `12541206958`，ZIP SHA-256 为 `9e7329a7796dc9e2875373937f94181966d8fe32ea95e3b6d5e314c5b3ca352d`；显式自然 GC 工件 ID 为 `12540727932`，ZIP SHA-256 为 `27a90096bf5cd6e33b2f18ebd31b9e2dd7ffdf4a097ed651d5725b1235600e99`，与服务端 digest 相符。前者没有 GC 工件或 reverse 工件；后者 8 个 worker 记录均有完整行和写入计数，但 GC 记录结束时的 `complete:false` 仍保留，不能说包含进程终止后的全部事件。

新诊断入口、固定范围和证据解释见 [Uni 输入与分配诊断](../../../benchmark/version-compare/scripts/diagnostics/README.md)。输入模式不加载 inspector；分配模式固定 256 KiB 采样间隔，包含已回收对象，不主动 GC。两侧只修改 benchmark 准备副本，用唯一 AST 锚点记录实际候选、来源层、源码哈希、修改和回滚。observer 使用弱引用，栈中标记自身及子调用分配；源码映射缺失时不把生成 chunk hash 当作函数身份。诊断运行的耗时和 RSS 不进入正式预算，不能触发或替代反序确认。

所有显式诊断 dispatch（包括原自然 GC 模式）的 job 名与并发组独立于正式检查，包含 skipped job；否则同一提交后发的诊断成功或 skipped check 可能遮住正式失败。新输入/分配模式的修改 marker 由轮次确定，两侧使用相同实际内容，初始来源碰撞则失败；原正式及自然 GC 规则保持原样。

新增诊断的首轮 watch fixture 暴露出夹具 owner 未保留 store：观测器只有 WeakRef，实际 GC 后如实报告空来源。夹具改为由持续编译的 owner 使用该 store，未将观测器改成强引用。固定 Node 22.23.3 的真实协议、双侧输入/分配 worker 和三轮 watch 回归随后 9 项通过；确定性 marker 修订后，完整 benchmark 回归最终为 18 文件 / 133 项通过，0 跳过。该测试执行于提交前相同代码内容之上，使用 `process.execPath` 启动实际 22.23.3 worker；输入模式确认 inspector 未加载，分配模式返回实际 profile，协议失败仍断开会话。

修改文件 ESLint（显式关闭 `format/prettier`，不使用 Prettier）、`actionlint .github/workflows/benchmark.yml` 的实际工作流/schema/表达式检查及 `git diff --check` 均通过。独立旧基线的 `pnpm agents:check` 发现一处既有复盘链接目标缺失：`webpack-request-configuration.md` 已在集成树存在，但不在诊断分支；原失败保留。整合到 `774bb90f1` 后重新执行规则结构检查，69 份规则、390 份文档、1081 个命令条目、0 错误，diff 检查通过。新 Linux 输入/分配诊断尚未执行，不能用这些夹具测试代替真实分配归因或正式性能验收。

### Linux 分配诊断首败与证据持久化

[run `40050595063`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40050595063) 准确绑定 `f65b646f7c12ce497a9783ea46a275ee8812cd23`，两侧 worker 都为 Node 22.23.3。基线与当前版本均在第一次 build 的证据保存阶段报“栈映射模块数超过诊断上限”，没有进入 watch。两份 ZIP 的 SHA-256 与 GitHub digest 相符；旧协议先做映射再写 profile 和输入，因而这轮没有完整 profile 或候选快照。只能确认映射超限，不能还原第 129 个模块、证明第三方模块占比或实际候选等量，更不能据此定位产品内存回归。

作者提交 `f7618c20ab7999815c99c3ee6c0cbea8f841dd30`、主树整合 `98b2f0c81` 收紧映射读取范围：准备副本内的仓库模块才读取源码及 source map，第三方依赖和副本外的帧保留完整原始位置并标明未映射。实际路径和符号链接再次校验，原 128 模块、32 MiB 限额不变，采样仍从 worker 启动开始。原始 profile 和输入先落盘，独立映射文件与原始 profile 双向绑定哈希；映射失败仍使诊断失败，保留已取得的首败材料。

在实际 Node 22.23.3 上，allocation-mapping、allocation-evidence、allocation-controller、allocation-watch、allocation-sampling 五文件 / 37 项通过，0 跳过，严格 scoped ESLint 与 diff 检查通过。回归覆盖超过 128 个第三方帧时不读取第三方源码、仓库映射及原上限、跨平台路径、符号链接、映射失败后的原始材料保留和映射文件篡改失败。这些夹具证明工具边界；尚未有修订协议的真实 Linux 分配归因，原正式性能首败保持未解释。

后续 `d4ee686ad35f050ada02b643a3bfb5ab694d72ea` 的正式 Uni job 在原门禁下通过。这是该提交的新结果，不能倒推旧提交失败的根因，也不能代替后续关闭与样式修订的性能验收；本轮未为取得成功而盲目重跑正式任务或放宽门限。

### Taro inputs-only 诊断的完整性与差异

[run `40063475127`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40063475127) 使用准确当前 head `4801004a68644b7da5d10f5f452ee73f5deef067` 与基线 `fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417`。这是 `mode: inputs`、`budgetAcceptance: false` 的显式诊断，未包含后续实例内生成服务池，也没有 allocation profile。该 run 的成功只表示诊断过程完成；既有 profile 限额失败、正式 RSS 首败及整篇 `partial` 状态保持。

解压工件包含八个实际 Node 22.23.3 worker：两侧各三次冷 build 和一个 watch。八份输入 `status.json` 都为 `complete: true`，没有 `recordingError`。逐份核对身份、真实 runner 入口、六个诊断模块以及 GC preload / path helper 的 SHA-256，记录文件数及累计字节数均与实际文件一致；插桩清单的两个原始源码哈希也与对应 Git 提交吻合。本次只核验解压目录的内部一致性，未取得 ZIP 与服务端 digest，不宣称已独立核验下载包摘要。GC NDJSON 最后一条记录仍为 `complete: false`，它与输入诊断完成状态不同，不能据输入完成宣称已记录进程终止后的全部 GC 事件。

两侧各有十一份输入，共二十二份、十一组配对。冷构建各三份；watch 包含初次构建、三次修改和三次回滚的七份编译完成快照，以及一份关闭前的 stop 快照。watch 的 `compilationCount: 8` 包含 stop，不能读成八次编译或生成器调用。两侧阶段、实际候选数组、逐来源候选映射、store revision 均相同：

| 观测内容 | 首次 / 回滚 | 修改时 |
| --- | ---: | ---: |
| store 合并候选 | 152 | 153 |
| `sourceCandidates` | 382 | 383 |
| `generatorRuntime` | 384 | 385 |
| `runtime` | 105 | 105 |
| `transformRuntime` | 108 | 108 |

三次修改新增的候选分别只有 `twbenchdiagnosticround1`、`twbenchdiagnosticround2`、`twbenchdiagnosticround3`，回滚后消失；`runtime` 与 `transformRuntime` 的实际成员也保持不变。这不能替代生成后 CSS 对照。watch 的 store revision 两侧均为 `56 → 59 → 62 → 65 → 68 → 71 → 74`，stop 仍为 74。两侧控制器的十条初始源码、修改写入、回滚写入及回滚观测记录逐项 SHA-256 相同，所有带期望哈希的事件均命中；三轮使用同一确定性 marker 规则。两版本 demo Git tree 同为 `44ade97339597ecacd054ab59501ac39330a0c57`。

然而每组都有六条来源 map 记录的哈希不同，涉及四个实际 CSS 来源；前两份同时出现在 `sourceById`，不是六个不同文件。其余来源 key 与哈希对齐。下表为 `cssSourceById` 中保存的运行时来源 UTF-8 字节数，不是生成后 CSS 产物大小：

| CSS 来源（相对 demo） | 基线 | 当前 |
| --- | ---: | ---: |
| `src/app.css` | 2591 | 2594 |
| `src/pages/issue-998/index.css` | 257 | 260 |
| `src/sub-independent/pages/index.css` | 209 | 212 |
| `src/sub-normal/pages/index.css` | 204 | 207 |

例如 `app.css` 来源 SHA-256 为基线 `b12dcd28e814fc04d015b5d959c3fd69b4e3f527e2e1390f0291859261a7d367`、当前 `5cd586d38f030f302dd59ef63cfc234214ac120431a1888b541475a48997d938`。每份多三个字节与准备根目录 `current` 比 `base` 多三个字符一致，但工件只保存来源哈希和长度，没有来源全文，因此不能确认差异仅由绝对路径文字造成。静态 demo 和候选相同不足以证明运行时生成输入完全一致。

此模式在 Vite 完成边界采集候选与来源快照，没有记录生成后的 `rawCss`、完整 CSS/JS 产物、逐生成请求的配置和调用次数、原生 runtime 创建数或分配路径，不能把快照数当作生成请求数，也不能声称 `rawCss` 已逐字节对照。`diagnostic-input-comparison.json` 的十一组均为 `sameActualCandidatesAndSourceHashes: false`，总判定 `canExplainFormalRegression: false` 与独立复核一致。本次补齐了实际候选及修改内容对照，仍未建立 Linux RSS 差额的因果证据；不以诊断绿灯替代正式预算、旧失败解释或完整设备验收。

### 实例内服务复用后的 Mpx 正式首败

[run `40066210730`、job `120790757674`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40066210730/job/120790757674) 对准确提交 `ab1aa7d59e6fa22e1208e15453f2217bed3cfb40` 与基线 `fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417` 执行原正式预算，包含三次冷构建和三轮 HMR。Mpx 的插件 HMR 中位耗时为 `233 → 248ms`，增加 `15ms / 6.44%`，两项回归样本、显著性判定 `p=0.05`；HMR peak RSS 为 `1866.71 → 2133.25MiB`，增加 `14.28%`，steady RSS 为 `1827.89 → 2077.75MiB`，增加 `13.67%`。`summary.json` 的 `blocking=true`、`passed=false`，三项均为实际预算违规，不是构建错误或缺少采样。

该轮同时包含耗时与 RSS 违规；既有 `requiresHmrMemoryConfirmation` 只对全部违规均为 RSS 的情形进行反向顺序确认，所以本轮没有 `memory-confirmation-*` 工件，也没有等待后续 job 自动确认。不能将三项失败写成“待反序后通过”，更不能把测试断言修正或另一提交的自然绿灯认定为性能根因修复。自然 GC 工件仅用于后续定位；实例内服务复用的创建次数与确定性产物证据仍不足以解释此 Linux RSS 差额。原预算和首败保留，未为此触发正式 benchmark 重跑。

这里的提交身份区分 PR head 与实际测试源码：工件的 `sourceCommit` 为 GitHub 测试合并提交 `0bdf6b5c2efc1361dd69553df0193bd3ecbba973`，父提交依次为上述基线和 PR head。GitHub API 与本地 Git 分别核验两者源码树均为 `801e64fe985e77beba7846f0c43e2ff8ed3e3952`，因此该轮源码与 PR head 一致，不能把合并提交的 SHA 差异认作性能输入差异。

后续准确 head `8f0d56a7b355a86fc11a9f23748ae88e8f7adb90` 自动创建的[正式 run `40067923070`、Mpx job `120795374942`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40067923070/job/120795374942) 在相同基线、三次冷构建、三轮 HMR 和原预算下通过，`blocking=true`、`passed=true`、`errors=[]`、`violations=[]`，未触发反序确认。门禁使用的 steady 插件耗时为 `401 → 377ms`，HMR peak RSS 为 `1951.32 → 1610.05MiB`，steady RSS 为 `1898.43 → 1585.04MiB`；耗时三项原样本为基线 `[398,379,401]`、当前 `[417,376,377]`，不能将全部三项中位数与剔除预热后的门禁值混用。

该次工件 `12550681085` 的测试合并提交 `87ec517c25bf2a192a9708fabdb07ddd84a7bef2` 与 head 源码树同为 `859802a8301a86ded9b11a9a4ab15ff80fdc1a12`。`ab1aa7d` 到 `8f0d56a` 只修改四个测试和两份复盘文档，产品源码、性能脚本及预算相同；因此这是新 head 的独立正式采样通过，不是性能修复证据，也不抵销此前三项实际违规。两次首轮和原始样本并列保留，未为此次失败触发正式重跑；造成两轮差异的分配及输入因素仍未确定。

### Mpx 操作诊断的身份与观测边界

为补足首败中缺少的逐请求证据，`f4a240c4bd97dd7f6cc76fa3609f422b25db2c94` 将已有输入和分配诊断扩展至 Mpx。只有显式手动诊断使用此协议；正式工作负载、三次冷构建、三轮 HMR、预算和反序条件保持原行为。插桩仅写 benchmark 准备副本，全部 AST 锚点验证成功后才写入；服务池在历史基线中整文件不存在时登记为能力缺失，损坏锚点不能降级忽略。

扫描器记录已有读取的来源全文，生成器记录实际候选、请求、生成 CSS 与 raw CSS；全文按 SHA-256 存储，不为采样额外读取源码。服务池分别观测匹配、取得和请求 key、来源快照、请求快照及结果复制。服务 entry、底层生成器、租约 facade 和 lease 使用不同身份，`service.acquire` 显式连接这些对象；相同 key 的退役前后两代服务不合并。实际生成器对象继续连接原生 pool 和 session。进程内弱身份只支持调用关联，不能证明跨 worker 的闭包或对象相等；比较只排除事件元数据顶层的身份字段，保留嵌套用户同名配置、实际全文哈希和不可比标记。

Webpack 记录每个实际 compilation 的创建和完成，额外编译及 child 编译均保留；阶段快照只选择根编译，并携带实际 compilation 身份。child 先完成不占用根快照。快照数、编译数和生成调用数分别报告，不互相替代。停止采样不替产品关闭，只被动记录随后实际发生的释放；创建减释放不足以推断泄漏，更不能证明 V8 或原生内存已经归还。缺失、损坏、配对不完整或超过固定事件、身份、文件及总字节上限都会使诊断失败。

新增受控源码执行先暴露了确定性插桩错误：无分号源码后的 `(globalThis...)` 被 ASI 解析为前一调用的继续，执行 `acquire` 报 `this.leases.set(...) is not a function`。显式分隔语句后，真实 service、scan、generator 和 native 源码在 stub 后端下通过。真实 Node worker 用例使用手工构造的 Mpx 对象及操作，验证协议和 child/root 顺序；它们没有运行真实 Mpx CLI。主树整合后在实际 Node 22.23.3 执行完整 benchmark 定向套件，24 文件、178 项通过，零跳过；修改文件严格 ESLint、actionlint 与 diff 检查通过。本节仅证明诊断工具契约，真实 Mpx 输入诊断须另按准确 head、run 和工件登记；整篇保持 `partial`，不能用这些测试解释此前 RSS 差额。

### Mpx 输入诊断的准备构建首败

[run `40073897707`、job `120815885894`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40073897707/job/120815885894) 准确绑定 `189c9e385afbfaf0744e76bbbc96c4430879e2f3`，使用原基线与显式 inputs-only 模式。首异常发生在 current 准备副本的 `pnpm build:pkgs`，UI 包的 Vite 构建经 `CompilerGeneratorServicePool.matches` 报 `Cannot read properties of undefined (reading 'operations')`。插桩副本在 Mpx worker preload 注册 observer 之前就被包准备构建消费，新增操作记录直接解引用 observer；此前受控源码测试均主动安装 observer，因而遗漏了此执行边界。

这轮没有进入实际 Mpx worker，也没有两侧三次冷构建、三轮 HMR 或逐请求输入对照，不能描述为产品构建失败、预算违规或诊断限额失败。首败保留；必须先修复无 observer 的准备执行语义并验证实际准备链路，不能只重跑远端获取成功。后续提交仅改 Rollup 测试夹具和文档，既不能补齐本轮缺失工件，也不能将该诊断视为后续 head 的直接结果。

唯一工件 `12552881428` 为 1886 字节，ZIP SHA-256 `c5146b647a424922ca1d3c9374d867e444b00ce1e8ba2a0fc331c3b9dd9dc6ef` 与 GitHub digest 一致，仅含 current 的 `instrumentation.json`；八个原始源码哈希均与该 head 相符。日志确认准备宿主为 Node 22.23.3，没有实际诊断 worker 的版本证据。工件只下载一次，未重跑该 run。

作者提交 `f75be6e477451425c3f46e87c388adb62e48d7f5` 为七类插桩统一增加惰性边界：observer 为 undefined 时执行原表达式或原函数体，详情不求值，不额外包装 Promise 或执行无效 await；注册后严格记录，注册对象损坏仍失败。每次调用动态读取 observer，支持模块先加载、随后注册及移除；正常返回 undefined 不得重复执行。原控制器的身份、哈希、阶段、完整快照与必需事件检查保持，实际 worker 缺 preload 或记录仍因缺证失败。

真实源码回归先得到无 observer 的四项确定性失败；最终新增十二项覆盖七类入口的结果、this、调用次数、原异常、Promise 身份、微任务时序、延迟注册和损坏协议。主树整合后在实际 Node 22.23.3 执行完整 benchmark 定向套件，27 文件、190 项通过、零跳过；八个修改脚本显式 ESLint `--no-ignore` 和 diff 检查通过。独立只读内存复核通过，未重复重型构建。这些仍是工具契约验证。

同一个无 .git 准备副本在 macOS / Node 24.18.0 验证实际失败消费链：先构建 UI 的十七个依赖包，旧插桩在 UI Vite 构建复现上述 operations 错误；修订后同一副本的十七个依赖包及 UI 均构建通过。脚本 [verify-preparation-build.mjs](../../../benchmark/version-compare/scripts/diagnostics/verify-preparation-build.mjs) 禁用构建前自动安装，记录命令和解析 realpath，断言主包、engine 来自副本且其 dist 包含插桩。该定向链路没有执行完整 build:pkgs、真实 Mpx worker、全面验收或设备测试；修订协议的真实输入诊断需另按准确 head 登记。

### f811 的正式性能首败与 Mpx 输入复核

[正式 run `40077357864`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40077357864) 准确绑定 head `f81163842e54c11ec7be9da2c30f44485fc3274a`；测试合并提交为 `b39a34d6c55cf9f022118be93141f9edfd2161e9`。Synthetic HMR 的 25/50/100 规模耗时中位数分别为 0.399304、0.827442、2.489835ms，拟合指数 1.3202453547994046 超出原 1.25 限额。最大规模 21 份样本中有 11 份达到该中位数，不能描述为单个离群值；序列前后也存在变化，具体 JIT、GC 或调度原因尚未证实。同内容在本地 macOS / Node 24.18.0 的一次定向诊断未复现，只能证明另一环境下结果不同，不能撤销 Linux 首败。

Taro Vite HMR peak RSS 首轮 `2933.68 → 3188.52MiB`、反序 `2959.57 → 3217.87MiB`；steady 首轮 `2763.84 → 3079.23MiB`、反序 `2899.37 → 3061.54MiB`。Uni Vite peak 首轮 `1081.94 → 1159.04MiB`、反序 `1023.09 → 1240.73MiB`；steady 首轮 `976.44 → 1045.05MiB`、反序 `1013.55 → 1123.95MiB`。原 5% / 64MiB 门限和内置反序确认均保持。Taro 四组均为相同九进程拓扑，Uni 四组为相同七进程拓扑，差额主要来自最大的 Node 进程；没有 PID 重叠或重复进程混计证据，也没有足以区分活堆、V8 保留和原生分配的材料。汇总门禁只是复述这些违规，不另算一个根因。

[Mpx inputs-only run `40077388173`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40077388173) 使用同一准确 head，全部 worker 为实际 Node 22.23.3。工件 `12553812964` 为 4196254 字节，SHA-256 `4e633805281cfc2d91c8a68f827fc4b1ce80bc258b5820ff76de5bf435f10c42` 与服务端摘要一致；首次下载超时残片保留，一次整包恢复后完成独立复核。2564 个文件、八个 worker、22 份输入、2078 条事件及 334 份全文的协议、身份、字节数和哈希均完整，插桩原文对应两侧 Git。

十一阶段候选相同，扫描来源文本哈希多重集与控制器十次写入记录相同，但逐请求并不等量：存在准备根路径、显式默认配置、请求顺序与移除旧 appType 等差异；current 第二次冷构建额外生成一次重复 web 结果（8 次对 7 次）。其余冷构建及 watch 的生成 CSS/rawCss 逐调用序列相同，该额外构建的输出哈希集合也相同。watch 后半阶段弱 store 的历史快照集合不同，不能据此称当前来源错误。冷构建的三份 current 服务与租约实际释放；watch 两侧均没有关闭尾部的 dispose 记录，既不宣称已回收，也不据此宣称泄漏。

该诊断没有 allocation，`canExplainFormalRegression=false`；不能解释正式 Taro/Uni 或此前 Mpx 的 RSS 差额。Vite 仍需实际来源全文、逐生成请求与服务代次证据，才有条件判断输入等价性；补证工具和后续 inputs-only 成功均不能替代正式预算。上述失败没有人工重跑，后续产品必要修复的新 head 应独立验收，所有历史失败保持原样。

### Vite 逐操作证据的补充

Uni/Taro 现在与 Mpx 共用生成器、原生生成会话、engine compile/build 和可选服务池的五类 AST 插桩；来源全文来自同一次 store snapshot，不追加文件读取。Vite 按真实 finalizer 完成记录固定阶段、单调身份和候选，额外完成保留，阶段快照一一关联，停止阶段不虚构完成。Webpack 继续单独校验创建、child 与根 compilation。未注册 observer 时直接执行原有表达式或函数体，不增加 await、Promise 或诊断参数求值；真实 Node 回归覆盖这些语义和晚注册、移除、损坏协议。

实际 Node 22.23.3 的完整工具域二十九文件 / 209 项通过；基线 `fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417` 与整合前源码的 Uni/Taro 二十六个目标插桩哈希匹配，基线缺失服务池登记 absent。无 `.git` 副本中，三百九十四条依赖链接有归属清单，主包与 engine 均解析至副本，Taro 准备依赖链及 UI 消费构建成功。主树 `fb3a82dd6d807357a71d6f6346afbbacbc9d7a44` 再以真实 Node 22 运行二十九文件 / 209 项通过，包含最终 store 和 Vite 完成锚点。这些只是诊断完整性与准备链路验证，准确新 head 的真实 Taro 输入采样仍须独立执行。

本次没有修改产品源码、正式 workflow、预算、采样次数或工作负载；固定事件、全文和总输出上限继续生效。诊断局部规则新增同次快照和无 observer 语义的现有约束，已有可执行回归，不新增根级安全要求。

## 适用边界

本记录仅约束上述未解决的性能失败。配置版本与 CSS 来源并发问题已有独立[修复与回归](webpack-request-configuration.md)，没有证据证明该修复解释 RSS 增幅。完整验收、环境中断和其他框架证据见[框架隔离记录](framework-isolation.md)。

## 规则评估

新增诊断目录 [AGENTS](../../../benchmark/version-compare/scripts/diagnostics/AGENTS.md)，因副本 AST 插桩属于代码生成链路，明确唯一锚点、只写准备副本、固定边界和独立 check 身份。已有“先测热点、保留首败、禁止放宽预算”的根规则保持不变。
