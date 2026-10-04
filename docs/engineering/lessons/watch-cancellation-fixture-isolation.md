---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 1e7b7af561406935a463ce7382ffd7677e69d3d1
regressions:
  - e2e/watch-command-fixture-isolation.test.ts
  - e2e/watch-command-lifecycle.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
---

# 预期超时测试污染父流程取消标记

## 症状

全面回归 `a4ade71e-d80c-49a4-8730-16898b5b1086` 在提交 `1e7b7af561406935a463ce7382ffd7677e69d3d1` 通过 1–25 阶段后，第 26 阶段模板 HMR 首项用例于 77 毫秒失败。错误为 `watch command was cancelled; restoring owned sources`，发生在创建 watch session 前。该结果不能归因为模板编译器失败：本轮编译会话尚未启动。

## 根因与纠正

全面流程通过 `E2E_WATCH_CANCEL_FILE` 向所有阶段透传同一取消标记。第 20 阶段 static 中，`watch-command-lifecycle.test.ts` 的前两项故意让命令超时，但环境直接展开 `process.env`，继承了真实父流程的文件路径。`runWatchCommand` 使用该路径，500 毫秒后写入 `command timeout`；用例本来就期待超时，所以测试仍成功，父标记却留下来。

顶层 AbortController 由顶层信号处理器触发，子进程写入文件本身不会触发它，因此第 21–25 阶段继续。第 26 阶段首次创建真实 watch session 时，才由 `assertWatchCommandActive` 检查到文件。原日志在 `workflow.log` 第 3933–3939 行记录污染用例执行，第 5306 行进入首次受影响的模板 HMR 阶段。

责任边界在合成失败 fixture：它必须拥有自己的取消信号，不能使用调用者传入的真实流程标记。用例现在在 `beforeEach` 隔离继承变量，已有 `afterEach` 恢复环境；需要显式借用文件的用例继续创建并传入自己临时目录中的路径。

生产取消协议保持原样。真实 watch 命令超时仍抛错、没有重试，阶段失败后停止工作流；顶层信号仍可通过父标记进入 runner 的恢复逻辑。没有通过删除父文件、忽略已取消状态、跳过测试或改动超时预算放行。

## 验证

新增回归用真实子 Vitest 执行完整生命周期测试文件，分别继承一个不存在的父标记和一个已有父标记。每轮核对整个文件没有失败或跳过，父目录仍存在，父标记保持不存在，或者内容与 inode 均保持原样。

旧实现两项均失败：不存在的父文件被创建为 16 字节超时标记；已有父文件使生命周期测试本身失败。修复后两项通过。设置 `CI=1`，执行：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/watch-command-fixture-isolation.test.ts e2e/watch-command-lifecycle.test.ts e2e/demo-workflow-native-cancellation.test.ts --update=none
```

三文件共 12 项通过，0 失败、0 跳过。两项隔离回归各自还完整执行原七项生命周期测试。真实 `SIGINT/SIGTERM` 回归继续证明取消经 watch 命令进入 fixture 的 `finally` 并恢复原始字节；父进程先关闭时已登记后代仍正常收尾。

## 适用边界

本修复只调整测试环境隔离和持久回归，不改变产品源码、demo 样式、生产取消文件协议或静态样式基线，不需要 change intent。定向回归不等于第 26 阶段或完整 46 阶段验收通过；完整入口仍需新的预检与真实运行证据。

## 规则评估

不新增 AGENTS 规则。既有资源归属约束覆盖此问题，用完整测试文件的嵌套回归保证合成故障不污染调用者资源。
