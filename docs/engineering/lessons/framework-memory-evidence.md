---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - benchmark/version-compare/test/dispatch-inputs.test.mjs
  - benchmark/version-compare/test/gc-diagnostics.test.mjs
  - benchmark/version-compare/test/gc-workload-isolation.test.mjs
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
---

# 框架隔离后的内存证据与诊断边界

## 症状

`8e8f8ead4c5a1b5de38c63d74e847fa3a8ce3425` 的 Mpx 冷构建和 uni-app HMR 在构建成功的情况下超过原 5% / 64 MiB 内存预算。其他框架通过不抵消这两项失败，性能汇总失败也不是第三个独立根因。

| 场景 | peak RSS 增幅 | steady RSS 增幅 |
| --- | ---: | ---: |
| Mpx 三次冷构建中位数 | 15.23% / 167.47 MiB | 17.25% / 176.97 MiB |
| uni-app HMR 首轮 | 9.03% / 100.23 MiB | 8.65% / 85.39 MiB |
| uni-app HMR 反序确认 | 8.38% / 92.51 MiB | 6.83% / 67.82 MiB |

## 根因与纠正

内存根因尚未确定。Mpx 的低内存基线轮次出现额外晚期 major GC，说明 GC 时序影响样本，但没有累计分配或保留路径证据，不能据此将失败归因于环境噪声。现有反序确认只适用于 HMR，没有冷构建确认，不扩大其含义。

2026-10-23 23:50 UTC 在 macOS / Node 22.22.3 运行一对有界 uni-app 诊断。两侧各三次真实 HMR 修改和回滚，未强制 GC；源码、配置、依赖清单及锁文件哈希保持。基线和当前 peak RSS 为 1136.59 / 1136.75 MiB，steady RSS 为 1027.98 / 1020.45 MiB，没有复现 Linux 的增幅。这只是诊断，不是原环境的性能验收。

两侧均创建一个 Core、九个 generator session 和十八个 native session。六个唯一 native 来源键以及生成输入的来源哈希、长度和项目根一致。可缓存样式转换均未命中 29 次，最终缓存均为 29 条 / 8475 个节点；当前 profile 的十三次记录属于同一 owner，revision 始终为 1。计数相同不能排除单次分配量或保留链差异。日志中的 CSS 长度沿用 `string.length`，不能称为完整 UTF-8 字节或 CSS/JS 产物对照。

样式选项 fingerprint 含按进程分配的函数身份编号，跨进程 hash 不同不能证明配置语义不同。配置快照保留字符串值，只复制数据容器；候选约数百个，不能仅凭发现重复 Set / 数组就解释约百 MiB 差额。优化需先量化实际输入、累计分配和保留路径，不能恢复跨实例共享的可变 handler、AST 或 runtime。

## 验证

首败及反序工件保留，uni-app ZIP 的 SHA-256 为 `72d1198021d24f3e075b8cba46973c799ccc379682e9168e19ee1d96e3794162`。本地诊断的计数、自然 GC、来源对齐、出处和清理记录保存在任务的忽略工件中；全部二十个观察到的相关进程退出，工作树干净，未操作其他任务或 IDE。

后续应固定 Linux、Node 22.23.3、准确 PR head 和上述 Git 基线，定向采集自然 GC 证据。诊断与正式放行分开：保留原 RSS 统计、预算、HMR 反序规则及失败退出；若仍无法解释差额，再对首次出现差异的阶段采集等量 allocation / retainer 证据。不能盲目重跑直到偶然通过，也不能用插桩运行取消既有首败。

`1067d215a5a7851f549c1b9f142380084015cf37` 为已有 Benchmark 工作流补充可选 `baseline_ref` 和 `gc_diagnostics` 手动输入。前者为空时保持发布版比较；非空时必须为仓库中实际存在的完整 commit SHA，通过环境变量交给既有 Git 基线比较。后者默认关闭，启用时要求 `only` 显式选择登记的 Mpx / Uni Vite 项目，并固定采样 shard 的 Node 22.23.3。Uni 的诊断只在显式手动运行中启用，普通 PR 的原有 Mpx 诊断和全部门限保持原逻辑。

GC 控制器通过登记的包名和 manifest 中的 bin 解析真实 CLI，校验包身份后复用原 preload，不把框架名或文件名当作进程身份。未知项目、错误包身份和错误 bin 有回归；workload 夹具覆盖两侧、冷构建、连续 HMR 及有无诊断的环境隔离。主树整合后的完整 benchmark 测试为十三文件 / 104 项通过，作者另有三文件 / 32 项定向验证及修改文件 ESLint 通过。正式 Linux 诊断尚未执行，不能将夹具测试记为真实性能样本。

## 适用边界

本记录仅约束上述未解决的性能失败。配置版本与 CSS 来源并发问题已有独立[修复与回归](webpack-request-configuration.md)，没有证据证明该修复解释 RSS 增幅。完整验收、环境中断和其他框架证据见[框架隔离记录](framework-isolation.md)。

## 规则评估

不新增 AGENTS 规则。已有“先测热点、保留首败、禁止放宽预算”的规则足够，使用明确的诊断输入、双侧身份校验和持久回归落实。
