---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/45491080803
baseline: c99071b7d7bc7cd85e2550aa2a497c4460ad440e
regressions:
  - e2e/apps-generator-mode-compare.test.ts
verification:
  - claim: generator 构建矩阵与更新后的 apps-generator 快照一致
    kind: integration
    status: passed
    sha: c99071b7d7bc7cd85e2550aa2a497c4460ad440e
    environment: macOS arm64、Node 26.13.1；仓库基线加本轮未提交快照更新，pnpm 12.21.0 frozen install 后验证
    command: pnpm dlx --package=pnpm@12.21.0 pnpm run e2e:apps-generator
  - claim: 修复 PR 的 hosted CI/CD 全部必需门禁通过
    kind: ci
    status: pending
    sha: c99071b7d7bc7cd85e2550aa2a497c4460ad440e
    environment: GitHub Actions；快照修复 PR 尚未创建
    reason: 需在修复 PR 的准确提交上确认 CI 与 PR Gate
---

# 合并后 Generator 快照失败

## 症状

合并 PR #1365 后，CI run [45491080803](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/45491080803) 的 `E2E Focused Gate (apps-generator)` 失败。其余项目构建成功，uni-app Vite v4 的 `web-compact`、`app-android` 与 `app-ios` 快照报告和 CSS artifact 仍记录兼容转换前的字节数与表达式。

## 根因与纠正

PR #1365 为 legacy Web 兼容静态计算纯数字 typed division。生成 CSS 中，Tailwind 默认 line-height 的 `calc(1 / 0.75)` 等表达式改为数值，选择器数量与样式语义断言保持一致，但 H5 compact 和 App 构建产物字节数改变。初次合并时没有同步这些 apps-generator 静态基线。

仅重生成 `uni-app-vite-tailwindcss-v4` 项目受测平台的基线。实际差异限于 `web-compact`、Android 和 iOS 报告及对应 CSS artifact，没有改 mini-program、普通 H5 或其他 demo 的产物基线。

## 验证

- `pnpm install --frozen-lockfile`：使用 pnpm 12.21.0 完成独立 worktree 安装。
- `pnpm dlx --package=pnpm@12.21.0 pnpm run build:ci`：通过。
- `E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm dlx --package=pnpm@12.21.0 pnpm run e2e:apps-generator:u`：为该项目全部受测平台重新生成基线，12 项通过。
- `pnpm dlx --package=pnpm@12.21.0 pnpm run e2e:apps-generator`：完整 generator 矩阵 12 项通过，禁止更新快照。
- 修复 PR 的 hosted CI/CD 待验证。

## 适用边界

兼容转换行为在 PR #1365 已实现并由其代码测试覆盖。本次修复只补齐合并后遗漏的快照基线，不改变 CSS 实现。

## 规则评估

不新增 AGENTS 规则。现有 static 快照同步和远端准确 head 验证要求足以覆盖本问题。
