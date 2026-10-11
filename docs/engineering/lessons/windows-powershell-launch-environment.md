---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: afd51b8e4872e9fbe1c8acc3146ccda0a17efb99
regressions:
  - e2e/demo-workflow-powershell-bootstrap.test.ts
  - e2e/demo-workflow-observer-lifecycle.test.ts
  - e2e/demo-workflow-windows-observer.test.ts
---

# Windows PowerShell 子进程模块路径边界

## 症状

准确基线提交的 [Coverage Windows shard 3](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137426741/job/114464110049) 在首个完整身份准备查询时耗尽 15 秒，业务未启动，stdin 写入 2ms 后没有首次就绪标记。基线首次标记调用 `ConvertTo-Json`，不能用它区分进程启动与首次 JSON 模块加载。这次定位同时发现采集器启动环境没有隔离 PowerShell 版本边界。

## 根因与纠正

Actions 的 PowerShell 7 shell 启动 Node 后，Node 启动 Windows PowerShell 5.1 采集器，原实现继承整份父环境。这样会把 PowerShell 7 的 `PSModulePath` 带给 Windows PowerShell，而采集器仅使用 Windows 原生 Utility/CIM 模块。

微软 [about_PSModulePath](https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_PSModulePath?view=powershell-7.5#starting-windows-powershell-from-powershell-7) 明确描述：PowerShell 7 只在直接启动 Windows PowerShell 时修正路径；经 Node、Python 或 cmd 等中介进程时，继承路径可能让同名 `Microsoft.PowerShell.Utility` 解析到不兼容的 PowerShell 7 版本。官方中介方案是在子环境中删除 `PSModulePath`，让 Windows PowerShell 按原生规则重建模块路径。

[NativeCommandProcessor](https://github.com/PowerShell/PowerShell/blob/v7.5.3/src/System.Management.Automation/engine/NativeCommandProcessor.cs#L552-L561) 的分支仅对 `powershell.exe` / `powershell_ise.exe` 调用 [GetWindowsPowerShellModulePath](https://github.com/PowerShell/PowerShell/blob/v7.5.3/src/System.Management.Automation/engine/Modules/ModuleIntrinsics.cs#L1307-L1341)。后者现场计算兼容路径，并未导出 `WinPSModulePath` 环境变量；不能把该名称当成中介进程必然可用的环境协议。

共享采集器 transport 只在 Windows 平台、命令 basename 精确等于 `powershell` 或 `powershell.exe` 时复制父环境，删除所有大小写形式的 `PSModulePath` 键。使用 `node:path.win32.basename` 覆盖盘符、UNC、根路径、相对路径及正反斜杠。父 Node 环境、用户配置、其它环境变量、`pwsh`、自定义非 PowerShell 命令和 POSIX 行为保持原边界。

首个 `observer-ready` 在 UTF-8 配置后由静态 ASCII JSON 拼接 PID 与实际 PowerShell 版本输出，不调用 JSON cmdlet。诊断只记录模块路径策略、继承字段是否存在与运行时版本，不输出完整环境或模块路径。非法版本拒绝，版本字段仍允许既有非 PowerShell 测试夹具省略。

同一轮失败后的多段迟到输出曾重复调用本体 `kill`。transport 现在只记录首次 fatal，拥有一次终止尝试；kill 抛错与缺少 `close` 证据的回收失败按同一聚合错误传播给请求与 `close`。正常 EOF 关闭期间真实流/退出错误仍使关闭失败。

## 验证

确定性环境夹具启动真实 Node 子进程，要求 Windows PowerShell 目标传入的 spawn 环境没有污染字段。旧 transport 触发夹具的 `CommandNotFoundException` 并失败，新实现通过。该夹具验证环境传递边界，既没有运行真实 Windows PowerShell，也没有复现 hosted 15 秒延迟。

macOS 定向命令：

```sh
CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-powershell-bootstrap.test.ts e2e/demo-workflow-observer-lifecycle.test.ts e2e/demo-workflow-observer-diagnostics.test.ts e2e/demo-workflow-process-observer.test.ts e2e/demo-workflow-observer-memory.test.ts e2e/demo-workflow-cooperative-budget.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-windows-observer.test.ts --update=none --maxWorkers=1
```

结果 91 项通过、2 项既有 Windows 专属用例跳过。新增覆盖环境真实传递、Windows/UNC/相对路径与 POSIX 边界、重复大小写键、非法版本、一次终止、首错与 kill/reap 聚合、正常关闭期间流错误。真实 Windows 用例已加入 `5.1` 运行时版本与原生模块路径策略断言，等待下一准确提交的 hosted 验收。

## 适用边界

保留完整身份枚举和完整内存准备查询，共用原有单一 15 秒截止；运行采集与清理预算不变。没有重试、进程重建、旧样本复用、查询降级或新增跳过。

首次静态标记未到达仍不能区分 OS/PowerShell 启动、整段 EncodedCommand 解析与 stdout 传输。该环境缺陷有官方边界依据及旧新夹具对照，但尚未证明它是本轮 hosted 15 秒延迟的唯一原因；记录保持 `partial`，以新提交实际 Windows 阶段证据继续验证。

## 规则评估

不新增 AGENTS。修正位于内部 Windows PowerShell 子进程启动边界，沿用跨平台路径、进程所有权、原截止与真实平台证据规则。
