---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: 70ff7cc0c0adba5ab22aa65d8429c80e086fdad2
regressions:
  - e2e/demo-workflow-observer-diagnostics.test.ts
  - e2e/demo-workflow-process-observer.test.ts
  - e2e/demo-workflow-observer-memory.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
  - e2e/demo-workflow-windows-observer.test.ts
---

# Windows 采集器准备阶段的可定位证据

## 症状

[Coverage Nightly run 38135058109](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38135058109)、attempt 1 的 Windows shard 3，实际 checkout 为准确提交 `70ff7cc0c0adba5ab22aa65d8429c80e086fdad2`。独立后代合作恢复用例在业务启动前失败：

```text
业务尚未启动：身份采集器准备失败。
Caused by: 身份采集器请求超时：powershell pid=6420 id=1 timeoutMs=14994。
```

该分片共 368 项通过、10 项跳过、1 项失败。首次 identity 请求耗尽原有 15 秒准备截止；业务子进程还没有启动。稍后的两个真实 PowerShell 用例通过，文件耗时约 1.9 秒。这些事实不能证明首次失败位于 PowerShell 启动、stdin 输入、CIM 初始化、全表查询或 JSON 序列化中的哪一层，也不能凭后续成功认定环境噪声或 latency 已修复。

## 根因与纠正

已确认的工程缺口是采集器原来只有完整响应，没有阶段证据。一次首次请求超时会同时覆盖进程启动、命令初始化、输入读取、provider 查询和结果传输，无法选择有依据的下一步。

受管 PowerShell 现在发送并 flush 独立的 `observer-ready`、`request-received`、`query-completed`、`response-ready` 诊断行。它们分别标记编码及脚本初始化完成、输入已解析、真实查询及行转换完成、完整响应 JSON 已生成。父进程记录 stdin 写入及完整响应接收时间，最多保留最近四个请求的阶段；超时错误包含已观察的阶段和耗时，真实 Windows 用例在业务启动前打印准备快照。

诊断行不返回身份或内存结果，也不重置请求计时。启动行必须属于本体 PID；请求进度必须属于在途请求、操作类型一致且按顺序推进。迟到、未知、重复或乱序进度使会话失效；同一响应块后面的坏行仍由 `assertHealthy` 阻断业务。

本轮保留完整 identity census 和真实 memory warmup，共用原有单一 15 秒绝对截止。身份仍须由同一 parser 验证采集器本体出生身份，warmup 数据仍丢弃，不领业务归属或计入内存报告。运行查询的 5 秒和清理的 2 秒预算保持原值，没有重启、重试、缓存旧结果或新增 skip。

准备身份结果最终只用于核对采集器本体 PID，但当前全表查询也覆盖了后续运行所需的真实 provider 路径。在首次延迟层级尚未明确时，不先把它替换成较轻的目标查询，避免把首次 census 成本挪入运行和清理预算。

## 验证

macOS 定向命令：

```sh
CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-observer-diagnostics.test.ts e2e/demo-workflow-process-observer.test.ts e2e/demo-workflow-observer-memory.test.ts e2e/demo-workflow-cooperative-budget.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-windows-observer.test.ts --update=none --maxWorkers=1
```

结果为 62 项通过、2 项既有 Windows 专属用例跳过。新增 12 项覆盖进度不能落定结果或续借预算、启动未知状态、错误 PID/请求/操作/阶段、启动及请求进度迟到、合法握手后坏尾行、四请求存储上限和快照隔离。既有取消、独立后代恢复、完整准备与清理预算回归继续通过；两项 Windows 真实查询待下一准确 head 验收。

后续确认借下一准确 head 原本需要执行的 Coverage Windows 分片，保存实际 checkout、全部原始日志和准备阶段快照。先观察阶段证据，再决定是否需要改变查询边界；不盲目重跑旧失败，不重复启动额外整矩阵。若再次超时，阶段前沿可以区分尚未收到初始化行、输入已读取但查询未完成、查询完成但 JSON 未生成，以及 JSON 已生成但完整响应尚未接收。

## 适用边界

本轮修复可观测性缺口，尚未证明首次 hosted latency 的具体原因或修复。macOS fake timer 与真实 Node 进程证明传输、预算和清理边界，不能替代真实 Windows PowerShell 验收。首行未收到只能证明脚本初始化行未到达，不能进一步区分 OS 启动、脚本初始化和 stdout 传输；诊断阶段是接收时间，不能当成 provider 内部 CPU 时间。

## 规则评估

不新增 AGENTS 规则。沿用根因证据、原有预算和进程所有权边界，把本次定位缺口落到有界诊断与持久回归；真实 Windows 结果明确后再更新本记录状态。
