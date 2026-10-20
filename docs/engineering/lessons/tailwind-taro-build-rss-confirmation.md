---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1311
baseline: d78d1f81d392751dc11549da554cc79be02fc1ab
regressions:
  - benchmark/version-compare/test/process-memory.test.mjs
  - benchmark/version-compare/test/pr-report.test.mjs
  - packages/weapp-tailwindcss/test/ci/benchmark-report.test.ts
verification:
  - claim: Taro Vite 首轮构建峰值 RSS 超过原门槛，三次当前样本均发生回归
    kind: ci
    status: failed
    sha: d78d1f81d392751dc11549da554cc79be02fc1ab
    environment: Ubuntu 24.04 / Node 22.23.3，PR 合并态 eb7393a4ed25d65e0045a7493a5ba86ead642a04
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39248652542/job/118047065134
  - claim: 同一 head 的唯一精准复测按原阈值完成三次构建及三次 HMR，第二组样本未复现越界
    kind: ci
    status: passed
    sha: d78d1f81d392751dc11549da554cc79be02fc1ab
    environment: Ubuntu 24.04 / Node 22.23.3，PR 合并态 eb7393a4ed25d65e0045a7493a5ba86ead642a04
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39248652542/job/118057510431
---

# Tailwind 能力验收中的 Taro 构建 RSS 复测边界

## 症状

[PR #1311](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1311) 的 Benchmark run `39248652542`、attempt 1 在 Taro Vite React 的 `mp-weixin` 分片失败。PR head 是 `d78d1f81d392751dc11549da554cc79be02fc1ab`，实际合并态是 `eb7393a4ed25d65e0045a7493a5ba86ead642a04`，比较基线是 `da240e7778aa3d88d29bf94da4b3fad573d988ca`。

首轮唯一 violation 为 `buildPeakRssMb`：中位数 1612.62890625 → 1726.23046875 MiB，增加 113.6015625 MiB（+7.0444949895%）。当前三次样本均满足回归判定（3/3，要求至少 2 次），中位数回归检验 p 值为 0.05。该结果超过原有 5% 和 64 MiB 门槛，作为真实门禁失败保留；构建和 HMR 本身均正常结束，没有 OOM 或构建异常。

首轮聚合 job `118055550655` 仅传播上述分片失败，未发现第二个独立失败。不能用节点可见、产物存在或另一分片通过来撤销 RSS 失败。

## 根因与纠正

尚未确定首轮 RSS 差异的具体分配或保留来源，没有提交生产性能补丁，也没有调整阈值、采样口径、样本数量或断言。

[内存采样器](../../../benchmark/version-compare/scripts/process-memory.mjs)从每次独立 `pnpm run build` 的根 PID 遍历 PPID 后代，对整棵进程树的 RSS 求和；每 250ms 采样，peak 取最大值，steady 取最后 20% 采样的中位数。首轮每次构建包含 124–129 个采样点，两侧峰值均有 12 个进程；最大 Node 进程约占峰值的 86%，其增长主导总增量。`comm=node` 只能识别进程，无法定位 JavaScript 分配栈。该分片没有 GC 事件或强制 GC 证据，不能据此声称没有发生 GC。

初次矩阵按 baseline 三次构建、baseline 三次 HMR、current 三次构建、current 三次 HMR 顺序执行，并非交错或反序。必须区分 runner 内置 HMR 反序确认和本次完整 job 复测：[确认条件](../../../benchmark/version-compare/scripts/ci-report.mjs)只接受全部 violation 为 `hmrPeakRssMb` / `hmrSteadyRssMb` 的情况；本轮只有 `buildPeakRssMb`，未触发内置反序确认。首轮日志和工件也没有 `memoryConfirmation` 或反序确认输出。

## 验证

### 本地产物与热路径调查

独立调查树起点为 `c620aad4187ecfd1dc0fb95bb6013c5cfba39c9f`，对照目标为上述 `d78d1f8`；已核对两者的 Taro demo 和本次调查的三处热路径源码没有差异。调查环境为 macOS / arm64 / Node 24.18.0。各组仅构建一次，未运行 HMR，调用现有 `runCase`，设置 `buildRuns: 1`、`hmrRuns: 0`、`WEAPP_TW_SKIP_AUTO_BUILD=1`。

| 本地组别 | 构建 ms | 插件 ms | 峰值 MiB | 稳态 MiB |
| --- | ---: | ---: | ---: | ---: |
| current | 17869.49 | 2806 | 2086.20 | 1761.38 |
| baseline-hot-path | 12026.18 | 2462 | 1901.47 | 1853.26 |
| current-source-only | 11940.99 | 2468 | 1938.08 | 1881.79 |
| current-hot | 12030.12 | 2513 | 1879.45 | 1830.13 |

`baseline-hot-path` 只回退 `packages/engine/src/v4/source.ts`、`packages/postcss/src/plugins/preset-env.ts`、`packages/postcss/src/compat/color-mix/parse.ts`，其余代码仍在当前树，不能称为完整 baseline checkout。组名用于标识隔离实验，不代表四组都是完整提交的性能对照；首次 current 还受冷缓存影响。这些单次实验不能充当 Linux / Node 22 的 CI 门禁或统计归因。

四组产物均为 30 文件、753459 字节。已独立重读每个归档文件，逐文件核对大小和 SHA-256，四组完全一致；按文件名排序后的 manifest 摘要均为 `c47f598434e182aeed5038dc64ff248c426a02ea3d1468c70141f9838ebbeb4e`。WXSS 共 441367 字节、2416 条规则、9064 条声明、1303 个唯一类名。原始 CI 两侧源码 transform 均为 979 次；Taro demo 源码、配置及锁文件中的 Taro importer 和依赖没有变化，未发现产物或模块规模膨胀证据。

一次独立调用诊断中，模块请求解析为 33 次、199923 字符；place visitor 检查 22371 次、命中 0 次；颜色归一化 29 次、`preserveAlpha` 命中 0 次，原生 CSS 编译未执行。计数来自忽略目录内的 dist / preload 诊断，没有进入性能门禁。逐次正则分配是待证假设，现有量级和样本不足以归因约 100 MiB 的峰值变化。实验干预已恢复，没有据此制造生产补丁。

### 同一 head 的唯一完整精准复测

保留首轮全部证据后，仅授权一次原参数复测：

```sh
gh run rerun 39248652542 --job 118047065134
```

首次命令在 gh 读取 job 的 GET 阶段遇到 EOF，退出 1；确认 run 仍为 attempt 1 / completed 后恢复同一次调度成功。实际只产生一次复测，attempt 2 的目标 job 为 `118057510431`，head、合并态、比较基线均未改变。两侧仍各为 3 次 build / 3 次 HMR，timeout 为 180000ms、poll interval 为 30ms。门禁仍为 blocking，5%、64 MiB、至少 2 个回归样本和 p≤0.05 的阈值完全一致。

| 尝试 | baseline 三次构建 peak RSS（MiB） | current 三次构建 peak RSS（MiB） | 中位数变化 |
| --- | --- | --- | --- |
| 1，失败 | 1612.629 / 1685.512 / 1604.316 | 1769.844 / 1726.230 / 1705.137 | +7.044% |
| 2，通过 | 1732.082 / 1750.785 / 1692.773 | 1738.371 / 1687.566 / 1747.328 | +0.363% |

复测的中位数为 1732.08203125 → 1738.37109375 MiB。相对首轮，baseline 中位数增加 119.453125 MiB（+7.407%），current 增加 12.140625 MiB（+0.703%）。第二组样本没有复现超限，但不能据此将首轮自动归类为噪声，也不能声称根因已经修复。GitHub 随精准 job 复测自动执行的聚合 job `118060053111` 通过，没有另行调度整个 run 或聚合 job。

### 原始证据身份

两份同名 `benchmark-performance-demo-taro-vite-react-tailwindcss-v4` 工件必须按 artifact ID 区分，不能仅凭名称选取：

| 尝试 | 原始 job | 工件与 ZIP SHA-256 |
| --- | --- | --- |
| 1 | [118047065134](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39248652542/job/118047065134) | [artifact 12184774029](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39248652542/artifacts/12184774029)，`3a49bd5efc1210f0886c62ec1414e3721a664ab535bae2268c2da7726bcf84d0` |
| 2 | [118057510431](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39248652542/job/118057510431) | [artifact 12185349275](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39248652542/artifacts/12185349275)，`5cccf82ea7edddfb2b6de55db7785acaca8a67c4c4d654053052f1140fd6bd74` |

两份 ZIP 的独立 SHA-256 均与 GitHub API digest 一致，分别保留 `matrix-raw.json`、`summary.json`、`versions.json`、`report.md`。首轮完整 job 日志为 529778 字节，复测为 506855 字节，run / job 元数据、两次聚合日志和逐项比较记录一并归档。任务内归档根为 `e2e/.artifacts/ci-audit/d78d1f81d/`，首轮位于 `failures/`，复测位于 `benchmark-attempt2/`；预算写入 `benchmark-single-rerun-budget.json`，跨尝试比较写入 `benchmark-independent-comparison.json`。本地四组的原始产物和 manifest 留在调查树的 `.tmp/perf-investigation/`。

## 适用边界

本记录为 partial：首轮失败真实保留，第二组未复现，生产根因仍未定位。唯一实际复测预算已使用，不能继续循环重跑到通过，也不把复测成功转换为“性能缺陷已修复”。后续若出现重复失败，应保留新样本，针对首次偏离补充分配 / 保留证据，再修改负责模块。

本记录只覆盖指定 head 的 Taro 构建与 HMR 性能门禁。未执行本地全面多端验收，不证明 RN、Lynx、浏览器或小程序实际效果全部通过；新 head 需重新绑定准确提交。没有生产行为、样式产物或 demo 源码改动，因此本次记录不更新 static 基线和发布 intent。既有采样与报告回归入口列在 frontmatter，文档结构由 `pnpm agents:check` 检查。

## 规则评估

不新增 AGENTS 规则。沿用已有的首次失败留存、同 SHA 有限复测、禁止放宽门槛、未定位根因不制造补丁和新 head 独立验收的边界。
