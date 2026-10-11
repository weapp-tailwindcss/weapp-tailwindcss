---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/commit/0d2ddb800db22046ff7f0f5fe7527fb0117894fa
baseline: 0d2ddb800db22046ff7f0f5fe7527fb0117894fa
regressions:
  - scripts/ci/demo-matrix/turbo-cache.test.mjs
---

# 聚合构建的输出与跳过状态必须有独立缓存边界

## 症状

全面测试的根构建成功后，Turbo 对 Nuxt 和 12 个 Taro/uni demo 报告未找到输出文件。Nuxt 日志实际已经生成 `.output/public` 与 `.output/server`，其余 12 个任务则由 guard 明确跳过。成功任务数不能直接作为这些项目的真实构建证据。

## 根因与纠正

Nuxt 使用真实包名 `@weapp-tailwindcss-demo/web-nuxt-vite-tailwindcss-v4`。Turbo 2.10.12 的 dry-run 显示，目录式 `demo/web/*#build` 没有覆盖该任务，最终仅继承通用的 `dist/**`、`build/**` 等输出声明。缓存命中可以重放成功日志，却无法恢复未归档的 `.output`。修复为真实包名的精确任务配置，声明 `.output/**`，保留 `^build` 依赖。

三个跳过变量原本位于 `globalPassThroughEnv`，不会改变缓存键；两个 strict 变量也没有被默认严格环境模式透传。五个变量统一纳入 `globalEnv`，保证任务能读取它们且缓存身份随其变化。

guard 还依赖 `stdout/stderr.isTTY`。环境变量哈希不能完整描述交互状态，因此对 12 个经过 guard 的精确 build 任务禁用缓存，保留拓扑依赖。聚合脚本仍维持跳过分工，真实产物由后续严格 E2E 构建验证。

## 验证

`pnpm exec cross-env CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/turbo-cache.test.mjs --update=none`：修复前 4 项失败，修复后 4 项通过。

持久回归使用真实 Turbo 解析仓库配置，并在独立临时工作区复用相同配置与包名。Nuxt 伪构建首次生成 server/public，删除输出后命中本地缓存并恢复文件，工作区之外的计数证明没有重新执行。所有 guard 任务连续执行两次，五个开关逐个改变最终 hash。测试禁用远端缓存和 daemon，收尾只删除其创建的临时目录。

## 适用边界

这是构建编排与缓存回归，不修改公开包或 demo 源码，不需要 change intent 或样式快照更新。轻量 fixture 验证缓存语义，不代表 Nuxt、Taro 或 uni 的真实框架构建已经通过；真实产物仍由完整工作流验证。

## 规则评估

不新增 AGENTS 规则。以真实配置解析、缓存恢复和 guard 任务执行次数回归落实原有产物与验证证据要求，避免通过伪造输出文件消除警告。
