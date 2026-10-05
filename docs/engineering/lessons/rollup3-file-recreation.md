---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 63f883bd7f559ace6eed2b4c7074a1f8b4fb2a42
regressions:
  - scripts/ci/demo-matrix/rollup-recreation.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-lifecycle.test.mjs
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
---

# Rollup 3 文件删除后的恢复订阅需要完整生命周期

## 症状

扩展全面测试 `1daad857-ca5b-41f2-ab18-e549f2a804f7` 在第 15 阶段 `test:demo:matrix` 停止：Taro ESM 文件依赖删除后已收到真实构建错误，重建为 `value: 4` 后却始终没有新产物，预期 `{ value: 4, derived: 8 }`。同一测试文件单独运行也失败；阶段 16—46 没有调度，不能归为全仓负载噪声。首次日志保留在该 run 的 preflight 和 full-regression artifacts。

## 根因与纠正

Taro 实际解析本仓补丁版 Rollup `3.30.0`。此前合并模块与 transform watcher 后，同一个 Chokidar 实例会管理多个目录；其删除恢复却只在 `_watched.size === 1` 时订阅父目录。`Task` 错误路径再次调用 `add` 也不足以恢复：注册包含异步 stat，文件提前出现会被 `ignoreInitial` 当作初始文件；带目标的父目录订阅又没有在绑定后读取最终状态。

新增回归暂停真实注册，删除文件并等待真实 ERROR，再原子重建和释放注册。修复前，CJS/ESM、`atomic=true/false` 的四个文件注册窗口均保留旧产物。父目录注册窗口也观察到失败。候选修复后，原有目录依赖用例再次失败，继续检查发现两个相关生命周期问题：

- stat 之后、原生绑定之前文件消失，原实现仍添加 tracking 并发送虚假的 `add`。两个确定性用例在真实文件系统上复现该行为。
- 每次构建保留目录依赖仍重复调用 `watcher.add`，四轮登记累积四个回调。CJS/ESM 的资源回归均在修复前失败。

补丁在 CJS、ESM 同步实现：用按文件身份管理的恢复记录等待重建；先订阅父目录，再对账目标文件；只有原生绑定成功后才登记文件、消费恢复记录并发送事件。`unwatch` 和 `close` 取消临时恢复句柄，晚到注册不能恢复已取消路径。新增和 inode 替换均先完成句柄归属再通知，允许事件回调同步取消。

独立审查还发现：取消发生在原生回调的异步 stat 期间，迟到回调仍会发送 update 并重新绑定。CJS/ESM 的新增回归先真实替换文件、启动真实 stat，再同步 unwatch，在修复前均失败。每个文件绑定现在维护有效状态和代次；stat 成功与异常分支都拒绝已取消或已换代的结果。

FileWatcher 只在首个路径别名加入时建立订阅，每次仍刷新 transform 依赖身份；最后一个别名移除时取消订阅。删除 Linux/FreeBSD 每个事件都 `unwatch/add` 的旧补救逻辑，跨平台 inode 重绑和删除恢复统一由底层负责。保留此前路径别名、状态去重及[构建期间失效交接](rollup3-inflight-invalidation.md)补丁。

上游 [Chokidar #1437](https://github.com/paulmillr/chokidar/issues/1437) 也报告共享 watcher 的事件丢失，[PR #1442](https://github.com/paulmillr/chokidar/pull/1442) 修复的是不同 target 共用目录扫描节流键。Chokidar 5.0.0 已包含该修复，但其 [`_remove`](https://github.com/paulmillr/chokidar/blob/5.0.0/src/index.ts#L879) 仍保留单目录限制，[目标目录注册](https://github.com/paulmillr/chokidar/blob/5.0.0/src/handler.ts#L654)仍跳过初始扫描，不能据此认定本次问题已由上游发布版解决。原版 Rollup 为 transform 依赖建立独立 watcher；这里的已证事实针对本仓共享 watcher 补丁，不声称已复现未打补丁的原版。

## 验证

- 修复前持久用例证明提前重建、stat 到绑定之间再次删除、重复目录登记三类失败。
- `CI=1 pnpm test:demo:matrix`：28 文件、183 项通过，脚本固定 `--update=none`。覆盖三个框架实际解析的 Rollup、CJS/ESM、文件/目录 transform 依赖、原子保存、删除恢复及现有矩阵检查。
- 新增 32 项回归包含注册屏障、`atomic=false`、连续重建、暂停恢复时取消、取消后重新加入、事件回调中同步取消、stat 尚未返回时取消，以及实际 `fs.watch` 句柄关闭断言。
- `CI=1 pnpm exec eslint scripts/ci/demo-matrix/rollup-recreation.test.mjs scripts/ci/demo-matrix/rollup-recreation-lifecycle.test.mjs` 通过。
- `CI=1 pnpm install --frozen-lockfile --offline` 通过。pnpm `patch-commit` 生成补丁时会重新解析全图；未保留无关依赖更新。锁文件仅替换 223 处 Rollup 3 补丁哈希，反向替换后与起始锁文件逐字一致。

## 适用边界

本轮真实文件系统验证来自 macOS；使用原生 `fs.watch`，未以 polling 或增加 5 秒预算代替修复。测试随 demo matrix 在其他平台执行，但这里不声称已经取得本提交的 Linux/Windows 实机结果。

本修复覆盖父目录存在时的文件删除重建及依赖订阅生命周期，没有宣称支持任意祖先目录树删除后恢复。补丁只影响本仓冻结安装，不随公开包发布，因此不增加公开包 change intent。没有 demo 或样式输出修改，无需变更 static 基线。

升级 Rollup 或移除本仓共享 watcher 补丁时，需重跑上述回归并核对实际框架解析版本；不能仅因上游版本号更新就移除补丁。最终提交仍需新一轮 extended preflight 和完整流程，本文的定向通过不替代全端验收。

## 规则评估

不新增 AGENTS。通过真实文件事件、可控注册窗口和资源关闭回归补足生命周期边界，避免继续累积上层重试或放宽验收期限。
