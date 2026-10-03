---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 3f57cdab2818bb409233a31535b475e0ba9fc333
regressions:
  - packages/hbuilderx-runner/test/process.test.ts
  - packages/hbuilderx-runner/test/process-lifecycle.test.ts
  - packages/hbuilderx-runner/test/host-connection.test.ts
---

# HBuilderX 命令超时与真实进程关闭

## 症状

扩展流程阻断期间审查进程生命周期发现，`runCommand` 在业务超时后发送 SIGTERM 就返回合成退出状态，没有等待真实关闭和最终输出。另一个停止入口只把 `closed` 与五秒计时器竞争，计时器结束被当成成功，忽略 SIGTERM 的子进程仍然活着。

修复前真实子进程回归共两项失败：优雅关闭输出的 CLEANED 日志丢失；拒绝 SIGTERM 的进程在 `stop()` 返回时仍未关闭。测试只创建 Node fixture，失败时定向清理自身资源，不操作 IDE、设备或用户服务。该证据确认的是 runner 清理边界缺陷，不能证明它是 HBuilderX 原生 launch 静默挂起的根因。

## 根因与纠正

业务截止时间与清理预算分开。达到截止时间后等待 `stop()` 完成，再以真实 close 的退出状态和最终日志构造结果。即使优雅退出返回零，仍保留 timeout 分类；host 握手消费方也按 timeout 拒绝该结果，避免把迟到响应作为成功。

POSIX 仅清理本次 spawn 明确创建的独立进程组，先请求退出，最多等待一秒，再升级 SIGKILL 并最多等待一秒。清理开始后，即使根进程关闭、后代不再占用管道，也必须确认原组消失。对自然 close 的公开句柄立即注销，防止以后误用复用的 PID；重复 stop 复用首次成功或拒绝结果。`detached: false` 只确认根进程关闭，主动离组的服务不在此契约内。

Windows 先对仍存活的根 PID 执行有五秒截止时间的 `taskkill /T /F`，不先调用会直接结束根进程的 child.kill。随后最多一秒确认 close。taskkill 的非零、执行超时、缺失命令或部分终止诊断，即使根进程关闭也仍是清理失败。公开错误维持 HBuilderXCommandError 与原 result 结构，额外通过 cleanupError/cause 保存清理失败；allowFailure 不得跳过它。

macOS 的实际退出过程还暴露了组探针 `kill(-pgid, 0)` 在退出与回收之间暂时返回 EPERM 的情况。探针在同一固定预算内继续观察，只有明确 ESRCH 才确认组消失；持续异常保留诊断并失败。实际发信号或 taskkill 的错误始终保留，不用后续根关闭抹掉。Linux 容器若 PID 1 不及时回收孤儿，组仍存在也会保守失败；没有延长预算或跳过 Linux 掩盖此边界。

## 验证

- 修复前定向 `CI=1 pnpm --filter @weapp-tailwindcss/hbuilderx-runner exec vitest run test/process.test.ts --update=none`：2 失败、2 通过、1 条 Windows 条件跳过。
- 修复后 `CI=1 pnpm --filter @weapp-tailwindcss/hbuilderx-runner test --update=none`：87 通过、2 条原有 Windows 条件跳过。真实 macOS 用例覆盖宽限退出最终日志、拒绝 TERM 后强制退出、根先 close 且关闭管道的后代清理；契约用例覆盖 POSIX 非独立组、组消失后注销、持续组存活、探针权限异常、计时器释放及 Windows 失败保留。
- `pnpm --filter @weapp-tailwindcss/hbuilderx-runner build`：ESM、CJS 和声明构建通过。
- `pnpm --filter @weapp-tailwindcss/hbuilderx-runner typecheck` 和修改 TypeScript 文件的显式 ESLint 通过。

## 适用边界

当前 Windows 结果来自模拟 OS 进程接口的契约测试，不冒充 Windows 实机进程或 IDE 验收；本轮没有执行 Linux 原生进程验收，没有操作真实 IDE，也没有重新执行完整多端门禁。没有修改 demo、样式输出或 static fixture，不需要更新 static 基线。

## 规则评估

沿用包级“超时、日志截断和进程树清理”规则，补齐公开说明和持久回归，不新增重复规则。消费方必须等待并传播 stop 拒绝，不能用同步兼容 kill 入口代表已完成清理。
