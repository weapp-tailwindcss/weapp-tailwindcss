---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 09754a863cfb4095df10b2a58de0b6267bb70db3
regressions:
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
---

# Rollup 3 构建期间的依赖失效不能被新缓存覆盖

## 症状

提交 `09754a863` 的 [Linux Node 24 诊断任务](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37137868524/job/111245984397) 在进入产品 watch 前失败：Taro ESM 目录依赖的连续保存已生成 `value: 2`，派生模块却仍是 `derived: 2`，预期为 `4`。本地原有 12 项原子替换回归一次通过，不能据此将 CI 失败归为环境噪声。

## 根因与纠正

Taro 当前消费 [Rollup `3.30.0`](https://github.com/rollup/rollup/blob/v3.30.0/src/watch/watch.ts)；本仓此前的补丁修复了原生监听及事件去重，但没有同步 Rollup 4 补丁的缓存交接修复。`Task.invalidate` 在构建未完成时修改旧 `cache.modules`，随后 `updateWatchedFiles` 用当前构建返回的新缓存覆盖它；下一轮仍复用旧派生结果。

扩展既有确定性回归到 Taro：挂起已经读取第一版的真实 transform，保存第二版，确认真实 Task 收到文件或目录依赖事件后才释放。Rollup 3 没有 `onInvalidate`，测试仅观察实际 `Task.invalidate` 调用并保留原实现，不手工注入事件或绕过构建。CJS、ESM 在修复前均稳定得到 `2` 而非 `4`。

补丁分别修改 CJS、ESM 的 Task：保存构建期间到达的 transform 依赖集合，在交接新缓存后重新标记相关模块；下一轮开始消费缓存时清空集合。保持现有 watcher、目录依赖、路径身份和 5 秒断言期限，不使用轮询替代产品原生监听。

## 验证

- 修复前新增 Taro 两项确定性回归失败，日志 `.tmp/rollup3-inflight-before.log`。
- 修复后，`CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-invalidation.test.mjs scripts/ci/demo-matrix/rollup-watch.test.mjs scripts/ci/demo-matrix/rollup-file-identity.test.mjs scripts/ci/demo-matrix/rollup-source-identity.test.mjs --update=none`：4 文件、37 项通过。包含三个框架实际解析版本、CJS/ESM、文件/目录依赖、连续保存、删除重建与原生句柄身份。
- `pnpm exec eslint scripts/ci/demo-matrix/rollup-invalidation.test.mjs` 通过。
- pnpm 的 `patch-commit` 子命令生成补丁后进入全图依赖解析，未完成的解析按归属终止；随后只同步现有锁文件的补丁 SHA-256。还原这 223 处哈希后，锁文件与起点逐字一致，没有依赖版本变化。`CI=1 pnpm install --frozen-lockfile --offline` 通过并应用新补丁。

## 适用边界

补丁仅影响本仓冻结安装的 Rollup `3.30.0`，不会随公开 npm 包安装，无公开包 change intent。原生事件回归在本机 macOS 通过；Linux 首次失败保留，不能将本地结果写成该远端任务已通过，也不声称完成 Windows 实机复验。升级 Rollup 时须重跑上述持久回归并评估移除补丁，相关历史见 [Rollup 4 缓存交接修复](pr-1169-ci-watch.md)。

## 规则评估

不新增 AGENTS。通过覆盖框架实际消费版本的持久回归，防止仅同步新版本补丁而漏掉旧工具链。
