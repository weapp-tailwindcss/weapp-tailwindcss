---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
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
verification:
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

## 适用边界

本记录仅约束上述未解决的性能失败。配置版本与 CSS 来源并发问题已有独立[修复与回归](webpack-request-configuration.md)，没有证据证明该修复解释 RSS 增幅。完整验收、环境中断和其他框架证据见[框架隔离记录](framework-isolation.md)。

## 规则评估

新增诊断目录 [AGENTS](../../../benchmark/version-compare/scripts/diagnostics/AGENTS.md)，因副本 AST 插桩属于代码生成链路，明确唯一锚点、只写准备副本、固定边界和独立 check 身份。已有“先测热点、保留首败、禁止放宽预算”的根规则保持不变。
