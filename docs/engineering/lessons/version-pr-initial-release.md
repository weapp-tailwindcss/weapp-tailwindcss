---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1284
baseline: 63567fbf3f15a82c9745fd70b5b97ec7d91439c9
regressions:
  - packages/weapp-tailwindcss/test/ci/release-metadata/initial-release.test.ts
  - packages/weapp-tailwindcss/test/ci/release-metadata.test.ts
  - packages/weapp-tailwindcss/test/ci/version-pr-route.test.ts
---

# 版本 PR 的新包首发元数据

## 症状

版本 PR #1284 的 [Version PR CI 38182787907](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38182787907) 在审批前失败，日志为“版本提升必须有对应的 changelog”。真实差异包含 21 个 manifest 升版和 22 个 changelog；额外的 `packages/env/CHANGELOG.md` 对应新包首发。

## 根因与纠正

当前 pnpm（12.9.1）的首发使用 main 中已有 manifest 版本。`@weapp-tailwindcss/env` 已注册且版本为 `0.1.0`，repoctl 5.10.0 prepare 仅创建该版本 changelog、消费 intent、新增 ledger；manifest 不变。原分类器只建模严格递增的版本，既遗漏首发，也错误要求首发的 minor intent 继续升版。

分类器显式收集首发记录：包在 base/head 均已注册，manifest 完全相同且版本合法，包非 private，base 无 changelog 和任何该包 ledger 历史。新建 changelog、有效且完整消费的 intent、匹配包名/当前版本/目录/intent 的新增 ledger 缺一不可。首发采用当前版本；已有版本继续校验请求的最小升版，fixed group 与历史不可改写约束保留。

独立审查复现了混合发布的证据缺口：若同时遗漏首发 intent 和 ledger，原有全局一致性校验可能只覆盖其他升版包。补充每个首发记录必须有独立新增 ledger 的约束，其内容继续要求关联该包的有效消费 intent，并保留两者同时缺失的回归。

修复提交 main，由自动 prepare 重新生成受管版本分支；不得直接修改版本 PR 或以普通范围判定代替审批后的完整验收。

## 验证

先在旧实现运行首发回归：7 项失败、16 项通过，包含只有首发与首发伴随升版的真实 Git 校验。修复后执行：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-metadata.test.ts test/ci/release-metadata/ test/ci/version-pr-route.test.ts test/ci/pr-scope.test.ts test/ci/release-scope.test.ts test/ci/version-pr-approval.test.ts test/ci/version-pr-workflow.test.ts test/ci/manual-version-gates.test.ts --update=none --coverage.enabled=false
pnpm exec eslint scripts/ci/release-metadata/index.mjs scripts/ci/release-metadata/workspace.mjs scripts/ci/release-metadata/documents.mjs
pnpm agents:check
```

定向测试共 9 个文件、181 项通过；ESLint、规则检查与 `git diff --check` 均通过。规则检查结果为 60 条规则、280 份文档、838 条命令、0 错误。

同时直接调用 `validateVersionPrDiff` 检查 #1284 的真实 base `63567fbf3f15a82c9745fd70b5b97ec7d91439c9` 与 head `931d79735ec2e4cf0370b6f2a6c3b498b55d2f0a`，已通过纯元数据契约。当前记录仅证明本地分类器修复，远端新 head 的审批和完整矩阵须另行核验。

## 适用边界

仅处理仓库台账中尚未发布的已注册包；不以网络查询决定 CI 豁免。不接受新增 manifest、源码/依赖修改、历史记录改写、私有包首发或缺失发布证据。首发与已有包的混合发布以及只包含首发的版本 PR 都有回归。

## 规则评估

不新增规则。根规则已有 main 修复、自动生成版本分支与审批完整验收的要求；本轮补齐可执行分类模型与回归，保持原安全边界。
