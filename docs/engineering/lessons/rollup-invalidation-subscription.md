---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: bb55fbaffaabc5480ae6babba6f968d0afd2ea60
regressions:
  - scripts/ci/demo-matrix/rollup-invalidation.test.mjs
  - scripts/ci/demo-matrix/rollup-polling-identity.test.mjs
---

# 构建完成与文件订阅的验收边界

## 症状

PR #1314 的 `bb55fbaffaabc5480ae6babba6f968d0afd2ea60` 在 Windows Node 24 的前置 demo 矩阵失败：run `39609119708`、job `119253016087`，Taro Rollup ESM 的目录依赖用例等待首次增量进入 transform 超时。真正的 Gulp 抖音重复 watch 未执行；该作业没有生成可上传工件，不能借用其它矩阵单元的结果。

## 根因与纠正

该用例将首轮 `END` 视为监听完成，但 `END` 只承诺构建结束。`FileWatcher.watch` 调用异步 `watcher.add`，目录扫描可能尚未登记目标叶子的订阅。首次原子替换发生在这段空隙时，`ignoreInitial` 可能将新内容当作初始状态。原失败缺少 raw/change/订阅轨迹，因此不能断言它实际经历了这一时序；源码中的前置条件缺口可以确定性复现。

故障注入延迟真实 `_addToNodeFs` 的叶子注册，在首轮构建已经完成后证明首次改写不能提前开始。旧逻辑立即违反此前置条件。修复按宿主路径身份等待目标叶子存在非空 `_closers` 后再改写，保留原五秒预算，以及写入 1、暂停 transform、写入 2、检查 invalidate、恢复并得到 4、写入 3 并得到 6 的完整链路。没有 sleep、伪造事件或生产生命周期变更。失败消息追加有界构建、raw/change、invalidate、transform 和订阅轨迹。

## 验证

本地定向验证：

```sh
CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts \
  scripts/ci/demo-matrix/rollup-invalidation.test.mjs \
  scripts/ci/demo-matrix/rollup-polling-identity.test.mjs --update=none
```

两文件 41 项通过。确定性红证据保存在任务的 `.tmp/rollup-subscription-red.log`；修复后的当前 head 仍需独立 CI，不能继承旧提交结果。

## 适用边界

这是测试驱动的订阅前置条件修复，不将生产 Rollup 的 END 事件扩写为全量目录扫描合同。原 Windows 失败保留；本地通过不替代 Windows 当前 head 的实际结果。未改 demo 或样式输出，无需更新 static 基线。

## 规则评估

现有按实际生命周期与有界证据验收的规则足够，无需新增规则。失败诊断保留首轮之后的 ERROR，避免真实构建异常只表现为后续等待超时。
