---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 63f883bd7f559ace6eed2b4c7074a1f8b4fb2a42
regressions:
  - scripts/ci/demo-matrix/rollup-recreation.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-lifecycle.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-fixture.test.mjs
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

`c19d19c9e` 的 macOS 183 项通过没有覆盖更快的连续重建。随后 [Ubuntu CI](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37256821213/job/111595577130) 在连续恢复用例超时，并出现 `fs.watch` spy 自递归。本地 Linux arm64 / Node 24.21.0 容器复现了相同问题；将外层测试预算与单次事件期限分开后，首次偏离明确为第二轮 delete 丢失。原生事件轨迹显示首轮 add 后 53ms 的真实删除仍命中上一轮 100ms remove 去重记录。更快的 1ms 状态检查也让 macOS CJS/ESM 在修复前稳定报告 `cycle 2: delete`。

只清除 remove 记录仍不完整：Linux 更快重建后，第三轮收到多个 native 事件却没有进入 `_remove`。5ms watch 去重记录中的 retry 捕获旧 listener；新监听沿用该记录而不安排自己的对账，旧 retry 又被有效状态检查拒绝。修复将这两种记录限定在文件订阅代次内：只有新 native binding 成功后才取消旧 retry 并调用两种记录的 `clear()`，同时取消其定时器。绑定失败仍保留原恢复流程，同一代内继续去重，不放宽阈值。

测试自身的超时也是独立缺陷。Vitest 超时后不会等待测试函数中的 finally，下一例可能把上一例尚未恢复的 `fs.watch` spy 当作原始函数，导致递归。fixture 现在在模块级保存原始函数，使用 `TestContext.signal` 同步关闭 watcher、恢复本例 spy 并释放屏障；异步等待可响应 abort，返回后再次检查取消。`onTestFinished` 等待 body 和幂等清理结束后才允许下一例开始。新增 CJS/ESM × release/pending 四项回归，覆盖释放后禁止重新监听、永不完成的 Promise 可取消、原生句柄清零和重复清理不影响下一例 spy。

新完整轮次 `ef579d67` 在第 15 阶段又出现 CJS `create` 超时，首次失败和 562 个已退出进程的审计已归档。单文件有界复测通过，随后连续重建用例也间歇失败，不能归为单一测试 mock 或机器负载。此前测试为固定 stat→bind 窗口禁用了整个 `_addToNodeFs`，会吞掉真实目录事件；现改为只在目标的原生绑定前同步删除真实文件，让真实 ENOENT 触发恢复，再验证再次创建和后续更新。fixture 在超时时保留最近 100 条本例原生事件、绑定状态、恢复记录与节流状态，诊断只读观察被测状态。

明确遗漏是第三种跨代节流：`add` 虽然设置零延时，其清理定时器仍可能晚于下一次文件 I/O 执行。新文件绑定成功并消费恢复记录后，旧 `add` 记录令 `_throttle` 返回 false，创建事件被丢弃。新增 CJS/ESM 回归先接收真实第一轮 add，仅暂停该旧记录的过期，再执行真实删除和重建；修复前两项都在 second create 的 5 秒期限失败。成功绑定时现在同时清理旧 `add`，保留绑定失败时的恢复记录及同一代去重。两项修复后均通过，不增加等待、重试或轮询兜底。

## 验证

- 修复前持久用例证明提前重建、stat 到绑定之间再次删除、重复目录登记三类失败。
- 初次 macOS 验证 28 文件、183 项通过，但后续 CI 证明连续快速重建覆盖不足；不得把这一结果当作跨平台完成。补齐修复后 `CI=1 pnpm test:demo:matrix`：29 文件、187 项通过，脚本固定 `--update=none`。覆盖三个框架实际解析的 Rollup、CJS/ESM、文件/目录 transform 依赖、原子保存、删除恢复及现有矩阵检查。
- 文件恢复与 fixture 的 36 项回归包含注册屏障、`atomic=false`、连续重建、暂停恢复时取消、取消后重新加入、事件回调中同步取消、stat 尚未返回时取消，以及实际 `fs.watch` 句柄关闭断言。
- 修改的 fixture、fixture 回归与 lifecycle 回归均通过定向 ESLint。
- 本地 Linux arm64 容器（Node 24.21.0、Debian bookworm）使用与候选补丁 SHA256 一致的 Rollup 3 文件，三份测试 36 项通过。测试临时目录在容器原生文件系统中；诊断 harness 直接解析复制的 Rollup，并非整套框架矩阵。失败及修复日志保存在 `.tmp/linux-rollup-recovery/`，包括 `before.log`、`delete-trace.log`、`second-deviation.log` 和 `after-generational-throttles.log`。
- `CI=1 pnpm install --frozen-lockfile --offline` 通过。pnpm `patch-commit` 生成补丁时会重新解析全图；未保留无关依赖更新。锁文件仅替换 223 处 Rollup 3 补丁哈希，反向替换后与起始锁文件逐字一致。

- `ef579d67` 之后的新修复：`CI=1 pnpm test:demo:matrix` 29 文件、189 项通过，定向 ESLint、冻结离线安装与差异检查通过。锁文件只替换 223 处补丁哈希，未保留 `patch-commit` 的无关依赖解析更新；补丁 SHA256 为 `dfb3e7b05589fc5f55ebe6a0d28bddd5477935c88f31627004ab7cc283f3fcba`。Linux arm64 / Node 24.21.0 bookworm 容器的 3 文件 38 项也通过，CJS/ESM 文件 SHA256 与候选补丁一致；临时目录使用容器原生文件系统，容器退出后删除。首次容器因依赖目录只读在运行测试前失败，调整为容器内可写副本后才执行测试，两个日志均保留。

## 适用边界

真实文件系统验证来自 macOS 和本地 Linux arm64 容器；使用原生 `fs.watch`，单次事件期限仍为 5 秒。外层用例期限为 20 秒，用于串行步骤及清理，失败仍在首次事件等待的 5 秒处明确报告。没有用文件系统 polling 代替原生事件，也未获得本修复的 Windows 实机验收。

本修复覆盖父目录存在时的文件删除重建及依赖订阅生命周期，没有宣称支持任意祖先目录树删除后恢复。补丁只影响本仓冻结安装，不随公开包发布，因此不增加公开包 change intent。没有 demo 或样式输出修改，无需变更 static 基线。

升级 Rollup 或移除本仓共享 watcher 补丁时，需重跑上述回归并核对实际框架解析版本；不能仅因上游版本号更新就移除补丁。最终提交仍需新一轮 extended preflight 和完整流程，本文的定向通过不替代全端验收。

## 规则评估

不新增 AGENTS。通过真实文件事件、可控注册窗口和资源关闭回归补足生命周期边界，避免继续累积上层重试或放宽验收期限。
