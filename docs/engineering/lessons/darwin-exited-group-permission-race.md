---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 64837e981e9569b8746a8b732ee7558a8f19df9d
regressions:
  - packages/hbuilderx-runner/test/process-termination-race.test.ts
  - packages/hbuilderx-runner/test/process-lifecycle.test.ts
  - website/scripts/local-worker/command.test.ts
verification:
  - claim: 本轮完整流程保留了原 CLI 退出与组信号 EPERM 的嵌套错误
    kind: integration
    status: failed
    sha: 64837e981e9569b8746a8b732ee7558a8f19df9d
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1，扩展预检和原生 Chrome 证据通过，干净提交
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <06854afb-9159-4a3a-bfea-15b068a25b04 本轮报告>
  - claim: 新增六场景回归在原实现中正例失败，其余五项拒绝边界通过
    kind: unit
    status: passed
    sha: 64837e981e9569b8746a8b732ee7558a8f19df9d
    environment: macOS arm64，原生产实现加未提交回归，CI=1、禁止更新快照；使用模拟进程和固定计时器
    command: pnpm exec vitest run packages/hbuilderx-runner/test/process-termination-race.test.ts --update=none
  - claim: 修复后的进程状态回归与网站真实 CLI 四文件共 35 项通过
    kind: integration
    status: passed
    sha: 64837e981e9569b8746a8b732ee7558a8f19df9d
    environment: macOS arm64，含本次未提交修复，Node 24.18.0、pnpm 12.9.1，CI=1、禁止更新快照
    command: pnpm exec vitest run packages/hbuilderx-runner/test/process-termination-race.test.ts packages/hbuilderx-runner/test/process-lifecycle.test.ts website/scripts/local-worker/command.test.ts website/scripts/local-worker/process-lifecycle.test.ts --update=none
  - claim: 包内回归、双模块构建与类型检查通过
    kind: unit
    status: passed
    sha: 64837e981e9569b8746a8b732ee7558a8f19df9d
    environment: macOS arm64，含本次未提交修复，7 文件与 93 项通过，1 文件与 2 项既定条件跳过
    command: pnpm --filter @weapp-tailwindcss/hbuilderx-runner test --update=none && pnpm --filter @weapp-tailwindcss/hbuilderx-runner build && pnpm --filter @weapp-tailwindcss/hbuilderx-runner typecheck
  - claim: 提交修复后重新预检并执行本机完整扩展矩阵
    kind: integration
    status: pending
    sha: 64837e981e9569b8746a8b732ee7558a8f19df9d
    environment: macOS arm64，本地扩展全端矩阵，待提交本次修复
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <新一轮报告>
    reason: 定向验证不能替代同一干净提交的 57 阶段完整验收
---

# macOS 已退出进程组的权限竞态

## 症状

完整流程 `06854afb-9159-4a3a-bfea-15b068a25b04` 在全仓构建通过后，于第 2 阶段停止。单测为 906 文件、9714 项通过，1 文件、1 项失败，另有 5 文件、44 项跳过及 1 项预期失败。真实外层退出码为 1，第 3 至 57 阶段未调度。

网站首错停止夹具的 CLI 实际返回 `exit=1 signal=null`。新增的完整异常上下文揭示：根进程 `exit` 回调立即调用清理器，向已登记独立组发送 SIGTERM 时得到 `kill EPERM`；栈位于 `signalOwnedTree`、`stopProcessTree` 和 `runOwnedCommand.onExit`。原始日志、内存与预检快照保留在 `e2e/.artifacts/full-validation-recovery/canonical-06854afb-9159-4a3a-bfea-15b068a25b04/`。

## 根因与纠正

底层清理器已经允许观察探针在 macOS 回收期间暂时返回 EPERM，并继续在原预算内等待明确组消失。然而，发信号的同类错误立即进入永久错误集合；即使后续确认根 close 和组消失，历史信号错误仍使清理失败。这两条路径对已退出组的状态解释不一致。

修复仅将四个条件同时成立的信号错误保留为待确认状态：macOS、实际登记的独立组、根在发信号前已经退出、错误为 EPERM。成功仍由原来的观察循环证明根 close 与 `kill(-PGID, 0)` 返回 ESRCH，清理预算和 TERM/KILL 升级不变。确认失败时，原始 EPERM 与其他错误一起抛出；活根、其他平台和其他错误继续走永久失败路径。组消失后永久撤销句柄，不重新领取数字 PGID。

真实首错证明的是信号 EPERM 及其错误传播路径。50 次独立短命进程探针均未复现 EPERM：25 次 inherit、25 次 pipe，TERM 都返回 ESRCH，随后确认 close；收到 ESRCH 后不再探测可能复用的组。不能把该探针说成操作系统竞态的稳定复现，也不能把本轮结论追溯为旧 `bf248624` 聚合错误的精确原因。

## 验证

新回归在原实现中得到 1 失败、5 通过。修复后的六场景分别检查短暂 EPERM、活根权限失败、Linux 权限失败、其他 errno、仅 close 和仅组消失。正例先观察 EPERM，再观察 ESRCH，独立延迟 close，并要求两个时点都不能提前结束；失败保留原错，所有路径验证 stop 幂等和计时器释放。

四文件定向回归 35 项通过；其中真实 CLI 内部有意失败的用例只执行一次，其余五项不调度，外层回归通过。包内回归为 93 项通过、2 项既定条件跳过，ESM/CJS 构建及类型检查通过。两组存在重叠，不累加。独立代码审查未发现阻断问题。

本轮失败后的已登记 canonical 进程组为空，预检端口已关闭，Chrome 临时探针标签已关闭，两个用户原有标签保留。未启动或重启微信 IDE，未操作登录态。

## 适用边界

本次修复公开 HBuilderX runner 的清理状态判断，提供中文 patch change intent；公共接口兼容。没有修改 demo、样式输出、复现页或视觉阈值，无需更新对应 static 基线。完整网站和多端验收仍须在新提交重新执行；Windows/Linux 为模拟分支覆盖，不代表其他操作系统原机通过。

## 规则评估

不新增 AGENTS。现有归属、固定预算、首次错误和回归要求足够，本次在负责清理的模块补齐状态合同与持久回归。
