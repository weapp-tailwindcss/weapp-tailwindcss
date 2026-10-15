---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 0f6286647d3c874d4f3650ea92837ca3b8283bd4
regressions:
  - scripts/agents/check.test.mjs
---

# 复盘回归引用兼容实际测试命名

## 症状

全面验收修复需要将已有 Playwright 用例登记到复盘的 `regressions`。规则检查器却把实际存在的 `website/tests/english-content.spec.ts` 报为“复盘回归路径无效”，导致合法的持久回归无法登记。

## 根因与纠正

`validateLesson` 将测试文件名限定为 `.test`，没有兼容同样用于测试入口的 `.spec`。问题发生在元数据校验边界，与用例本身是否通过无关。

允许 `.test` 和 `.spec` 使用相同的既有扩展名集合：`ts`、`js`、`mts`、`cts`、`mjs`、`cjs` 和 `rb`。只调整测试命名识别，继续要求引用为仓库内存在的相对路径，继续拒绝 POSIX、Windows 和 UNC 绝对路径、仓库外路径、缺失文件及不支持的扩展名。

持久回归对两种命名运行相同校验，其中仓库外文件和不支持的扩展名文件真实存在，避免仅凭不存在的路径间接证明边界。

## 验证

macOS、Node 24.18.0、pnpm 12.9.1、Vitest 5.0.4，基线上叠加本次未提交修复：

- `pnpm install --frozen-lockfile` 通过，没有修改锁文件。
- 新回归在修复前复现 `website/tests/english-content.spec.ts` 被拒绝：1 项失败，63 项通过；修复后 `CI=1 pnpm agents:test --update=none` 的 64 项全部通过。
- `CI=1 pnpm agents:check` 通过，报告 0 个错误。
- `CI=1 pnpm exec eslint scripts/agents/check.mjs scripts/agents/check.test.mjs` 和 `git diff --check` 通过。

## 适用边界

改动仅影响复盘的测试引用校验，不执行引用的测试，不改变测试运行器、文件扩展名集合或路径安全条件。没有公开包行为变化，无需 change intent。Windows 与 Linux 未实机验证；回归使用 Node 路径 API，并在当前环境显式覆盖两种系统的绝对路径表示和 UNC 路径。

## 规则评估

不修改或新增 AGENTS。修复检查器对现有测试命名的遗漏，用可执行回归维护既有安全边界。
