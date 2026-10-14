---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 2cafadfabb3e896418ea2eb4069af2549a659692
regressions:
  - e2e/preflight-daemon-stop.test.ts
  - e2e/preflight-save-queue.test.ts
  - e2e/preflight-server-close.test.ts
  - e2e/preflight-cli-error-report.test.ts
---

# 预检服务停止与资源确认

## 症状

原停止函数先设置布尔状态，再取消探针、保存报告，最后才进入服务关闭和锁释放的 `finally`。保存失败会跳过资源回收；后续停止调用又因布尔状态直接返回。后台信号回调的拒绝也无人等待。原回归实际出现关闭函数调用零次，以及 HTTP 服务关闭回调报错时返回的 Promise 仍成功。

## 根因与纠正

停止请求、资源归属和最终收尾缺少共同生命周期。现在信号、响应结束事件及主流程 `finally` 共用同一个停止 Promise。停止立即取消探针并唤醒主流程；探针等待与停止请求竞速，因此卡住的探针不会阻止进入收尾。资源获取返回后先登记，再检查是否停止，保证晚到锁或服务仍由本轮回收。主流程结束登记和错误记录后才统一回收，避免读取尚未赋值的资源。

取消、报告保存、服务关闭和锁释放各有一次固定的五秒预算。阶段拒绝保留原错误并继续可执行的清理；取消或关闭未确认时保留工具锁，防止旧工作进程或服务仍存活时启动新一轮。迟到拒绝保持已观察，信号监听始终在最终 `finally` 移除。使用 `on` 保留正在收尾时的同种重复信号监听，防止第二次信号恢复默认退出。

报告写入在 `PreflightSession.save()` 统一串行，包括探针、领取、验证和停止调用；一次写入失败仍向原调用者拒绝，后续阻断报告可继续排队。服务关闭接收 Node 回调错误；CLI 使用完整聚合错误输出，保留执行和清理详情。

## 验证

macOS、Node 24.18.0、pnpm 12.9.1，工作树含本轮未提交修改，环境设置 `CI=1`。先在机械提取后的原实现运行两项回归，均失败：保存失败未调用服务关闭，关闭回调错误未拒绝。

修复后运行以下定向命令，11 个文件、126 项全部通过，其中四个新增文件包含 17 项回归。隔离工作树在单次命令中另加配置 `verifyDepsBeforeRun=false`，避免自动安装影响复用的依赖：

```text
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-daemon-stop.test.ts e2e/preflight-server-close.test.ts e2e/preflight-save-queue.test.ts e2e/preflight-cli-error-report.test.ts e2e/preflight-gate.test.ts e2e/preflight-lifecycle.test.ts e2e/preflight-error-report.test.ts e2e/preflight-worker-error-report.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts e2e/preflight-assertions.test.ts --update=none
```

用例只使用注入资源、合成 worker 和本轮局部 HTTP fixture，不运行真实 `prepare`、默认工具锁或设备探针。新增回归覆盖保存拒绝、取消拒绝和超时、关闭拒绝和超时、释放失败和超时、重复信号、初始化晚到资源、正常 finish、串行保存及 CLI 聚合详情。受影响文件 ESLint 已通过。

定向 TypeScript 使用根配置同等严格选项和九个受影响脚本、测试入口，仍以退出码 2 报告一条原有 `TS2379`：`session.probes()` 传入的 `binding: undefined` 与 `ProbeContext` 的精确可选属性类型不符。与上述基线的源码覆盖对照保留同一诊断，本轮未增加诊断；此结果不替代整合后的正式类型门禁。

## 适用边界

此记录只证明合成生命周期回归。整合后仍须在主验证工作树执行真实 `prepare`，核对最终退出码、端口不可连接和锁归属，不将 HTTP `/finish` 的成功应答视为 daemon 已退出。本次保留既有响应协议。

锁获取和服务启动仍须等待其实际返回才能登记资源；本次不改获取协议或给底层文件系统操作增加可取消语义。停止阶段的超时会报告未确认状态，不能证明底层工作进程已经退出，不能据此清理用户 IDE 或接管保留的锁。

## 规则评估

不新增规则。既有资源归属、失败传播和微信登录保护规则已经覆盖要求，以持久回归落实停止边界。
