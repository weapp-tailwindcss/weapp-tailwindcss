---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38117853346
baseline: 4581346f478e40c8952a059e9f434891e3ab957b
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-memory-sampler.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-probe-kill.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-web-cleanup.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-runner-cleanup.unit.test.ts
---

# Watch 内存探针的异步采集与收尾边界

## 症状

Windows Watch 内存脚本把进程 ID 写入大小写不敏感的 PowerShell 只读变量 `$PID`。采集错误又被作为空样本丢弃，报告只剩零值。每秒同步启动无截止时间的 PowerShell 查询还会阻塞 HMR 与取消处理。

## 根因与纠正

遍历变量改为 `$processId`，CIM 只请求进程 ID、父 ID、working set 和 command 四字段，脚本明确失败退出并输出 UTF-8 无 BOM。进程树采集独立到私有工具的 memory 模块；原无截止的同步查询改为 Windows 5 秒、POSIX 1 秒的异步绝对截止，不改变业务 HMR 或插件处理门槛。

每个 Watch/Web 会话使用异步单飞采样，上轮完成后再等待 1 秒开始下一轮。停止会话先停止调度并取消活动探针，只通过本轮创建的 ChildProcess 句柄终止，并在独立 1 秒截止内确认 close。发送 kill、查询失败或遥测内容不能成为归属与退出证据；未确认 close 或 kill 失败属于不可忽略的收尾错误。输出有大小限制，流错误被接收，绝对截止在 close 与解析后的接收边界再次检查。

有效样本继续用于原 RSS 指标。空样本的 summary 与项目聚合报告明确 `availability: unavailable`，日志保存失败原因，后续仍可重试。用户配置 RSS 或 RSS delta 预算却没有有效样本时，预算验证拒绝，不能用零值通过。

Web 收尾复用已有逐项清理器，依次恢复本轮模板与 CSS、关闭本轮浏览器、停止 Watch 与采样器；一项失败继续执行其他项，并聚合原 HMR 错误。成功文案只在收尾通过后输出。

2026-10-26 在 [PR #1316](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316) 的独立诊断中确认另一条错误通道：Node 的 `ChildProcess.kill()` 遇到 EPERM 时同步发出 `error` 并返回 false。原实现仅将直接抛出的 kill 错误分类为 `MemoryProbeCleanupError`；事件通道会覆盖原超时或取消错误，并被采样器当作普通丢样继续采集。直接抛错的通道也会丢失触发终止的首错。

两条 kill 失败通道现在统一记录为收尾错误，错误链保留原超时或取消原因及 kill 错误对象。采样器锁存同一终态错误，不再调度后续采样，停止时继续报告该错误。单独返回 false 不能证明 kill 失败：进程已退出时也可能如此，因此仍以实际 `close` 和原触发错误判定。采样与 close 的原始截止时间、重试规则及性能预算均未放宽。

同轮启动失败与取消竞态还暴露了另一条实际边界：缺失命令的 spawn 已返回没有有效 PID 的句柄，异步 ENOENT 尚未投递，此时立即调用 `kill('SIGKILL')`。本机 Node 24.18.0 的独立进程会话复现中，该会话被 SIGKILL 结束（exit -9），连 kill 返回记录都未到达。终止现在只向拥有正数 PID 的本次子进程句柄发信号，无 PID 的失败启动继续等待原 close 截止。同步 kill 错误或明确 `syscall=kill` 才归类为终止失败；晚到的 spawn 错误不能仅因已有取消原因而被误判为清理失败。真实回归放在独立进程组内，防止旧行为影响 Vitest 运行器。

## 验证

- 定向 memory、Web cleanup 与 runner cleanup 回归通过，覆盖单飞、迟到输出、取消等待、流异常、kill/close 失败、真实 Node 探针回收、实际宿主内存采集、明确不可用状态与预算拒绝。
- 原 Watch、Web Iconify 与候选来源回归共 150 项通过；Windows 脚本实际执行用例在本机 macOS 不执行，由 Windows CI 验证。该用例独立验证固定数据遍历；真实 CIM 测量先用独立 15 秒基础设施准备，再验证原 5 秒生产采样预算。
- 新 memory 模块通过独立 strict TypeScript 检查。私有 scripts 全量 TypeScript 检查仍受既有跨包与 mutation 类型错误阻断，不把它记录为通过。
- 当前源码 CLI 的真实 Taro React Web Watch 约 12.1 秒通过，采集 8 个有效进程树样本，项目报告 `availability: available`，RSS peak 为 738 MB。源码摘要恢复，headless Chromium 与任务子进程均已回收。
- 逐项 Web 收尾补充后的真实验证约 11.3 秒通过，采集 7 个有效样本，RSS peak 为 739 MB，源码和任务资源全部回收。合入主工作树后，Web Iconify、实际候选、快照来源、Watch、memory sampler 与 Web cleanup 的 6 文件定向复验为 177 项通过、1 项 Windows 专属协议未执行；修改模块严格 ESLint 和规则检查通过。
- 2026-10-26，macOS、Node 24.18.0、Vitest 5.0.4，`f00fe6858e1f3280f27fab37117d8b9af14afd46` 加本轮未提交改动：新回归在原实现有 3 项预期失败。修复后执行 `CI=1 pnpm --config.verifyDepsBeforeRun=false --filter weapp-tailwindcss exec vitest run test/watch-hmr-memory-probe-kill.unit.test.ts test/watch-hmr-memory-sampler.unit.test.ts test/watch-hmr-memory-source.unit.test.ts test/watch-hmr-web-cleanup.unit.test.ts --update=none`，4 文件 50 项通过、1 项既有 Windows 专属跳过；严格 ESLint、规则和 diff 检查通过。纯内存 fixture 使用原 1000ms/1000ms 截止，确认原事件通道会丢失 deadline 并再次采样；它没有启动真实探针。额外独立进程会话分别保留了无有效 PID 仍 kill 的 SIGKILL 首败，以及不发信号后 ENOENT/close 正常完成的对照。

## 适用边界

普通 HMR 未配置内存预算时，遥测不可用可以明确记录，不能替代 HMR 断言。探针清理失败始终传播为失败。采样仅查询内存，不能扩展进程清理范围；微信 IDE 登录态、用户浏览器和现有任务资源归属均不改变。

本轮真实 weapp-vite 诊断的内存探针错误链只有 deadline，没有 EPERM；此次修复不能解释其实际 `ps` 超时或更早的 App 截图就绪超时。后续真实采证仍需记录原探针的 PID、spawn/exit/close、流状态、kill 返回值与截止时状态，不用定向单测代替完整本地验收。

另一个真实临时进程 fixture 已确认外层 Watch 会话存在独立缺口：pnpm 根退出后 `stop()` 在约 1ms 内成功返回，已登记后代的 heartbeat 仍继续递增。fixture 后代已核对唯一 token、PID、出生时间和命令后定向清理，并确认退出。该外层会话的归属跟踪与后代退出确认尚未修复，不能把此次探针错误分类修复当作 Watch 进程树清理已完整，也没有证据证明这就是此前真实遗留进程的具体路径。

## 规则评估

该修复遵循现有取消、精确归属及逐项收尾边界，不新增全局规则。Windows 冷 CIM 与实际脚本协议仍需准确 head 的 Windows CI 证据，因此复盘保持 partial，不能以 macOS 回归推断 Windows 实际通过。
