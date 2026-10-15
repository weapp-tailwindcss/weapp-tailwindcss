---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 56d42823a93769ee91f6ef93fbd6cab0cdfb4ff8
regressions:
  - packages/weapp-tailwindcss/test/watch-output-integrity.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-output-integrity-observation.unit.test.ts
---

# 产物完整性回归应等待违例确认再修正文件

## 症状

全面验收在构建阶段完成 71 项任务后，根单测中 `records an invalid intermediate output even when the final file is corrected` 失败：最终 `assertClean` 返回成功，原预期为 `output integrity violation`。该轮单测共 903 文件通过、1 文件失败、5 文件跳过，9683 项通过、1 项失败、1 项预期失败、44 项跳过；后续全面验收阶段没有执行。

## 根因与纠正

原测试写入无效内容，固定等待 40ms 后修正文件，再断言历史违例仍保留。监控按 10ms 间隔注册文件采样，并串行执行异步读取；首次发现禁止片段后还会等待 10ms，再次读取确认。经过 40ms 不能证明回调、排队检查和二次读取均已完成。若修正在确认读取之前完成，监控按既有策略不会记录该片段。

受控失败回归保留最终拒绝断言，但在首次发现后、确认读取前修正内容，稳定得到原错误 `promise resolved "undefined" instead of rejecting`。这证明原测试依赖了未经确认的观察顺序，不能据此认定操作系统丢事件或监控实现有缺陷。

真实文件系统用例现在先等待 `assertClean` 确认中间违例，再修正文件，保留最终拒绝断言。另一个独立测试文件只控制文件监听、读取和确认延迟这三个协作者，运行真实监控实现：直接触发实际注册的监听回调，等待二次读取捕获无效内容后再修正；最终显式检查仍必须拒绝。它也验证确认前已修正的内容不形成持续违例、排队检查必须完成、`stop` 解除监听并排空进行中的确认及最终检查、文件缺失后的恢复，以及空 guard 不注册监听。

等待队列和 `stop` 的用例使用真实 `setImmediate` 事件循环栅栏，在确认 gate 仍关闭时检查 Promise 尚未完成，避免刚启动 Promise 就同步断言造成假阳性。用例清理钩子先释放受控 gate、停止监控，再移除真实文件夹；断言失败时也执行清理。监控实现、10ms 确认阈值及原断言均保持不变。

## 验证

环境为 macOS、Node 24.18.0、pnpm 12.9.1、Vitest 5.0.4；在上述基线的独立工作树中验证未提交修复。原未改用例单独运行 3 项通过，不能覆盖全面验收中已经保留的失败事实。受控顺序失败的测试文件和日志分别保存为 `observation-order-red.test.ts`、`red-observation-order.log`，修正观察顺序后的两个文件共 9 项通过。

以下受影响单测入口完成 4 文件、135 项通过，无 skip 或快照更新：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-output-integrity.unit.test.ts test/watch-output-integrity-observation.unit.test.ts test/watch-hmr-runner-cleanup.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none
```

新工作树首次扩大验证因 workspace 导出尚未构建而失败，保留 `scoped-final.log` 和 `scoped-after-dependency.log`。执行 `pnpm exec turbo run build --filter='weapp-tailwindcss^...'` 后，13 项依赖构建成功，完整定向结果保存在 `scoped-complete.log`。正常核心包 `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`、两个改动测试的显式 ESLint、规则与 diff 检查通过。

额外按工具包真实严格配置扩展的类型探针发现未修改 CLI 的 10 条诊断。以未修改监控源码为入口的基线探针产生完全相同的诊断；该探针在观察顺序提交中未通过，不能写成所有类型检查均通过。后续[CLI 严格可选参数修复](watch-cli-strict-options.md)保留原始失败，并通过真实配置的持久类型回归验证修复。全面验收尚须在集成提交重新预检并从入口运行，本文保持 `partial`。

## 适用边界

采样和二次确认不能保证捕获每一个短暂中间状态。本次修复只证明已经确认的违例不会被最终正确内容抹去，并把监听触发与显式检查的职责分别验证；不宣称 40ms 内的任意写入一定被监控发现。

这次提交只修改测试与复盘，没有公开包行为、demo、样式 fixture 或快照变化，无需 change intent 或 static 基线更新。单测证明不替代真实 HMR、浏览器或设备验收。

## 规则评估

不新增 AGENTS。现有“用可观察状态而非固定等待证明异步完成”的工程流程已经覆盖该边界，通过可执行回归落实。
