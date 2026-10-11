---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: afd51b8e4872e9fbe1c8acc3146ccda0a17efb99
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-memory-source.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-sampler.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-web-cleanup.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-runner.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-style-only.unit.test.ts
---

## 症状

准确 `afd51b8` 的 CI run `38137428240` 中，Windows / Node 24 compatibility job `114464514673` 的冻结安装真实 pnpm hook fixture 已通过，但随后真实 Watch 内存 smoke 报 `memory probe exceeded 5000ms deadline`。同一 job 的独立 Windows 进程树遍历 fixture 通过。失败不等于冻结安装回归，也不能据此认定 CIM 查询本身停滞。

## 根因与纠正

原 smoke 在独立 PowerShell 中预热，然后销毁它；真正受 5 秒运行预算约束的采样启动另一个 PowerShell。生产 Mini/Web 也每轮启动新进程。预热没有准备被验收的真实采集器，这是确定的生命周期缺口。Windows source 现在用同一受管 PowerShell PID 执行一次真实 Watch memory 函数准备和后续查询，准备使用单一 15 秒绝对截止，运行查询保持 5 秒，POSIX 单次 `ps` 保持 1 秒，held-child 退出确认仍为 1 秒。

Windows 首条诊断使用 .NET 输出静态 JSON、本体 PID 和 PowerShell 版本，放在 JSON cmdlet 前；request、query、response 阶段仅供定位，不续借截止。具体第一次 5 秒失败在哪个阶段、模块加载或 CIM 是否是唯一耗时原因仍未证明。另一个 WorkflowObserver 的准备失败属于独立 source，不与本例混为同一归因。

单次 fixture 和持久 source 复用原 Watch 采集函数：仍查询 ProcessId、ParentProcessId、WorkingSetSize、CommandLine，保留根树、cwd 中原 Watch 命令范围和 Taro 任意平台 pattern，RSS 聚合、top 8 与命令截断不变。准备样本丢弃。业务 spawn 前完成准备；准备失败不启动业务，spawn 或取消失败关闭本次 source。Mini、IDE、模板、demo 报告等全仓调用点和类型均迁移异步会话，Mini/Web 的业务 ready 和 RSS 起点位于真实 spawn，case 总耗时继续保留原端到端语义。

持久 provider 超时、坏协议或无效数据会终止 sampler 并使最终 stop 失败，不能重建会话或靠历史样本通过。主动停止只抑制精确匹配的取消原因，且仍确认 held-child close；超时后发生的取消、kill 失败与退出未确认必须保留。

## 验证

定向 Vitest 覆盖真实 Node provider 连续返回实际 RSS 的同一 PID、冷准备与运行预算分离、阶段进度不续借截止、合法响应后坏尾行、已有样本后 fatal、stop 与 timeout 的竞态、退出未确认，以及 Mini/Web 启动失败的 owned-source 收尾。真实 Node 协议证明进程生命周期和协议，不能替代真实 Windows CIM 证据。现有 Windows smoke 改为准备并测量同一真实 source，再关闭它；单次 Windows 遍历 fixture 继续独立覆盖真实脚本。

本地命令与结果：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run --update=none test/watch-hmr-memory-source.unit.test.ts test/watch-hmr-memory-sampler.unit.test.ts test/watch-hmr-runner.unit.test.ts test/watch-hmr-runner-cleanup.unit.test.ts test/watch-hmr-style-only.unit.test.ts test/watch-hmr-web-cleanup.unit.test.ts`：56 通过，1 个既有 Windows 专用遍历 fixture 在 macOS 条件跳过；真实 Node 持久协议与 POSIX 实测均执行。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts --update=none e2e/watch-command-lifecycle.test.ts e2e/framework-ide-watch-lifecycle.test.ts e2e/wechat-session-boundary.test.ts`：18 通过，IDE 路由为 mock，不触碰用户 IDE。
- `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false`：准确 `afd51b8` 与当前工作树均为 212 条历史诊断；按文件、错误码和全文、去行号比较诊断多重集，新增与删除均为 0。没有宣称工具全量类型检查通过。

此记录保持 `partial`，待当前最终提交的 Windows Node 22/24 hosted 实测完成后才能确认平台验收。原始失败证据见 [CI run](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137428240/job/114464514673)。

## 适用边界

source 是采样资源拥有者，不用于业务进程身份或清理归属。POSIX 的单次探针普通不可用仍按原策略后续采样，held-child 清理失败必须终止。单次真实 Windows fixture 也应用与持久 source 相同的 Windows PowerShell 子进程模块路径策略，父环境、POSIX 与自定义探针保持原合同。Windows 持久 source 的任意失败都是会话失败，预算、被测进程范围和原内存门槛均未放宽。没有执行本地全面 E2E、IDE 或浏览器交互；本次定向验证不需要全端环境预检。

## 规则评估

不新增 AGENTS 规则。持久回归直接约束真实 source 的边界，现有工程流程已经要求区分观测事实、设计缺口和待证平台原因。
