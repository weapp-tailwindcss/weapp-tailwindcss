---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 012b4830d0001cf704dea621e46695703ebe4f43
regressions:
  - e2e/hot-update-command-options.test.ts
  - e2e/demo-workflow-extended.test.ts
  - e2e/demo-workflow-environment.test.ts
---

# 扩展工作流的构建配置必须传递到 watch 子入口

## 症状

扩展编排已经将 `E2E_WATCH_SKIP_BUILD` 固定为 `0`，但第 30 阶段的 `e2e/run-hot-update.ts` 仍无条件传入 `--skip-build`。实际 watch CLI 只从命令行读取该开关，环境覆盖没有生效。

## 根因与纠正

参数解析和子进程命令生成之间缺少构建选项。现在 `resolveWatchCommandOptions` 读取已有环境变量，并将明确的 `skipBuild` 值传给命令生成器；关闭开关时不再发送 `--skip-build`。扩展模式覆盖继承配置后，最终 watch CLI 得到 `skipBuild: false`。普通入口未配置时继续保留既有行为。

## 验证

新增回归把扩展环境、父入口的命令参数和真实 watch CLI 解析串联起来。旧实现有三项失败：`0`、`false` 和扩展环境三种路径都被解析为跳过构建；修复后通过。相关验证命令：

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hot-update-command-options.test.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-environment.test.ts --update=none
```

3 个文件、27 项通过。修改代码 ESLint、规则检查与差异检查通过。

## 适用边界

此开关跳过的是本地依赖包构建，demo 的 dev 编译仍会执行。完整流程第 1 阶段本已执行根构建，且测试期间禁止编辑源码，因此这次审查没有证明历史运行使用了旧产物。修复落实“扩展模式禁止跳过构建”的既有合同，不改变 HMR 或性能预算，也不代表完整 46 阶段通过。

没有修改公开包行为、demo 或样式产物，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS 规则；通过跨入口回归覆盖已有扩展模式要求。
