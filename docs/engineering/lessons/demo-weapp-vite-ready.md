---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1267
baseline: e93d30f0e894cc5d4a07890b421ae1d069169c2e
regressions:
  - scripts/ci/demo-matrix/watch.test.mjs
---

# weapp-vite 矩阵的首次修改必须等待监听就绪

## 症状

[PR #1267 的 macOS Node 24 任务](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/36912294057/job/110551016473) 在生产与开发首轮产物通过后，第一次 replace 等待 180 秒仍缺少本轮标识。日志没有增量编译或源码更新事件。同提交的其他平台及本地单场景完整运行通过，说明不能只靠一次本地通过解释远端失败。

## 根因与纠正

weapp-vite 7.3.0 的开发入口先完成首次产物写入，再等待 sidecar watcher 就绪，最后报告“小程序初次构建完成”和“开发服务已就绪”。矩阵原来直接检查产物，因此可能在初始化窗口内发起第一次修改。

仅为 weapp-vite 的 initial 轮增加显式就绪检查。产物已出现、只完成构建、日志尚未完整输出时均不允许开始下一轮；服务就绪后继续原有产物断言。replace、add、restore 的本轮标识和 CSS 验收保持完整，不放宽超时、跳过场景或重复写入源码。

## 验证

持久回归见 [watch.test.mjs](../../../scripts/ci/demo-matrix/watch.test.mjs)。单场景入口为 `CI=1 DEMO_MATRIX_PROCESS_DIAGNOSTICS=1 pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp`，它包含生产静态基线及全部开发修改轮次，不替代 IDE 或设备验收。该修正不改变 demo 源码或样式语义，无须更新 static 基线；验证使用现有基线且不带 `--update`。

新增就绪回归及其余 watcher 同步回归共 7 项通过，脚本 lint 通过，修正后的上述真实单场景完整通过。

## 适用边界

远端原始日志没有逐行时间戳，不能证明那次丢失事件的确切内部时序；可以确认的是原验收未遵守服务就绪边界。本地运行使用 macOS、Node.js 24.18.0，失败的 CI 环境为 macOS、Node.js 24.20.0。

后续以修正提交的全部适用 CI 为交付依据，旧提交其他任务的成功不能替代最终 head 验证。

## 规则评估

不新增 AGENTS 规则。将服务就绪边界固化为回归和矩阵说明，保留原有静态基线与热更新验收强度。
