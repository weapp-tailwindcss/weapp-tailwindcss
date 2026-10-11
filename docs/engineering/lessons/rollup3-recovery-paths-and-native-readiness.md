---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e7d12cbdbfcb87a32a9695b23c274ee8f5676b31
regressions:
  - scripts/ci/demo-matrix/rollup-closer-identity.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-readiness.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-owner.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-timer.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-error.test.mjs
  - scripts/ci/demo-matrix/rollup-recreation-fixture.test.mjs
---

# Rollup 3 的跨平台句柄身份与原生监听就绪窗口

## 症状

[Windows 诊断](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37290323279)在真实框架 watch 开始前，先于 `test:demo:matrix` 出现 38 项 closer/ready 失败。原生 Windows 路径用于查找 Chokidar 的正斜杠键，测试首先无法确认注册；底层释放也存在相同的路径身份分裂。

修正路径后，macOS 矩阵首次仍有 1 项失败：`new file generation is not suppressed by a delayed add throttle (esm)` 在 first create 超时。轨迹显示真实文件删除后父目录监听已返回句柄，但后续 5 秒没有 native 事件。该失败发生在 add 节流断言之前，不应继续归因于上一轮去重问题。

## 根因与纠正

Rollup 3.30.0 内置 Chokidar 在 add 边界使用 `normalizePathToUnix`，但 `_remove` 构造的是宿主路径。`_addPathCloser` 和 `_closeFile` 现在复用同一既有规范化函数；测试查询通过 `path.resolve` 比较身份。真实 bundled 方法覆盖盘符、UNC、根相对和普通相对路径的两种分隔符，不用 macOS 文件名模拟 Windows 句柄。

[前次记录](rollup3-file-recreation.md)中的“先订阅，再检查一次最终状态”并不能证明原生事件流已就绪。[libuv 1.52.1 的 macOS FSEvents 实现](https://github.com/libuv/libuv/blob/v1.52.1/src/unix/fsevents.c#L763)异步通知 CF 线程安装流，流从 `kFSEventStreamEventIdSinceNow` 开始观察。不能从 `fs.watch` 返回推导此前空窗里的创建一定会补发。首次轨迹不足以证明当时精确的 CF 线程顺序，因此另加确定性屏障：目录登记返回 disposer，但直到已观察到 create 后才允许实际原生目录订阅；期间仍执行真实文件写入和 stat，不伪造文件事件。修复前 CJS/ESM 都在原有 5 秒期限内失败。

每个缺失恢复记录现在拥有原生句柄和最多一个状态检查定时器，沿用 Chokidar 的 interval。只有 stat 或原生绑定明确返回 ENOENT/ENOTDIR 时才继续检查；目录、符号链接和其他错误不触发周期重试。成功绑定、unwatch、close、测试 abort 均释放本记录资源，`persistent: false` 的定时器不保持进程存活。已有文件继续使用原生监听，未将整个 watch 切换为 polling。

恢复调用还跨异步 stat 检查记录身份。取消后立即重新 watch 会清除 ignored 状态，但旧结果仍属于旧记录，不能借新订阅复活。绑定阶段保留真实错误码，EACCES/EMFILE 沿错误通道报告且不重复挂 timer；文件绑定后的同步错误也不能因 pending 已正常消费而被吞掉。

fixture 将初始化结束与 ready 竞速，并消费拒绝，避免启动失败留下永不完成的等待。诊断包装器与用例 spy 分离，避免同一 spy 再包装后自递归；失败轨迹保留原生关闭、错误、stat 和源码写入标记。

## 验证

- 路径身份回归修复前 16 项失败、修复后 16 项通过；就绪屏障修复前 CJS/ESM 两项失败。
- `CI=1 pnpm test:demo:matrix`：35 文件、234 项通过，入口显式固定 `--update=none`。包含实际框架解析的 Rollup、真实文件重建/后续更新，以及 16 项恢复/取消/关闭/abort 和 persistent 组合。
- `CI=1 pnpm install --frozen-lockfile --offline` 通过。锁文件只替换 223 处 Rollup 3 patch hash，反向替换与起始锁文件逐字相同，没有引入 `patch-commit` 顺带解析的版本更新。
- 首次矩阵失败、确定性失败、定向验证及最终矩阵日志分别保留于任务 `.tmp/ci-audit/rollup-matrix-after.log`、`rollup-readiness-before-owner.log`、`rollup-file-owner-targeted.log` 和 `rollup-matrix-file-owner.log`；定向日志中的两项 async add 消费者异常试验失败已保留，最终持久用例限定为同步 handler 责任边界，不把 EventEmitter 异步异常语义算作本次修复。

## 适用边界

这是本仓共享 watcher 补丁的修复，不声称原版 Rollup 存在完全相同的问题。上游背景和补丁移除条件仍见前次记录；升级后须用真实框架解析版本重新验证，不按版本号直接删除补丁。

本次真实文件系统验收来自 macOS；Windows 路径行为通过实际方法验证，Windows 原生 watcher 仍以新提交的 CI 为准。未扩展任意目录树或 `followSymlinks: false` 的类型转换生命周期，也未扩大对账到这些场景。完整本地 extended 流程仍需重新预检，234 项定向矩阵通过不能代替全端验收。

补丁仅影响本仓开发依赖，不随公开包发布，因此无需中文 change intent。没有 demo 或样式输出修改，无需重生成 static 基线。

## 规则评估

不新增 AGENTS。用路径、原生就绪屏障、错误分类及资源释放回归补足现有生命周期要求；纠正前次单次检查足够的结论，保留其失败历史，不放宽事件期限或性能门槛。
