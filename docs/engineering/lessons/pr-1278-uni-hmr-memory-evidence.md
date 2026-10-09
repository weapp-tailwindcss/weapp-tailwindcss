---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1278
baseline: 111906e205567f9f30ece82accfe66c959fe8301
regressions:
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/benchmark-report.test.ts
  - benchmark/version-compare/test/process-memory.test.mjs
---

# PR #1278 的 uni-app HMR 内存诊断缺口

## 症状

基线 head 的 Benchmark run `37917226416`、attempt 1 中，uni-app Vite job `113776451058` 构建与 HMR 耗时没有越界，但 HMR RSS 两项失败，导致汇总 job `113779365603` 失败。原有 runner 已在同一 job 内以 current → baseline 反向顺序独立确认，不能把它当作只有一次采样的失败，也不能盲目重跑直到通过。

| 指标           | 首轮 baseline → current         | 反序确认 baseline → current      |
| -------------- | ------------------------------- | -------------------------------- |
| HMR peak RSS   | 885.67 → 1096.54 MiB（+23.81%） | 1111.41 → 1225.40 MiB（+10.26%） |
| HMR steady RSS | 857.45 → 1013.41 MiB（+18.19%） | 1006.72 → 1107.97 MiB（+10.06%） |

两轮每侧的进程树均为 7 个进程，主要差异集中于 uni 编译器的 Node 进程。首轮该进程峰值约 726.64 → 943.74 MiB，反序确认约 960.52 → 1073.95 MiB。进程名称和父子关系有证据，但没有远端堆、外部内存和缓存数据，不能由 RSS 直接认定为 CSS 缓存泄漏或主机波动。

## 根因与纠正

当前确认的缺口是诊断覆盖：工作流仅在 MPX 分片开启已有 `WEAPP_TW_HMR_MEMORY_DEBUG`，uni-app 的 artifact 因而只有进程 RSS。基线／当前都随重建增长，且第一次反序确认仍失败，需要 Linux 原环境中的内部明细来区分 JS 堆分配、外部内存与缓存保留。

本次仅在[Benchmark 工作流](../../../.github/workflows/benchmark.yml)为已有 uni-app 分片启用同一诊断开关。两侧使用相同开关；[现有 Vite 采样](../../../packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/memory-debug.ts)将 RSS、heapTotal、heapUsed、external、arrayBuffers、runtime 与 CSS 缓存规模写入 generateBundle timing，现有 benchmark runner 会保存在 raw artifact 的 `hmrPluginTimings[].details.memoryDebug` 中。

没有修改产品生成逻辑、GC、阈值、3 次 build／3 次 HMR、设备矩阵或失败断言，没有重跑旧失败 job。本次补齐取证能力，内存退化的根因仍待确认。

## 验证

精确 CI 基线为 `3f6bcda589f58b12529c0c69678bcb911584967e`，实测 merge 为 `fefee92c3837d335b2c5558f74161a75da142596`，已通过 GitHub commit tree 与本地 head tree 核对完全一致。首次远端完整日志 517217 字节、run／job JSON、artifact `11610056707` 均保留在忽略目录 `e2e/.artifacts/issue-1271-production-watch/cicd/111906e20-benchmark-*`。

本地在独立 current／base 消费项目中按原门禁运行：

```sh
CI=1 WEAPP_TW_HMR_MEMORY_DEBUG=0 pnpm exec node benchmark/version-compare/scripts/run-ci.mjs --guard --baseline-ref 3f6bcda589f58b12529c0c69678bcb911584967e --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin
```

实际命令另外传入任务专属 `--work-root` 和忽略证据目录的 `--result-dir`，完整 argv／耗时／退出码见 `commands.jsonl`。本地 Node 24.18.0／macOS Darwin 27.0.0 arm64，远端为 Node 22.23.3／Ubuntu 24.04.5，环境并不相同。本地原门禁 exit 0，101475ms：peak 1432.17 → 1444.02 MiB（+0.83%），steady 1384.08 → 1391.04 MiB（+0.50%），plugin build 中位数 961 → 934ms，plugin HMR 中位数 106 → 103ms。该对照没有复现 Linux RSS 退化，不能撤销远端失败。

随后复用两侧消费目录，以 `WEAPP_TW_HMR_MEMORY_DEBUG=1` 运行反序的 0 build／3 HMR 定向诊断，exit 0；该诊断不计作原性能门禁复测。三轮 timing 均成功保存内部明细：两侧候选数 290、CSS 处理结果数 9、remembered 来源数 10，process cache 数量均为 31／34／37；CSS 字符串缓存合计不足 1 MiB。两侧堆使用都明显增长，current 为 416／679／892 MiB，base 为 345／599／826 MiB，首尾增长分别 476／481 MiB。小规模缓存计数不能解释整进程的堆分配，也不足以排除其他保留，暂不制造产品修复。

上述两条运行均恢复探针源码并关闭所属进程，已按原提交逐字节核对两侧源码恢复、确认无所属进程后删除临时消费目录。工作流契约 45 项、benchmark 报告与内存确认 31 项、版本对照采样与报告五文件 20 项按原断言通过；本次不修改 static 基线、发布 intent 或 AGENTS 规则。

## 适用边界

partial 表示已确认 Linux 内存失败和诊断缺口，尚未定位内存增长的具体分配／保留来源。远端原始失败和反序确认均保留；后续通过同样不能自动证明根因已经修复。新 head 必须独立验收，不能复用上一 head 的质量分片通过结论。

本轮未启动本地全面测试、IDE、设备或浏览器，未改变微信登录态。Docker 仅做只读运行时／现有镜像检查，未创建容器或拉取镜像。临时消费目录仅属于本任务，收尾核对后清理。

## 规则评估

不新增 AGENTS 规则。已有“重复性能失败应定位热点、不能放宽门槛”的要求继续适用；通过现有、两侧对称的内部采样补证据，避免将未证实的 RSS 差异直接归因于缓存或环境。
