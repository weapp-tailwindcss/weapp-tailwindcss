---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1175
baseline: b6026b5906cd564974d759581bb0ce9b7691c262
regressions:
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
---

# Rollup 补丁需要覆盖实际解析到的版本

## 症状

PR #1175 的 Ubuntu uview demo 在 replace 阶段通过后，add 阶段不再触发编译。重复运行仍失败，其他 uni-app demo 通过。

## 根因与纠正

`uni-app-vite-tailwindcss-v4` 的 Vite 5 解析到已打补丁的 Rollup 4.63.0，`issue-uview-plus-cssentries` 的 Vite 7 解析到没有补丁的 4.63.1。升级依赖后，按精确版本注册的补丁不会自动继承。

扩展真实依赖链回归后，4.63.1 的文件状态去重及 CJS/ESM 构建期间失效测试均失败，4.63.0 通过。按 4.63.1 发布文件重新生成同等补丁，同时注册两个版本并同步锁文件。测试通过各 demo 的 Vite 解析 Rollup，避免只测试固定旧版本。

构建期间失效用例在进入 transform 后立即发布下一版本，可能早于原生事件去重窗口结束。该用例使用真实 polling watcher 观察状态变化，以独立验证缓存生命周期；原生 watcher 的连续原子替换仍由 `rollup-watch.test.mjs` 验证。相同 polling 用例在未打补丁的 4.63.1 上仍然失败，在打补丁版本上通过。

## 验证

- `pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-invalidation.test.mjs scripts/ci/demo-matrix/rollup-watch.test.mjs --update=none`：修复前 4.63.1 三项失效回归失败；修复后两个版本的 14 项回归通过。
- `pnpm --filter weapp-tailwindcss... build`：通过，包含声明构建。
- `pnpm exec node scripts/ci/demo-matrix/run.mjs issue-uview-plus-cssentries:mp-weixin issue-uview-plus-cssentries:mp-alipay`：本地两端生产构建、initial、replace、add、restore 均通过；生产产物与现有 static 基线一致，未改写基线。

## 适用边界

补丁限定为 Rollup 4.63.0 和 4.63.1，后续版本需重新验证。这里的本地验证为 macOS；Linux、Windows 的最终证据以 PR 当前提交的 CI 为准，不将 CLI 产物验收表述为设备验收。

## 规则评估

不新增 AGENTS 规则。用实际依赖链的可执行测试约束补丁覆盖，避免维护重复的版本清单。
