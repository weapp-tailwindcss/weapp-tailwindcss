---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 2f87a6ac448eb90d959f151b08055596071cc4cb
regressions:
  - scripts/ci/demo-matrix/browser-styles.test.mjs
---

# 浏览器样式回归超时应保留阶段证据

## 症状

准确基线的 Windows Node 24 准备步骤 `pnpm test:demo:matrix` 中，外链资源用例 `200 / text/javascript / undefined` 达到原 30 秒测试上限。该套件为 1236 通过、1 失败、3 跳过；实际 Taro watch 步骤没有启动。

原始 [job 日志](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41136744412/job/124340958520) 只有 Vitest 的通用超时，不能区分浏览器启动、首次采集、预期拒绝或资源关闭。失败 job 没有 artifact；其他成功 job 的 artifact 不能补齐这次阶段归因。

## 根因与纠正

本次原始超时的具体原因仍未知。测试的可观测性存在独立缺口：异步 body 或 finally 尚未完成时，Vitest 已可报告超时；只在操作结束时抛出的错误和写入的证据未必进入该错误链。

在失败钩子中输出阶段列表，逐项记录服务创建与监听、浏览器启动、两次 inspect、各资源关闭和临时目录删除的状态。阶段包装器原样传播 rejection，关闭仍并发执行并全部 settle，之后才删除 fixture、汇总清理错误。尚未取得的浏览器或服务明确记为 `not-acquired`，不会显示为已关闭。

阶段列表只表示失败钩子执行时的状态。`running` 不证明操作没有执行、没有输出或永远不结束；该快照也不能证明之后的清理已经完成。

## 验证

本工作树独立依赖、Node 24.22.1/pnpm 12.15.0、Playwright 1.64.1/Vite 7.3.7：

- 改动前原 6 项真实浏览器回归通过，不能据此宣称 Windows 超时已修复。
- 定向命令为 `pnpm test:demo:matrix scripts/ci/demo-matrix/browser-styles.test.mjs`；保持原 20 秒启动、5 秒采集、30 秒测试上限及全部原断言，浏览器继续 headless，清理仍逐项等待自有资源。
- 独立受控探针通过真实 Vitest 导入本测试，仅 mock 浏览器边界，分别注入启动失败和第二次 inspect 的错误；确认原错误仍出现、阶段列表准确、服务与 fixture 清理完成、未取得浏览器记为 `not-acquired`。这两次预期失败验证诊断路径，没有复现原 Windows 超时，不能计为产品红或修复。
- 最终原 6 项真实浏览器回归全部通过；使用 `pnpm exec eslint --no-ignore scripts/ci/demo-matrix/browser-styles.test.mjs` 显式覆盖测试文件，规则检查 71 条/0 错误、发布状态和 diff 检查通过。这里只改测试证据与文档，不触发无关包版本提升，也没有执行发布。

## 适用边界

生产 `browser.mjs`、CI 工作流、并发、预算、CSS/MIME 断言及快照均未改变。此提交只补诊断证据；上述基线的原始失败继续保留，待正常后续运行提供实际阶段后再修对应原因，不重跑或取消当前 CI。

安装版 Playwright 的 evaluate 和 close RPC 没有 host timeout；页面内 AbortSignal 不能覆盖 RPC 尚未执行的时段。关闭可能等待默认 30 秒；启动失败的 HTML、截图、关闭证据又串行执行。上述是源码确认的风险，不足以证明本次首因；Vite 关闭主动销毁自有 socket，也没有 keep-alive 死锁证据。不能以加 host race、放宽超时或本机通过代替根因修复。

## 规则评估

沿用现有失败证据与资源归属要求，不新增 AGENTS。阶段记录用于区分真实失败边界，不改变通过标准。
