---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1303
baseline: 52d086f3046683b7106f131e50cbc3c6cbeab0f9
regressions:
  - packages/weapp-tailwindcss/test/ci/release-metadata/git.test.ts
  - packages/weapp-tailwindcss/test/ci/release-scope.test.ts
  - packages/weapp-tailwindcss/test/ci/version-pr-route.test.ts
---

# 版本元数据的 Git 普通文件模式

## 症状

版本 PR #1303 的 [Version PR CI 38685002138](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38685002138) 在 `Bind current version PR` 失败，日志为“元数据不是普通文本文件：packages/postcss-calc/CHANGELOG.md”。审批及完整验收因此被阻断。

## 根因与纠正

该 CHANGELOG 在 main 与版本 PR 中均为 Git `100755 blob`。它是带执行位的普通文件，内容由 `git cat-file blob` 读取，不会执行；原读取器仅接受 `100644`，错误地把执行位当作文件类型边界。

读取器改为明确接受 `100644` 和 `100755` 两种普通 blob，继续拒绝 `120000` 符号链接与 `160000` gitlink。版本、CHANGELOG、intent、ledger 及源码混入的内容校验继续由原分类器负责，不通过修改文件权限或放宽版本 PR 身份解决误判。

同轮按用户要求，将两份待消费 intent 中主包的 minor 改为 patch；env 保留 minor。pnpm 发布计划确认主包及 CLI/native 固定组为 `5.6.3`，env 为 `0.2.0`。修复先进入 main，再由自动 prepare 生成版本分支。

## 验证

环境为 macOS、Node `24.18.0`、Corepack pnpm `12.9.1`、Vitest `5.0.4`。以下本地结果来自上述 baseline 加本轮未提交修复的独立工作树。

新增真实 Git 回归在旧实现下有 2 项失败、3 项通过；修复后，发布元数据、范围路由、版本身份、环境审批及工作流定向测试共 9 个文件、183 项通过：

```sh
pnpm --filter weapp-tailwindcss exec cross-env CI=1 vitest run test/ci/release-metadata.test.ts test/ci/release-metadata/ test/ci/release-scope.test.ts test/ci/version-pr-route.test.ts test/ci/version-pr-approval.test.ts test/ci/version-pr-workflow.test.ts test/ci/manual-version-gates.test.ts --update=none --coverage.enabled=false
pnpm release status
```

回归通过 Git index 的 `--cacheinfo` 构造文件类型，避免依赖 Windows 的符号链接权限或宿主文件系统执行位；同时覆盖两种普通模式、保留已有 CHANGELOG 执行位的合法版本 PR，以及符号链接和 gitlink 被拒绝并保留完整检查。

修复后直接调用 `validateVersionPrDiff`，已确认原 head `dada5e2138c5ea579b5ec33b85d56b6ae72af52c` 相对 baseline 的真实差异通过元数据校验。该结果仅证明本地分类器修复；重新生成版本 PR 的准确 head、人工审批及完整远端矩阵仍需独立核验。

## 适用边界

只调整普通 blob 的读取条件，不新增公开 API，不修改历史 CHANGELOG 或文件执行位。远端完整验收仍遵循[版本 PR 内审批流程](version-pr-approval.md)；普通范围判定、旧 head 的成功及本地定向回归均不能替代该验收。本轮未运行本地全端验收。

## 规则评估

不新增规则。现有规则已要求从 main 修复并由受管流程重新生成版本 PR；本轮以真实 Git 回归补齐普通文件类型的模型。
