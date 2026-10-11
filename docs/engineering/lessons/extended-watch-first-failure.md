---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 6d2eb5064f9ffb35429e551a7b57309bd05bc5e4
regressions:
  - e2e/demo-workflow-environment.test.ts
  - e2e/demo-workflow-extended.test.ts
  - e2e/watch-command-lifecycle.test.ts
---

# 扩展验收保留 watch 首次功能失败

## 症状

Alpha 5.31 的 uni-app x 流程在小程序 watch 首轮模板断言失败后，默认自动启动第二个完整 watch 会话。首轮产物已经足以定位安全类断言与 CSS 丢失问题，重新构建延迟了报告，还再次触发了 HBuilderX 间接启动微信 CLI 的路径。

## 根因与纠正

扩展工作流清除了缩小覆盖的筛选参数，却没有覆盖 watch 入口默认的两次尝试。现在扩展环境固定 `E2E_WATCH_MAX_ATTEMPTS=1`，普通 watch 的配置保持兼容。已存在的性能异常有界确认由独立开关控制，保留首次样本，不改采样次数和阈值。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-environment.test.ts e2e/demo-workflow-extended.test.ts e2e/watch-command-lifecycle.test.ts --update=none`：3 文件、25 项通过。覆盖未配置、默认两次和外部十次尝试的输入，确认扩展入口固定一次且不修改来源环境；保留性能确认配置。定向 ESLint 通过。

本轮原始报告为 `e2e/.artifacts/uni-app-x-alpha/d238a3c8-3e5e-4e35-9af2-1d6b2e183474/`。前六阶段完成，第七阶段失败并主动取消，后九阶段未执行。原临时编排器先抛清理异常、后记录阶段结果，导致该阶段误标 `not-run`；现已保留原报告副本并添加首次失败、取消和后续收尾核查，不改写原日志。

## 适用边界

该变更只修正扩展验收的重试策略，不宣称修复 watch 样式或厂商启动行为。取消时外层有界进程清理未及时确认成功；后续核查本轮已登记的 runner、launcher、CLI 进程均不存在，源码恢复且工作树干净。不能以最终退出掩盖此前清理失败，也不能把普通超时回归通过当作整个嵌套 IDE 取消链已验收。

## 规则评估

不新增 AGENTS 规则，使用现有首次失败保留与失败停止要求，并以入口回归固化。
