---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1253
baseline: 4d41c8fe412bfc4bc82d6053e8cf6581c287a07b
regressions:
  - benchmark/performance/test/runner.test.mjs
  - benchmark/performance/test/report.test.mjs
---

# 合成性能门禁的场景隔离

## 症状

PR #1253 首轮 [Benchmark](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36513427848) 在 PostCSS 缓存命中场景失败：2,000 条规则的 P95 为 1.038 ms，预算为 1 ms。同一提交有界重试后，该场景为 0.759 ms，转而在 HMR 复杂度指数 1.315（上限 1.25）失败。未继续重跑直到成功。

三个 HMR 规模各只有 3 个样本，100 次更新的耗时范围为 1.285–2.247 ms。此时进程 RSS 已累积至约 1.6 GB。这些场景没有调用本 PR 调整的最终样式警告链路；不能仅凭一次成功或失败判断产品性能是否退化。

## 根因与纠正

测量器把所有场景放在同一进程，前序场景的内存和缓存会进入后序 RSS，JIT 状态和垃圾回收压力也不能按场景隔离。单纯将采样增加至 21 次后，本地 HMR 通过，但 PostCSS 出现 RSS 与 P95 超限，因此增加样本本身不足以修复测量边界。

现在每个场景通过 Node 子进程独立执行。场景内保持原来的 fresh / cache-hit 生命周期、预热排除、计时边界和输出哈希检查；不在样本之间强制 GC，不删除慢样本。子进程启动不计入被测操作耗时，失败会使命令失败，不返回残缺样本。报告记录进程 ID 和隔离方式，明确 RSS 不再累积前序场景。

CI 固定 5 次预热、21 次采样，同时运行测量器回归。复杂度阈值、逐场景耗时与内存预算、已知债务规则均未改动。显式候选场景的 context 推迟到 create 阶段创建，枚举和筛选场景不初始化无关上下文。

## 验证

- `CI=1 pnpm --filter benchmark-performance test --update=none`：7 文件、25 项通过。覆盖独立进程、输出一致性、采样数、fresh 语义、预热排除和子进程失败传播。
- `pnpm perf:synthetic:guard -- --suite postcss,hmr --runs 21 --warmups 5 --out-dir <临时报告目录>`：15 个场景通过，无预算违规。
- 随后执行相同采样参数的完整合成基准：全部场景输出哈希稳定、复杂度和内存预算通过；5,000 条规则缓存命中 P95 为 3.758 ms，超过 3 ms，门禁整体仍失败。没有重复运行以取得绿色结果，保留该本地失败并继续验证 Ubuntu 门禁。
- 修改的 benchmark JavaScript 使用 `eslint --no-ignore --rule 'format/prettier: off'` 检查通过；benchmark 默认被 ESLint 忽略，不能把默认忽略当作检查通过。

本地环境为 macOS arm64、Apple M4 Max、Node 24.18.0。远端门禁运行于 Ubuntu x64、Node 22；本地通过不能替代远端结果。首次失败、有界重试、共享进程增加采样失败以及隔离后的报告均保留，CI 原始报告位于上述 run 的 artifact。

## 适用边界

该修复测量独立场景的操作成本，不承担跨场景长时间 watch 的内存泄漏检测。已有 watch lifecycle 与真实项目 build/HMR 门禁继续负责对应边界。不同 CPU 的绝对耗时仍有差异；独立进程和固定采样数不保证任何硬件都通过相同预算。

## 规则评估

不新增 AGENTS 规则。沿用已有保留失败证据、有界复测、不放宽门禁、使用持久回归的要求。
