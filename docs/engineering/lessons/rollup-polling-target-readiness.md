---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1291
baseline: 287de1a1cbd4259bee565b8225c774acde50735d
regressions:
  - scripts/ci/demo-matrix/rollup-polling-identity.test.mjs
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
---

# Polling 回归的目标文件就绪边界

## 症状

源码 PR 的 [Portable 枚举 job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38322754825/job/115055833562) 在执行 demo 脚本测试时失败。Taro/Vite 的 Rollup 3.30.0、CJS、目录依赖、`atime=false` 场景，5 秒内没有收到满足不同 inode、相同 size/mtime 和目标 atime 的 raw 事件，后续 change 与真实构建断言尚未执行。依赖此枚举的 Portable Gate 随后失败，不是第二个根因。

## 根因与纠正

夹具先读到初始构建输出，再等待 Chokidar 的全局 `_readyEmitted`。内嵌 Chokidar 首次 ready 后将 `_emitReady` 替换为空函数，后续 `add()` 不重置该状态；因此它不能证明目录依赖的叶子文件已完成异步扫描和订阅登记。替换过早时，监听建立可能只看到新 inode，无法取得用例要求的替换前基线。

在真实文件替换前，额外等待目标文件的非空 `_closers` 记录，使用 `path.resolve` 比较实际登记键。目录模式也必须等待叶子文件，而非只检查父目录。原有 5 秒轮询与 15 秒用例预算保持不变；raw、change、失效通知与实际输出 6 的断言完整保留。

新增一个真实目录场景，在 Chokidar 的异步添加入口暂时阻断目标订阅：先证明全局 ready 为真而目标没有 closer，再以 50 ms 故障注入延迟放开登记。旧握手在同一 raw 断言稳定失败，新目标握手通过。该计时器仅用于制造订阅延迟，不作为被测操作的就绪判据；异常清理先释放自有闸门、清除计时器，再关闭 watcher 和恢复 spy。

## 验证

macOS、pnpm 12.9.1，包含未提交修复的工作树：

- Node 24.18.0：延迟场景在加入目标握手前 1 failed / 24 定向过滤 skipped，失败位置与远端相同；加入握手后 1 passed / 24 定向过滤 skipped。
- Node 24.18.0：`CI=1 pnpm test:demo:matrix`，43 个文件、299 项测试通过，显式 `--update=none`。
- Node 22.22.3：定向执行 polling 与 invalidation 两文件，40 项通过，其中 polling 25 项包含新的故障注入。

修复的远端 PR Gate 和完整版本 CI 待新提交验证。旧 head 的成功或失败不替代新 head 验收。

## 适用边界

只修复测试准备阶段的目标订阅握手，不修改 Rollup 补丁、锁文件、实际文件替换、业务构建或 CSS 快照。closer 证明订阅登记；后续 raw 断言仍独立证明原生 polling 取得正确的前后文件状态，不将登记状态当作原生采样成功。

## 规则评估

不新增 AGENTS 规则。现有首次加载、目标身份、时序和证据要求已覆盖该问题；用真实延迟回归固定具体生命周期边界。
