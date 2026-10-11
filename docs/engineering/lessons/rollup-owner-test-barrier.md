---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 915187cc62a20faa2f5f96e38da784f418746a54
regressions:
  - scripts/ci/demo-matrix/rollup-recreation-owner.test.mjs
---

# 取消恢复 stat 的回归必须先安装拦截

## 症状

本地 demo 编排矩阵在 CJS 的“旧恢复 stat 不能借立即重新 watch 复活订阅”用例达到 15 秒总超时，另 239 项通过。[Windows Node 24 CI](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37306286656/job/111750638734) 同一用例的 ESM 形态也超时。该 CI 尚未进入 demo 的 live/watch 阶段，后续缺少 watch-diagnostic 的上传错误是跟随错误。

## 根因与纠正

测试先删除文件、等待 `pending.closer`，再拦截 `_addToNodeFs`。生产实现注册 closer 后立即开始首次恢复 stat；测试看到 closer 时，该 stat 已可能在途。文件重建后它可以先完成恢复，删除 pending 并安装正常订阅，从而永远不调用迟到的测试拦截器；`finished.promise` 没有产生者，最终被总超时取消。

临时诊断在删除前挂起首次恢复调用，保留原来的迟到拦截，重建文件后释放首个调用。CJS/ESM 均确定性复现“目标 stat 未进入”：trace 显示 create 已产生、pending 已清除、文件 closer 已存在，目标拦截仍未触发。该诊断保存在 `.tmp/ci-audit/rollup-owner-barrier-before.log`。

持久用例现在于删除之前安装拦截，由被拦截的首次恢复调用同步重建文件，然后启动真实异步 stat、取消旧订阅并立即重新 watch。新订阅仍暂停至旧 stat 完成，保留旧 owner 不能发事件或安装 closer 的断言，再释放新 owner 并验证实际文件更新。先等待明确的“目标恢复 stat 已进入”阶段，使进入失败带上现有 trace；没有延长总超时或修改 Rollup 补丁。

## 验证

`CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-recreation-owner.test.mjs --update=none`：CJS/ESM 两项通过，耗时不足一秒。原始总超时、屏障复现及修复后日志分别保存在 `.tmp/ci-audit/browser-matrix-final.log`、`rollup-owner-barrier-before.log`、`rollup-owner-after.log`。

`CI=1 pnpm test:demo:matrix`：37 文件、240 项全部通过，包含浏览器导航及文档就绪回归；日志为 `.tmp/ci-audit/rollup-owner-matrix-final.log`。ESLint、规则与 diff 检查通过。

## 适用边界

这是已证实的测试编排竞态修复，不能据此把任意原生文件系统丢事件都归因于测试。实际 Windows CI 仍需验证当前提交。没有改公开包、依赖 patch、样式产物及性能门槛，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS。用状态转换前安装的屏障保证观察目标，不用“资源已注册”推断异步工作尚未开始。
