---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 95383ff6dacfca22dd11f30740e275bb2e765cc9
regressions:
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/ci/css-compat-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/env-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/local-worker-workflow.test.ts
  - scripts/ci/demo-matrix/matrix.test.mjs
---

# PR #1330 的 macOS ARM runner 容量阻塞

## 症状

准确基线的 [Native darwin-arm64](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41849290271/job/126641256923)、CSS compatibility、Environment package、Platform watch 和 Platform utilities 共七个任务因 hosted runner 获取失败被取消。API 原件显示 runner_id 为 0、steps 为空、日志返回 404；annotation 明确报告多次尝试仍未取得 hosted runner，并指出 macOS ARM 容量不足。它们没有执行 checkout，不能当成产品测试失败，也不能记为通过。

[PR Gate](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41849289992) 的 Portable 矩阵随后剩余 134 项：macOS 52 项排队，Linux 41 项排队，Windows 40 项排队、1 项运行。当时 11 个 macOS 任务已有 runner_id=0，1 个 Windows 任务运行，与 12 并发上限一致，支持获取瓶颈占槽的解释；这不是调度器内部槽位的直接观测，也没有证据认定 Linux 和 Windows 存在容量故障。后续六个 Portable macOS 任务也在未执行步骤时被取消，已保存同类原件，累计十三个容量取消。

## 根因与纠正

这是 runner 获取阶段的基础设施阻塞，尚无执行中的源码首错。[runner-images 的镜像清单](https://github.com/actions/runner-images/blob/cbb0ec6433933cd83d6c749bffbb24a2513388be/README.md)将 macos-latest 指向 macOS 26 ARM，macos-15 仍为受支持的 macOS 15 ARM。当前通用门禁和 Rust 构建没有显式 macOS 26、Xcode 26 或特定 SDK 要求。

仅将本轮实际执行的 PR Gate、Native ARM、CSS compatibility、Environment package，以及 Portable 生成矩阵固定到 macos-15。同步报告 gate 的 darwin 映射，保留所有 demo、Node 组合、阶段、原生八目标、预算、并发与准确 SHA 验证。Native 仍要求 aarch64-apple-darwin 与真实 hostNativeTarget 一致；Intel 仍单独运行 macos-15-intel，不以 Intel 代替 ARM。

本轮未执行的 CI、E2E Watch、nightly consumer 和可选性能任务保留 latest。共享 Native 生产者固定 macOS 15 后，nightly 消费者仍可在 macOS 26 ARM 验证真实发布产物。RN 的 Intel/Xcode 26.3 和 Lynx 既有环境不变。

## 验证

本地 macOS、Node 24.22.1，在 b446b2ea670ae8735a92b719051460c85ef9f10a 加未提交调整的 worktree 中运行：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflows.test.ts test/ci/css-compat-workflow.test.ts test/ci/env-workflow.test.ts test/ci/local-worker-workflow.test.ts --update=none --coverage.enabled=false`：4 文件、59 项通过。
- `CI=1 pnpm test:demo:matrix`：75 文件、1240 项通过，验证完整矩阵、各系统案例集合、报告身份以及缺证和失败拒绝。首次误重复传入脚本已有的 `--update=none`，在 CLI 解析阶段失败，未执行测试；移除重复参数后复验。
- 对四份工作流执行 `actionlint` 通过。最终准确 head 的远端 runner 获取、真实 ARM 构建与完整矩阵仍待验收。

## 适用边界

当前 PR 的通用 macOS 证据来自 macOS 15 ARM，不能写成已执行 macOS 26。镜像固定只能改变调度目标，不保证另一池容量，也不能替代真实测试；若新标签同样无法取得 runner，继续保留原始取消记录并阻断合并。不重跑已确认无须重跑的旧 head 全矩阵，不放宽失败、缺证或取消条件。

## 规则评估

不新增 AGENTS 规则。既有“区分基础设施与产品失败”“准确 head 验证”和“保留原门槛”的规则足够，使用现有矩阵与报告契约防止标签变化丢失平台覆盖。
