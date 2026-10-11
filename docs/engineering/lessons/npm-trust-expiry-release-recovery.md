---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37511275276
baseline: 7b3c2c14ec8c5557668d5b008d2e7cd9c1cbadf7
regressions:
  - packages/weapp-tailwindcss/test/integration/tailwindcss-v4-hmr.test.ts
  - packages/weapp-tailwindcss/test/ci/release-oidc-preflight.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
---

# npm 信任配置过期与发布恢复

## 症状

发布运行 `37511275276` 的首次 attempt 已通过构建与测试，但 pnpm 12.9.1 在交换 npm OIDC 凭据时返回 `ERR_PNPM_AUTH_TOKEN_EXCHANGE`、HTTP 404 和 `Unknown error`。随后包上传同样返回 404，30 个目标版本均未发布。第二次 attempt 先遇到了 HMR 测试竞态，因此不能把两次 attempt 当成同一故障。

2026-10-07 维护者在 npm 设置中观察到 `This trusted publisher configuration has expired. Delete it and create a new one.`、`Status: Expired`。先前 30/30 配置回读只能证明信任声明存在，未证明其当前仍可授权发布。

## 根因与纠正

npm 在 [2026-10-02 的公告](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/)中明确：新 Trusted Publisher 配置需要在创建后 48 小时内完成首次发布，否则过期；首次发布成功后免于该过期限制。此前迁移创建的新组织信任配置没有完成首次发布，随后经历了发布暂停，不能继续按有效凭据使用。过期配置需要删除并重新创建，普通编辑不重置期限。

另一项已修复的问题是测试对共享 demo 源文件的竞争读写。`tailwindcss-v4-hmr.test.ts` 改写真实 demo 时，其他测试可能在文件截断窗口读到空内容。提交 `7b3c2c14e` 将六类 HMR 测试统一放到独立临时项目，复用依赖并在结束时清理；真实 demo 作为只读输入。恢复运行已通过质量检查后到达发布阶段，证明这项测试阻塞已经消除。

诊断中还检查了仓库转移后 GitHub 的 immutable OIDC subject 格式。不能仅凭新 subject 与上游类似错误报告断言本仓库受同一故障影响：本次独立核验中，包含组织和仓库 ID 的同一 GitHub 身份已成功为 `@weapp-tailwindcss/debug-uni-app-x` 交换凭据（HTTP 201）。这项观察排除了“新 subject 格式导致当前全部包不能认证”的结论，其余包仍需按各自信任状态处理。

新增的 `release.yml` 手动输入 `oidc_audit=true` 使用 repoctl 的公开包清单，独立交换所有包的 OIDC 凭据。报告只输出经过筛选的身份字段和各包 HTTP 状态、错误原因，不保存身份或发布凭据。核验模式跳过 repoctl 发布、Playwright、证书下载和覆盖率上传，保留现有发布模式和 OIDC 权限。

重建后正式发布的上传与最后对账也需要区分：30 个包均返回上传成功，但 repoctl 等待 `weapp-tailwindcss@5.5.12` 的 registry 可见性超过 5 分钟，按“已接受、未确认”的状态终止，没有继续生成 Git tag 和 GitHub Release。随后该精确版本已可查询，逐包验收证明全部 30 个版本、latest、仓库元数据和 provenance 均正确。此时应从已发布提交进行 repoctl 的 metadata reconcile，先 dry-run，再补齐元数据，不重发已被接受的版本。

## 验证

- 恢复发布 [37521210224](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37521210224) 使用修复提交 `7b3c2c14e`，构建、测试和打包校验通过；npm OIDC 交换仍返回 404，没有包上传成功。
- 独立核验 [37522764282](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37522764282) 使用诊断提交 `20635fb64`，成功读取真实 GitHub OIDC 身份；1/30 包交换成功，其余 29 个返回 `OIDC token exchange error - package not found`。这不是“公开包不存在”的证明，而是当前交换请求未获授权的服务端错误。
- 重建后核验 [37524191219](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37524191219) 使用同一诊断提交 `20635fb64`，30/30 个包的真实 OIDC 交换均返回 HTTP 201，运行成功；身份仍包含组织和仓库的 immutable IDs。
- 正式发布 [37524611131](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37524611131) 使用 main 的修复提交 `7b3c2c14e`，构建与质量检查通过，30 个包均上传成功；最终运行因主包 registry 可见性确认超时而失败。该运行的普通测试为 790 个文件通过、5 个文件按原配置跳过，不能将跳过项记为已执行。
- 随后对 30 个精确版本、latest、仓库元数据及 SLSA provenance 逐包回读通过。provenance 的仓库、`.github/workflows/release.yml`、`refs/heads/main`、run ID、提交 SHA 及 tarball SHA-512 均与此次发布一致；主包和 CLI 均为 `5.5.12`。
- 使用 repoctl 导出的 `reconcileRelease` 从干净的发布提交恢复元数据，先执行 `dryRun: true`，确认仅有 30 个已发布版本待补齐，再执行实际恢复，30 项均已 repaired。此流程不执行 npm publish，不重发版本。对应 CLI 入口为 `pnpm exec repo release ci --mode reconcile --dry-run`；恢复时必须使用发布提交的 checkout 和已核对的 GitHub 仓库、提交与认证身份。
- `2026-10-06T20:43:44.901Z` 最终逐包验收：精确版本、latest、repository、provenance 来源/run/SHA/tarball 摘要、Git tag 和 GitHub Release 均为 30/30。全部 tag 指向 `7b3c2c14ec8c5557668d5b008d2e7cd9c1cbadf7`，全部 Release 为公开正式版；主包 [weapp-tailwindcss@5.5.12](https://github.com/weapp-tailwindcss/weapp-tailwindcss/releases/tag/weapp-tailwindcss%405.5.12)。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-oidc-preflight.test.ts test/ci/workflows.test.ts --update=none --coverage.enabled=false`：49 项通过，覆盖错误原因、全部包对账、网络失败继续核验、身份不匹配阻断和凭据不进入报告。
- `actionlint .github/workflows/release.yml`、新增脚本与回归测试的定向 ESLint、`pnpm agents:check` 和 `git diff --check` 通过。
- 2026-10-06T19:58Z 的 npm 精确版本查询：30 个目标版本均返回 404，尚未形成部分发布。

维护者已授权删除并重建该仓库全部发布包的信任配置，30/30 已完成。逐包核对旧 ID 撤销、新 ID、`weapp-tailwindcss/weapp-tailwindcss`、`release.yml`、无 environment 和原权限；保留全部包的 `createPackage`、`createStagedPackage`，并保留 debug 包已有的 `manageDistTags`，没有扩大权限。每次网页认证只重试触发该挑战的请求，不把一次性认证结果用于其他包。进度记录保存在忽略目录 `node_modules/.cache/npm-trust-reset/progress.json`，不包含 Token 或 OTP。重建后的独立核验、全部包的首次真实发布与元数据恢复均已完成；成功首次发布满足 npm 的初始验证要求，不再受这项 48 小时过期规则限制。

## 适用边界

配置存在、字段正确、凭据交换成功和首次发布验证是四种不同证据。凭据交换成功本身不会替代 npm 要求的首次发布验证；重建后应在新的 48 小时窗口内完成计划内发布。实际发布仍由 repoctl 编排，在 Node 24 的 GitHub-hosted job 中使用 OIDC 和 provenance，不注入发布 Token。

后续需要暂停发布的迁移，应把信任配置的创建或重建安排在实际恢复发布前，在同一窗口内完成真实 OIDC 核验与首次发布。长期暂停后先检查服务端状态；过期时按包记录旧 ID 和原权限，删除并重建，再核验和发布，避免把配置保存提前当作迁移认证闭环。

本轮不改包版本、不修改生成发布分支。恢复使用现有手动 `mode=auto` 入口；repoctl 在 main 没有待消费 change intent 时进入 stable publish。显式 `publish` 和 `publish-unpublished` 仍受原有同提交证书检查约束。

## 规则评估

不新增 AGENTS 规则。以真实 OIDC 核验入口和回归测试补足配置验收，按既有工程流程区分已观察事实、待证假设与尚未完成的实际发布。更新历史迁移记录时保留原验收日期，并明确 48 小时首次发布窗口的适用边界。
