---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38117853346
baseline: 4581346f478e40c8952a059e9f434891e3ab957b
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-process-controller.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-windows-stop.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-session-cleanup.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-session-process.integration.test.ts
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

- 后续 Watch 后代收尾纠正：macOS、Node 24.18.0，本地定向 9 文件 194 项通过、1 项既有 Windows 专属跳过；共享 workflow 的身份、单飞、短命令、退出与截止回归 5 文件 34 项通过。新增停止模块和共享 tracker 的严格 TypeScript、全部修改代码/fixture 的严格 ESLint、规则与 diff 检查通过。真实 PNPM 的根仍活、根先退出、根先退出且采样终态错误三种情况都在兜底前确认登记身份为空；终态采样错误按原对象拒绝，不被当作会话成功。此结果不替代完整本地 23 阶段，也不证明实际 Windows/CIM 行为或历史 App/ps/RSS 根因。
- Windows 停止调度纠正：`c0010d1648c05eeb75a7de1d1e699d108891482c` 加本轮改动，主包 10 文件 203 passed / 1 既有 Windows skip，共享 workflow 5 文件 34 passed，合计 237 passed / 1 skip；新增九项合成边界回归。新增测试格式调整后另跑该文件九项通过，严格类型、`--no-ignore --max-warnings=0` ESLint、规则及 diff 检查通过。真实父子 fixture 三例均未用兜底且确认登记身份消失；此次仍为 macOS 与 Windows 合成回归，准确新提交的 Windows 实测和完整本地验收待执行，不把缩减外部命令数说成所有冷查询都能按时完成。
- 根退出事件门控：`6869ec0bc9e8474c1c8f61aa48750454171111ff` 加本轮未提交改动，保留固定 40ms 健康查询仅得到 35ms 执行窗而失败的原始回归。新增 POSIX/Windows INT 宽限、POSIX TERM/KILL 升级与 Web TERM 宽限五个场景；主包上述同一十文件命令为 208 passed / 1 既有 Windows skip，共享 workflow 五文件 34 passed，合计 242 passed / 1 skip。严格类型、ESLint、规则和 diff 检查通过，三个真实隔离 PNPM 父子 fixture 均在兜底前确认登记身份退出且未用兜底。仅在 macOS 执行，未完成新源码的 Windows 实测或完整本地验收，不把 31 个正常内存子进程生命周期与这组单测结果混为同一次成功运行。

- 非最终阶段调度：`a79a8b8b44f13a711eb61063517dfc82051f6758` 加本轮未提交改动，主包同一十文件命令为 213 passed / 1 既有 Windows skip，共享 workflow 五文件 34 passed，合计 247 passed / 1 skip。修前 Windows 文件三项新断言失败，其中健康 Web 查询确实被取消，另两项记录新的完成时点和升级路径；原件保留。新增五项回归同时验证真超时、最终阶段严格边界、根已关闭后代在宽限内退出、阶段间 PID 复用与根 close 必须发生。三个真实隔离 PNPM 父子 fixture 均未使用兜底，生产断言后登记身份为空，另行核对十二个 PID 均不存在；停止约 3004–3011ms。严格类型、ESLint、规则及 diff 检查通过。执行宿主仍为 macOS，准确新提交的 Windows 实测与完整本地验收尚待完成。

## 适用边界

普通 HMR 未配置内存预算时，遥测不可用可以明确记录，不能替代 HMR 断言。探针清理失败始终传播为失败。采样仅查询内存，不能扩展进程清理范围；微信 IDE 登录态、用户浏览器和现有任务资源归属均不改变。

本轮真实 weapp-vite 诊断的内存探针错误链只有 deadline，没有 EPERM；此次修复不能解释其实际 `ps` 超时或更早的 App 截图就绪超时。后续真实采证仍需记录原探针的 PID、spawn/exit/close、流状态、kill 返回值与截止时状态，不用定向单测代替完整本地验收。

另一个真实临时进程 fixture 已确认外层 Watch 会话存在独立缺口：pnpm 根退出后 `stop()` 在约 1ms 内成功返回，fixture 独立确认身份的后代 heartbeat 仍继续递增。fixture 后代已核对唯一 token、PID、出生时间和命令后定向清理，并确认退出。旧会话没有生产身份登记，不能把 fixture 的外部身份核对说成旧实现已登记。该缺口在基线同样存在，没有证据证明它就是此前真实遗留进程的具体路径。

后续纠正复用 workflow 的出生身份登记算法，并将登记与停止策略分离。Watch 在启动与首次编译完成后各登记一次；首次编译 checkpoint 排在启动采集完成之后，避免单飞复用旧快照。停止前再核对，根 close 后仍保留已登记、已经重新挂接父进程的同出生身份。测试驱动只读取生产 snapshot，不替生产补做 capture。RSS 样本、工作目录、命令名称和无匹配身份锚的 PGID 均不用于认领；从未登记、已脱离父子链和原进程组的 double-fork 仍不在确认范围。

正常 Watch 保留 SIGINT 3000ms、SIGTERM 2500ms、SIGKILL 2500ms，共 8000ms 的绝对截止。Web 原先 TERM 等待 3000ms 后发 KILL，随即毁管道且不确认退出；现在保持 3000ms 总窗，在其中分配 TERM1500ms 与 KILL1500ms，为最终出生身份复核和退出确认预留后半段。此处缩短 TERM 机会而未延长总预算，不能称 Web 各阶段行为完全未变。

身份查询与逐 PID 复核共享该次停止的固定截止，执行预算为剩余时间减原有 1000ms 探针回收期；在飞采集被收紧时提前取消，取消后的结果和迟到结果不能回写或触发终止。查询关闭未确认后不再调度新探针。根 close 加最新可信空集合才可成功；最终耗尽时只向本次仍有正 PID 的活 ChildProcess 句柄补最后 SIGKILL，不再扫描、等待或扩大范围，仍报告未确认。

`c0010d1648c05eeb75a7de1d1e699d108891482c` 的 [Windows 启动首败](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40334635202/job/121616326317) 又暴露了停止调度成本：每个登记 PID 分别冷启动 PowerShell 查询，再启动单 PID `taskkill /f`。日志确认其中 PID 852 的身份查询被阶段截止取消，最终根 close 已到达，但最后登记的八个 PID 尚未确认退出。这不是八个进程仍存活的证据；中途 wrapper 的 exit 1 位于停止区间，也不能另判为产品启动失败。

Windows 现在直接使用停止采集刚返回并匹配登记出生身份的批量结果，在同一同步续体内逐 PID 发信号，不在信号之间等待或再启动 PowerShell/taskkill。Node 在 Windows 对 SIGINT/TERM/KILL 均执行单进程强制终止，与原单 PID `/f` 保持范围一致；没有 `/t` 或按名称终止。停止前已有的编译采集先在原截止内排空，再查询一次，不能复用已知的停止前快照发信号。POSIX 继续逐 PID 复核；每次信号前仍检查正数 PID 和截止。身份查询到信号仍有 TOCTOU，不能宣称原子地免疫 PID 复用。

当时的合成延迟回归分别验证 Watch 八个后代、Windows Web 原 3000ms 窗口、出生身份变化/缺失/zombie、停止前采集、迟到数据与信号错误。原阶段内的 Web 两次 200ms 查询可以完成；两次 300ms 查询会超过 1500ms 阶段中扣除 1000ms 回收后的窗口，形成下一轮需要纠正的调度缺口。这不是放宽超时，也不证明实际 Windows 冷查询总能按时完成。原 Windows 首败和修复前合成失败均保留，真实行为必须由新提交的 Windows CI 另行验证。

`6869ec0bc9e8474c1c8f61aa48750454171111ff` 的一次独立本地启动诊断又取得了两类不同证据。精确包装生产内存命令 `spawn('ps', ['-Ao', 'pid=,ppid=,rss=,command='])`，31 个不同 PID 均正常 exit/close，stdout/stderr 也都 end/close，最慢关闭约 89.79ms；没有 kill、error、丢弃或观察器错误。它只说明本轮没有复现旧内存探针故障，不等于 31 个有效 RSS 样本或完整验收。真实页面启动、template/script 可见更新与 style 产物检查完成，整轮仍退出 78：另一条身份命令 `execFile('ps', ['-A', '-o', 'pid=,ppid=,pgid=,lstart=,stat='])` 在停止循环中被阶段执行截止取消。根 close 已到达，六个登记 PID 未能再次确认；事后定向查询均已不存在，不能把旧登记集合当作六个仍存活的进程。

该失败调用确实位于停止后的循环，并选择了全表查询；初始化已完成，源码分支说明派发时本地句柄仍被判断为根未退出。此时 `complete()` 必定不成立，循环查询没有成功价值，却仍可能压缩探针执行窗。纯 fake-timer 反例进一步确认：每次查询固定正常耗时 40ms，根在 INT 后 2400ms、仍处于原 3000ms 宽限内退出；旧循环在 t=1965ms 再发查询，却仅给 35ms 执行窗，t=2000ms 主动取消并锁存失败。真实失败没有记录该查询当时的剩余预算，因此不能反推它恰好采用了这个合成序列。

停止后的根仍未 close 时，现在等待本次活句柄的 close 或原阶段结束，再进行必要的身份确认；等待定时器在 close 提前到达时清除。阶段末尾余量不足时进入原下一阶段重新采集，可信空集合已到达就不再发更强信号。没有新增查询执行窗，也没有延长阶段、总截止或 1000ms 回收期；真实查询失败仍锁存，最终仍同时要求根 close 与最新可信空集合。此纠正只消除根未关闭时不可能成功的循环扫描。根已经关闭但后代仍活时，继续保留原严格查询和失败规则，不宣称解决所有阶段末尾的短执行窗，也不据此宣布整轮真实诊断已经通过。

`a79a8b8b44f13a711eb61063517dfc82051f6758` 的 [Windows uni Web 首败](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40346027997/job/121657062810) 确认根 close 已发生后的边界仍存在：停止循环发出的七 PID subset 查询被阶段执行截止取消，没有页面或 HMR 主错。七个 PID 是未能更新的登记集合，不是仍存活的证明；实际耗时和剩余量未记录，不能推定真实查询恰为 300ms。

本轮统一非最终阶段的含义：先进行新鲜归属采集并发必要信号，再等待该阶段原有宽限。下一阶段入口必须先重新采集；可信空集合与根 close 同时成立就直接完成，不发送更强信号。只有最终阶段继续在其原截止内做退出确认轮询。这样去掉了非最终阶段发信号后的尾部短窗；Watch 仍为 3000/2500/2500ms、Web 仍为 1500/1500ms，1000ms 探针回收预留不变。真实查询或信号错误仍锁存，最终未确认仍失败。停止前 pending 排空重采、POSIX 逐 PID 信号前复核及最终阶段的短窗未被此策略通用解决。

停止正常返回可能推迟：600ms Windows Watch 例在下一阶段入口约 3600ms 完成，300ms Web 例约 1800ms 完成，都只发送首个信号。内存采样器在 stop 开始时停止调度，迟到探针不再提供采样 RSS；但外层命令墙钟、部分 `totalMs` 和停止后汇总的插件调试日志可能包含宽限，不能声称所有指标不变。正式版本比较使用另一套入口，原性能门槛保持不变。新增回归同时保留首个 Web 查询超过原执行窗即终态失败、最终阶段信号与确认仍不够时拒绝，以及信号 EPERM 即使随后空集也继续报告的边界。

会话停止单飞，内存采样器与 watcher 收尾均执行，主错、两个收尾副错及其原对象/文本继续穿透至 runner/Web 的失败报告。初始化归属失败也进入收尾。真实隔离 PNPM fixture 覆盖根仍活与根先退出：先确认生产登记已完成，再独立核对根退出后 worker 同出生身份仍活；生产 stop 后、任何 UUID 文件兜底之前确认根 close 和全部登记身份消失。fixture 查询、元数据或终态缺失不能当作空集合；失败证据保留。启动和初次编译时新增身份查询有非零观测成本，不能宣称对时间或内存指标零扰动。

## 规则评估

该修复遵循现有取消、精确归属及逐项收尾边界，不新增全局规则。Windows 冷 CIM 与实际脚本协议仍需准确 head 的 Windows CI 证据，因此复盘保持 partial，不能以 macOS 回归推断 Windows 实际通过。
