---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1286
baseline: 15e3932c95cea6487408278ea4bb2fe4fb0bf246
regressions:
  - e2e/demo-workflow-observer-shutdown.test.ts
  - e2e/demo-workflow-observer-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-source.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-sampler.unit.test.ts
---

# Windows 采集器 EOF 与宿主退出边界

## 症状

[源码 CI 38348895460](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38348895460) attempt 1、作者 head `15e3932c95cea6487408278ea4bb2fe4fb0bf246` 的 Windows Node 24 job `115136978695`，核心 12 文件共 386 项中 385 项通过，真实内存 smoke 的 `source.close()` 报 PowerShell 本体 pid 4700 退出未确认。

该异常来自无待定请求的正常 EOF 分支：`stdin.end()` 后首次 1 秒等待超时，保存首错，随后 SIGKILL 并确认实际 close，仍抛原超时。它不能被归为未确认强制回收或已证进程泄漏；现有日志没有 EOF、exit 和 close 的独立阶段，也不能断言 CIM 死锁或宿主内部具体阻塞。原 smoke 的 finally 收尾还可能覆盖此前数值断言异常，本次将两类失败聚合保留。

## 根因与纠正

两份自建 PowerShell provider 的请求循环之前仅在 EOF 后隐式返回宿主。正常停止的边界应明确结束本次自建宿主，而不依赖默认宿主的后续收尾。共享停止片段在 EOF 请求循环之外输出精确本体 PID 的 `observer-stopped`，flush 后调用 `[Environment]::Exit(0)`。它仅退出当前采集宿主，不终止业务进程、后代树或用户应用。

停止消息只在已开始正常关闭、无待定请求和启动等待、收到过本体 ready、PID 精确且首次出现时接受。关闭请求、停止诊断、实际 exit 与实际 close 独立记录；`stdin-end-requested` 是调用 end 的时刻，不是流 finish 确认。停止消息和 exit 都不能完成回收 Promise、续借截止或替代 close。

保留首次 1 秒 EOF 退出确认、失败后的本体 SIGKILL 与第二次原 1 秒回收确认。首次超时即使随后强制回收成功仍失败；查询超时、取消、坏协议、重复/错误停止消息、尾行损坏、流错误、非零退出和退出未确认继续保留首错。没有重试、额外等待、扩大时限或新增跳过。

## 验证

真实 Node 控制宿主保留后台句柄：只读完 EOF 并输出停止诊断仍在原 1 秒失败且最终本体被回收；明确退出自身时同一进程连续完成查询，并以 0/null 的实际 close 成功。它证明进程协议与生命周期边界，不能替代真实 Windows PowerShell/CIM 证据。

回归还覆盖 999 毫秒收到停止诊断及 exit 不能延长期限，强制回收后首错保持，异常停止消息、坏尾行和流错误，以及 timeout/abort 在确认或未确认 close 时的错误链。两份实际默认 PowerShell 脚本均检查共享 EOF 停止片段；原采样范围、RSS 聚合、数值门槛和准备/运行期限未改变。

本地定向命令使用 `CI=1`、`--update=none`、`--coverage.enabled=false`，包含 6 个 observer 文件与 2 个 memory 文件。原 Windows 专用遍历 fixture 在 macOS 按既有条件跳过；实际 POSIX 内存采样和真实自建 Node provider 均执行。准确最终 head 的 Windows Node 22/24 实测与版本全面验收仍待完成，记录保持 partial。未执行本地全面设备测试，也未创建浏览器、IDE、设备或服务资源。

## 适用边界

沿用私有验收工具与受管进程所有权规则，无公开包行为、demo 或样式基线变化，无需新 change intent，也不新增 AGENTS。

## 规则评估

本修复只改变私有观测宿主的 EOF 收尾，不改变业务进程、平台产物、公开包行为或发布元数据。
