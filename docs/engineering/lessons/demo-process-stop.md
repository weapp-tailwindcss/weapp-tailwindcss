---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1257
baseline: 54535036b58ff7f213d390519fa66fdfc8c00183
regressions:
  - scripts/ci/demo-matrix/process-stop.test.mjs
  - scripts/ci/demo-matrix/process-diagnostic.test.mjs
---

# Demo 进程树退出与输出管道收尾

## 症状

[Ubuntu Node 22 任务 110398414216](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36869872843/job/110398414216) 在 15:48:55 验证 restore 后没有退出，16:16:56 被取消。产物包含五轮快照与 session.log，但没有 result.json 和 report.json，说明最终收尾没有完成，不能认定整个任务成功。

## 根因与纠正

运行器原先通过启动器的 exitCode/signalCode 判断是否需要升级 SIGKILL；启动器先退出、后代继续持有 stdout/stderr 时，execa 的完成 Promise 仍未解决，却不再清理后代。真实进程回归复现了永久等待。CI 未记录完整进程树，无法证明远端每个残留进程的身份。

本地还观察到 Corepack/pnpm 创建独立的后代进程组，单独给根组发信号不足以覆盖整棵树。停止前通过 POSIX ps 的 PID/PPID/PGID 记录本次拥有的组，先 SIGTERM，保留原有三秒宽限期；整个会话仍未完成时，对这些组升级 SIGKILL。共享调用方进程组不在清理集合内。Windows 保持 taskkill /T /F，不调用 POSIX ps。

重复 stop 复用同一个 Promise，避免信号回调与 finally 并行启动两次清理。定时器在会话提前结束后取消。startProcess 提供通用启动边界，start 继续统一通过 pnpm 启动 demo。

## 验证

- 新回归在修复前两项都等到六秒观察期限仍未退出；首次只修正退出状态判断仍失败，进程表证实独立后代组遗漏。两份原始失败日志均保留。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/process-stop.test.mjs scripts/ci/demo-matrix/process-diagnostic.test.mjs --update=none`：七项通过，覆盖真实 pnpm 后代拒绝 SIGTERM、启动器提前退出、幂等 stop、乱序进程树与共享组排除。
- POSIX 专属回归在 Windows 不运行，Windows 任务树行为由原有实现及 hosted CI 验证。没有放宽 demo 断言、性能预算或 CI 超时，也没有通过强制退出跳过输出和报告。
- 两份独立工作树串行执行真实 `CI=1 pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp`，production/initial/replace/add/restore 及进程退出通过，最终报告正常落盘。源码和 static 基线未修改；这次不重新生成相同基线。真实 demo 使用框架自动降级后的 classic 模式，不能代表状态保持 HMR 或设备验收。

## 适用边界

这是测试运行器的资源生命周期修复，不是产品 HMR 或性能优化。没有重新采样性能，也没有本轮全端预检、IDE 或设备验收。进程组记录适用于停止时仍可观察的后代关系；主动脱离所有已知组且已被重挂到系统进程的未知后代不通过名称或目录扫描强杀。

## 规则评估

不新增 AGENTS。沿用任务进程归属、保留原始失败和持久回归要求。
