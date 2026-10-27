---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 5be7c1feaf9c545523c2bb753c4c7ee1e0373ea3
regressions:
  - e2e/hbuilderx-web-process-cleanup.test.ts
  - e2e/hbuilderx-web-managed-handle.test.ts
  - e2e/issue-1144-runner.test.ts
---

# HBuilderX Web 验收的受管进程收尾

## 症状

本地普通 23 阶段验收完成第 1–17 阶段，第 18 阶段三个 H5/HMR 测试也通过了页面断言，外层仍需向四个登记出生身份的后代发送 SIGTERM 才完成收尾。外层按原有严格规则判定阶段失败，19–23 未执行。微信专项已在第 13 阶段通过，不能把这个失败描述为微信 IDE 整体异常。

普通 CLI Web 分支只保留 `spawnCommand(...).child`，使用兼容同步 `killProcessTree()` 后立即清空引用。同步入口只表示请求终止，并不承诺关闭完成；其兼容合同还会吞掉信号异常。`afterEach` 也只重复同步请求，不能提供严格确认。

## 根因与纠正

Web 服务现在保留创建它的完整受管命令，正常停止等待原 `stop()`。在同一同步续体检查根仍有效并进入受管停止，让底层在首个异步等待前保存本轮有效进程组。停止期间根先 close，也继续等待该组内关闭继承管道、延迟退出的 worker。

会话和异步 `afterEach` 共用同一个停止结果。仅停止成功后清空同一引用；失败保留句柄和错误，禁止后续服务覆盖。同步抛错与异步拒绝都传播，提前退出错误与独立清理错误同时存在时保留两者。

普通 CLI 服务若在 stop 入口前已经退出，记录明确的提前退出错误，不能借底层 close guard 返回成功。仍调用原受管 stop，但不删除底层防 PID/PGID 复用的保护，也不向历史负 PGID 补发信号。HBuilderX launch CLI 的自然退出合同不同，不套用普通服务的提前退出判定。

普通会话、Issue #1210 Web 的直接调用方和兜底 hook 一并使用受管句柄。没有修改公开 runner、产品构建链路、严格外层“介入终止即失败”的规则或原 TERM 1000ms / KILL 1000ms 停止窗口，没有追加身份扫描预算。

## 验证

macOS、Node 24.18.0、Vitest 5.0.4，在基线加本轮改动执行：

```bash
CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run \
  -c e2e/vitest.e2e.config.ts \
  e2e/hbuilderx-web-process-cleanup.test.ts \
  e2e/hbuilderx-web-managed-handle.test.ts \
  e2e/issue-1144-runner.test.ts --update=none
```

原实现的两个真实隔离回归失败：正常请求返回后同出生 worker 仍活；根提前关闭后 stop 静默成功。修复后验证根 close 时 worker 仍活，正常 stop 返回时它已退出且 heartbeat 不再增长；根在 stop 前退出则明确拒绝。fixture 通过独立根进程组、随机 token、父子关系和出生身份限定资源，finally 只回收本轮仍匹配的身份。

合成回归另覆盖同一次挂起停止、成功后释放、失败后禁止覆盖、同步抛错及 exit0/exit1 与清理副错的保留。真实延迟 TERM 回归只在 POSIX 执行，不能推断 Windows 会执行 JavaScript SIGTERM handler。

本轮定向结果为四文件 32 passed；另两个真实项目入口只做导入与收集，17 项按原环境开关跳过，不能计为设备验收。严格 ESLint、规则和 diff 检查通过。E2E 全目录额外 strict 类型比较在原始六文件的虚拟基线与当前源码均为 2118 条诊断，没有新增；该探索检查仍失败，不算全目录类型通过。

## 适用边界

已确认的是同步请求被误当作停止完成的生命周期缺口。原第 18 阶段没有内部 kill 返回、异常和事件时序证据，不能断言吞掉 EPERM，也不能把四个残留 PID 的具体路径全部归因到这一处。

这里只复用 runner 已有的有效进程组确认。停止前根已关闭时明确失败而不重新认领旧组；未登记且脱离原组的后代仍由严格外层阻断，不宣称已通用解决所有后代清理。定向成功不替代准确新 head 的完整本地验收、适用 CI 或真实他人审批。

## 规则评估

现有资源所有权、严格收尾与跨平台规则足够，本轮补持久回归，不新增全局规则。
