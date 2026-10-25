---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 8014f05dd2f1cfe151cd08775cfd270ac55f69ec
regressions:
  - packages/weapp-tailwindcss/test/ci/actions-failure-diagnostics.test.ts
  - packages/weapp-tailwindcss/test/ci/ci-memory-guard.test.ts
  - packages/weapp-tailwindcss/test/ci/ci-memory-sampling.test.ts
  - packages/weapp-tailwindcss/test/ci/ci-memory-windows-command.test.ts
verification:
  - claim: 失败后报告、峰值快照及既有内存统计的定向回归通过
    kind: unit
    status: passed
    sha: 535294e2f0536f566180e19e3ddbaca5bb52bb5b
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0
    command: pnpm --config.verifyDepsBeforeRun=false exec vitest run packages/weapp-tailwindcss/test/ci/actions-failure-diagnostics.test.ts packages/weapp-tailwindcss/test/ci/ci-memory-guard.test.ts packages/weapp-tailwindcss/test/ci/ci-memory-sampling.test.ts packages/weapp-tailwindcss/test/ci/ci-memory-windows-command.test.ts packages/weapp-tailwindcss/test/ci/benchmark-report.test.ts packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts packages/weapp-tailwindcss/test/watch-hmr-memory-sampler.unit.test.ts --update=none --maxWorkers=2
  - claim: Linux 单测分片保留全部旧文件并首轮通过，峰值快照定位到两个并行 Node worker
    kind: ci
    status: passed
    sha: 0dc860f353988267a7b1f20984b9e379bb0a47c4
    environment: Ubuntu 26.04.1、Node 22.23.3、runner image 20261012.163.1
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40223216548/job/121261456690
---

# 单测 RSS 门禁失败后的证据留存

## 症状

PR #1316 的同一提交在 PR Gate 单测分片 1 连续两次通过 3,988 项断言，但退出后的 RSS 增量分别为 4,679 MB 和 4,674 MB，超过 4,608 MB 预算。两次都保留原有的 1 文件 / 14 测试跳过。

两轮为 run `40214106067` 的 attempt 1 / 2，失败 job 分别为 `121233950050` 和 `121253009510`；实际 checkout 均为 merge `59dcbc6a20da52ac9bd9b1d1e70f621cef85e7c7`，与上述 baseline 的源码树一致。Node 22.23.3、Ubuntu 26.04.1、runner image `20261012.163.1`、分片、2 个 worker、采样间隔和预算均未改变。唯一一次同参数复测仍越界，随后停止重跑。

日志明确显示 JSON/Markdown 报告已经写出，但原 quality job 在单测后没有上传或汇总步骤。原始日志与完整 artifact 清单都不能还原峰值时刻及进程归属。

## 根因与纠正

已确认的缺陷是失败证据丢失；RSS 越界的产品或测试资源根因仍未定位。不能把新增测试、GC、宿主环境或配置缓存预先判为原因。

- quality job 在失败后仍汇总并上传原始报告，artifact 名区分分片、PR head、run 和 attempt；保持单测原退出状态。
- guard 在判定预算前输出有界摘要，并只保存最新同值峰值的一份 Top20 进程快照。记录 PID、PPID、启动时间和可执行文件，不采集进程参数；每轮历史仍仅保存原有聚合采样。
- POSIX 在一次 `ps` 查询中增加元数据，前三列 RSS 和父子关系独立解析。元数据异常退化为 unknown，不能丢弃有效数值行或断开后代树。
- Windows 将通过安全整数校验的根 PID 直接绑定到 PowerShell 脚本，循环变量使用 `processId`，保留原 CIM 遍历与 RSS 汇总。真实 Windows 执行仍待 CI 验证。
- 原预算、1 秒采样周期、全进程树 RSS、启动样本选择、相对门禁和子命令失败优先级均保持。

## 验证

新增回归先在原实现下观察失败，再验证修复；独立工作树 20 项定向测试及严格 lint 通过。集成到主工作树后，7 个相关文件共 181 项通过、1 项既有跳过，严格 lint 通过。上述 verification 记录的是诊断代码提交；本文随后新增，不把文档视为已包含在该提交中。

macOS 的真实 CLI 预算失败用例确认：子命令成功时，guard 仍按原预算退出 1，并在退出前保留 JSON、Markdown 和 stdout 摘要。Windows 当前验证了命令构造、PID 边界和回包解析，不能替代真实 PowerShell 验证。

后续 head `0dc860f353988267a7b1f20984b9e379bb0a47c4` 的 Linux 分片 1 首轮通过 3,992 项断言，保留 1 文件 / 14 测试跳过。实际 checkout 为 merge `becb825064fd0814b14e1ae98e21e5a6db589a57`，与 head 源码树一致。分片保留此前两轮全部 370 个文件，只新增 guard 回归文件；Vite 多版本 HMR 和 PostCSS 仍在同一分片。

本轮 baseline 272 MB、峰值 4,652 MB、delta 4,380 MB，距离原增量预算仅 228 MB。峰值时间为 `2026-10-25T19:09:54.938Z`，快照完整记录 8 个进程、无省略；两个兄弟 Node worker 分别为 2,629 MB 和 1,551 MB，合计占树 RSS 的 89.85%。可执行文件和父子关系不能把某个 worker 直接映射到某个测试文件。

按文件完成日志减 Vitest 文件耗时推算，HMR 窗口为 `19:09:10.426–19:15:06.980`，PostCSS 为 `19:09:10.582–19:10:00.250`，峰值位于两者交集。HMR 中五个版本串行执行，按各用例耗时进一步推算，峰值也位于 Vite 4 阶段。该模型不包含 import、setup、worker 启动或日志缓冲的精确边界，只支持并发资源叠加的调查方向，不能证明产品泄漏。

PostCSS 完成前后的相邻采样从 4,624 MB 降至 2,133 MB，但进程数仍为 8；由于只保存峰值时逐 PID 快照，不能将下降归因于某个 PID 退出或 GC。报告的最大单进程 RSS、最大进程数分别来自其他时刻，不能混入树峰值解释；steady 是末尾有效样本中位数，也不是退出后的常驻内存。

本次首轮通过不能解释此前两次越界，不能宣称诊断改动降低了 RSS。真实构建矩阵适合按集成测试职责独立调度；若迁移，必须保留原五个 Vite 用例、全部单测文件、预算与必需门禁，并实际核对三分片和集成文件的并集、互斥及恰好执行一次。

为集成诊断，旧 head 的本地完整流程在第 14/23 阶段正常取消；取消前已完成阶段仍仅计为该 head 的部分验证。测试源码恢复、登记进程退出和预检服务结束另行复核，不能把该次取消写成完整验收通过。后续完整验收需重新预检。

## 适用边界

RSS delta 是单次进程树峰值减首个有效启动样本，既不是相对上一提交的增长，也不是 JS 存活堆。预算超限不能单独证明泄漏。

Top20 快照用于关联峰值与进程关系，不是保留图。若仍超限，应先结合峰值时间和测试日志定位持有资源的进程，再检查其关闭与并发边界；不得通过删除有效回归、排除子进程、主动 GC 或放宽预算获得通过。

诊断改进尚不证明 RSS 越界已修复；正式 CI、真实 Windows 和新的完整本地流程需按最终 head 分别记录。

## 规则评估

不新增 AGENTS 规则。现有有限复测和证据要求已足够，本次通过工作流及可执行回归保证失败证据持续保留。
