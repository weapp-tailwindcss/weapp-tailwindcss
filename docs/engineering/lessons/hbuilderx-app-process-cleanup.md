---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: cba75945b457e02f078d8d74daa495192dc20a30
regressions:
  - e2e/hbuilderx-app-process-cleanup.test.ts
  - e2e/hbuilderx-alias-consumers.test.ts
  - e2e/hbuilderx-hmr-lifecycle.test.ts
---

# App 验收必须等待受管进程树收尾

## 症状

检查 uni-app x 五端验收入口时发现，App runner 在启动后只保存 `.child`。旧停止函数发送信号后最多等待两次 5 秒，不检查最终关闭状态，随后仍可能恢复源码、关闭项目并返回成功。根进程的 `exitCode` 已设置但后代仍持有管道时，旧函数甚至直接跳过停止。

## 根因与纠正

底层 runner 已提供有界、确认关闭且保留错误的 `SpawnedHBuilderXCommand.stop()`，消费者丢失整个句柄后重新实现了较弱的生命周期。修复保存原句柄并复用其 `logs`、`closed`，在统一收尾中只调用一次 `await stop('SIGINT')`，不另设提前完成的计时器，也不在停止失败后无界等待 `closed`。

HMR 监听持续到停止结束，再检查最后到达的失败或重装日志，之后释放监听。停止失败仍尝试源码恢复、严格项目关闭、alias 清理和日志关闭；主体与清理失败按原错误对象聚合，不能将成功编译掩盖为完整验收通过。

## 验证

- 修改 runner 前运行新增回归，5 项全部失败，直接证明停止错误被忽略、收尾提前完成及晚到 HMR 错误未被检查。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/hbuilderx-alias-consumers.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts --update=none`：3 文件、30 项通过，无跳过。
- 新回归通过临时目录、真实 alias、源码恢复和日志订阅检验资源顺序；模拟 CLI/设备边界，不启动 IDE 或设备。
- `pnpm exec eslint e2e/hbuilderx-local/runner.ts e2e/hbuilderx-app-process-cleanup.test.ts` 通过。
- 按 `e2e/tsconfig.json` 对受改文件及其依赖做类型检查，原有 E2E 依赖存在类型错误。使用 TypeScript compiler host 在内存中分别读取基线与本轮 runner 比较诊断；新增测试无类型错误，原有诊断集合未增加。不把该比较描述为整个 E2E 类型检查通过。

## 适用边界

验证的是 App 消费者的进程、源码和项目收尾，不证明 Alpha 5.31 五端实际编译或 HMR 已通过。真实平台验收必须重新完成当轮环境门禁。没有改变 demo、样式产物或快照预期，无需更新 static 基线；未修改公开包行为，不新增 change intent。

## 规则评估

不新增 AGENTS。既有资源归属和失败传播规则足够；通过复用现有受管句柄及持久消费者回归落实。
