---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1274
baseline: 1eec6f3b3a75c08b07415c0e421d7dd98ae6eada
regressions:
  - packages/weapp-tailwindcss/test/ci/repoctl-release-notes.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-release.test.ts
  - packages/weapp-tailwindcss/test/native-release.test.ts
---

# 原生平台包的发布摘要可见性

## 症状

发布 PR #1274 的 Packages 表只列出 8 个包，遗漏全部 8 个 Rust 平台包。实际 diff 中这些平台包的 manifest 已从 5.5.12 升到 5.6.0，且新增的 CHANGELOG.md 包含版本标题，但没有正文。

## 根因与纠正

Rust change intent 的说明属于主包和 PostCSS 包；平台包通过 pnpm fixed 版本组同步升版，因此只有版本标题。repoctl 5.5.7 的 `readPackageRelease()` 将没有正文的版本章节直接丢弃，连带遗漏包统计和 Packages 表。

最初将补齐平台包 change intent 作为必要修复并不准确。真实功能变更可以记录独立说明，但摘要应保留仅同步升版的包，也不能直接复制主包说明作为平台包的独立改动。

首次修复采用上游已发布的 repoctl 5.8.0，随后按用户要求升级到 5.8.1。其 [发布说明收集层](https://github.com/icelib/repoctl/blob/main/packages/monorepo/src/commands/release/body.ts) 保留空正文的版本章节，生成明确的维护条目，并避免归属其他包的提交。升级同时更新发布测试的进程边界：pnpm 版本操作返回实际变更的 JSON，npm 恢复查询返回包含 gitHead 的元数据；创建 Release 的 POST 结果不确定时先按 tag 查询，PATCH 保留限流等待与有界重试。

锁文件从 pnpm 实际解析结果保留 repoctl 新增依赖图，其他 importer 与已有依赖条目保持原样，通过 frozen-lockfile 安装确认完整性。修复提交到独立分支并以 main 为 PR 目标；合并后由 Release 工作流重新生成 #1274。

## 验证

- 在 repoctl 5.5.7 下运行新增回归，观察到摘要仅包含主包，遗漏全部平台包。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/repoctl-release-notes.test.ts test/ci/repoctl-release.test.ts test/native-release.test.ts test/ci/workflows.test.ts --update=none --coverage.enabled=false`：85 项通过。
- 新增回归通过实际 repoctl 的 PR 生成入口验证中英文包统计、全部 8 个平台包的版本表和维护说明，确认未升级的包被排除，主包功能说明未归属平台包。
- 发布恢复回归验证 npm、源码版本及远端 tag 冲突都阻断 GitHub 写入；原生产物回归保留版本转换前后的完整校验与发布顺序。
- `pnpm install --frozen-lockfile --ignore-scripts --filter weapp-tailwindcss-monorepo --filter weapp-tailwindcss`、`pnpm exec repo --version`、`pnpm agents:check` 和 `git diff --check` 通过，实际 repoctl 版本为 5.8.0。
- 升级 5.8.1 后，再次执行上述四文件发布回归，85 项通过；全工作区 `pnpm install --frozen-lockfile --ignore-scripts` 通过，`pnpm exec repo --version` 确认为 5.8.1。锁文件仅替换 repoctl、monorepo 与 templates 的目标版本和依赖图，其他 importer、metadata 和 snapshot 保持原样。

## 适用边界

本次修复发布工具的摘要显示，平台包的 CHANGELOG.md 仍由 pnpm 原生版本流程生成。不会为缺少独立说明的包虚构功能变更。仅升级根工作区开发依赖并调整发布测试，不触发公开包版本提升，不新增 change intent 或重生成 demo static 基线。

本地执行定向发布回归，未执行本地全端 E2E、实际 npm publish 或远端 Release PR 再生成；#1274 更新需等待本 PR 合并后的发布工作流。

## 规则评估

不新增 AGENTS 规则。已有上游修复优先、独立工作树、发布生成分支禁止手工修复及持久回归要求足以约束此类任务；通过消费真实 repoctl 的回归防止再次遗漏平台包。
