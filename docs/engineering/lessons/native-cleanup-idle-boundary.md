---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 012b4830d0001cf704dea621e46695703ebe4f43
regressions:
  - e2e/hbuilderx-native-session.test.ts
  - e2e/hbuilderx-app-process-cleanup.test.ts
  - e2e/app-visual-lifecycle.test.ts
  - e2e/hbuilderx-hmr-lifecycle.test.ts
---

# 原生停止失败时冻结源码与项目现场

## 症状

在上述基线追加消费者回归，令本轮受管 CLI 的 `stop('SIGINT')` 拒绝后，测试预期源码仍含本轮 `changed` 标记，实际得到原始源码。失败证明脚本在停止失败后仍执行恢复和项目释放，可能向尚未退出的 watch 或原生构建再发送一次源码变更。

主 HMR 入口和视觉入口都使用逐项捕获错误后继续执行的通用清理函数。视觉入口还有外层 `finally`，无条件恢复源码和 manifest；内层失败仅记录结果，随后继续下一个样式变体或项目。因此只修改内层 alias 清理不能建立完整的停止边界。

## 根因与纠正

新增 `scripts/hbuilderx-native-session.ts`，在任何测试源码写入前保存原始文件字节、SHA-256、文件是否存在以及 host、平台、任务会话身份。已有文件使用 `realpath` 去重，项目创建后再保存真实根、launch 参数和项目资源类型；资料写入失败时不启动修改或 launch。恢复保留 BOM、CRLF 和测试前已有的旧标记，不能把清理后的测试输入当作原始文件。原本缺失的 manifest 在正常恢复时删除。

清理分为停止、状态核对、安全收尾、恢复和资源释放。受管停止拒绝，或当前 Harmony 更新明确出现失败、重装、native fallback、日志溢出时，记录 `blocked.json` 并抛出可穿透聚合错误的阻塞类型。此时只释放本轮监听和日志，不恢复源码、不关闭项目、不释放 alias；Alpha 5.31 Harmony 使用真实根时保留的就是该真实目录中的源码现场。

停止期间仍监听生命周期，即使先前已有主错误，也检查迟到的重装或 fallback。主错误、停止错误、生命周期错误、失败现场取证错误、安全收尾错误和阻塞记录写入错误都保留在异常链中。视觉入口通过同一恢复对象约束内外两层恢复，阻塞穿透样式变体和项目循环；退出前写出已取得的结果，报告写入失败也聚合保留。

普通 `restarted` 仍是严格 HMR 验收失败，但本身不是 native 停止未知的证据。Android、iOS 与没有上述证据的 Harmony 继续原有正常停止、恢复和释放路径；没有将所有 App 无差别判为未知。

## 验证

先执行停止失败的消费者回归，旧实现 1 项失败，首次偏离为源码提前恢复。修复后运行：

```bash
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-native-session.test.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/app-visual-lifecycle.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts e2e/hbuilderx-alias-consumers.test.ts e2e/e2e-matrix.test.ts --update=none
pnpm agents:check
```

六个定向文件共 113 项通过，无失败或跳过。用例覆盖原始字节恢复、缺失 manifest、恢复资料写失败、正常清理、受管停止失败、主错误叠加迟到重装、Harmony fallback、日志溢出、错误聚合，以及真实视觉批次函数不启动第二个变体或项目。全部使用临时文件和 mock 进程，没有调用 IDE 或设备。工程脚本变化没有修改 demo、样式断言或 static 基线。

新增恢复模块与其回归的严格 TypeScript 检查（含 `exactOptionalPropertyTypes`）通过；消费者完整导入图基线已有 434 条诊断，本次为 433 条，不将此写成全图类型通过。修改的 TypeScript 文件通过 ESLint（明确禁用 Prettier 规则），`pnpm agents:check` 与 `git diff --check` 通过。

## 适用边界

本次修复仓库脚本已经确认的失败后继续修改问题，没有修复厂商的 native idle 屏障。CLI 退出、`project close` 成功或停止日志依然不能证明共享 IDE 的原生任务完成；外部边界详见[Harmony 取消复盘](harmony-cancel-alias-boundary.md)。恢复资料中的 `sessionId` 是本轮测试生成的任务身份，不冒充厂商 launcher UUID 或原生完成回执。

阻塞后保留恢复资料与当前源码，由主任务报告具体项目和路径；没有自动重试、全局终止、固定等待或“稍后再恢复”的后台行为。本轮没有重跑实际设备，也没有声称 Harmony HMR 已通过。后续真实验证需重新预检并确认上轮已停止；跨进程的稳定登记与强制门禁由[持久门禁修复](native-session-persistent-guard.md)补齐，不能把启动新命令当作恢复证明。

## 规则评估

不新增或放宽 AGENTS 规则。通过共享状态和消费者回归落实已有资源所有权、停止失败不得继续调度及错误证据保留要求。私有工程脚本没有改变公开包行为，不新增 change intent。
