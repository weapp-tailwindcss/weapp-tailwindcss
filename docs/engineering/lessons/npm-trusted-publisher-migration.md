---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1266
baseline: 9ddcb728fe6bca712010d54d34a3c2384f0580ec
regressions:
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-release.test.ts
---

# npm Trusted Publisher 迁移与认证交接

## 症状

仓库转移到组织后，30 个 npm 包的 Trusted Publisher 仍指向旧 owner。Chrome 原生控制超时，扩展连接缺少 Codex auth token；另起自动化 Chrome 使用独立登录态，一次启动失败还留下空白浏览器。此前将 npm 尝试打开验证页表述为页面已呈现在用户面前，缺少可见性证据。

## 根因与纠正

- 自动化浏览器使用独立 profile，不能假设它共享日常 Chrome 的 npm 登录态。启动失败也不等于没有残留进程；只清理通过会话名及进程归属确认属于本任务的会话。
- npm 的浏览器打开调用不提供用户实际看到页面的证明。改用 `npm trust` 与 `--no-browser`，将命令实际返回的官方验证链接交给用户；不能把登录页或已过期链接当作当前 2FA 请求。
- `whoami` 成功不代表 Trusted Publisher 管理权限已满足。应使用实际 `npm trust list` 返回的认证要求；直接 HTTP 请求失败也不能推断官方 CLI 必然失败。
- npm 网页认证存在短时有效期；一次性验证结果只用于重试触发该验证的命令，不能把同一 OTP 附到后续全部命令。过期后保留逐包进度，并按新的挑战继续验证。
- 先读取全部包的原配置，再逐包创建新仓库身份、回读确认、按原 ID 撤销旧身份，最后再次回读。保留原有 workflow、environment 约束和发布权限；操作结果不明时先查询，不能盲目重放写请求。

## 验证

本次使用 npm 11.16.0 的 `trust list`、`trust github` 与 `trust revoke`。30 个包的原配置均为 GitHub Actions、`sonofmagic/weapp-tailwindcss`、`release.yml`、无 environment，权限均为 `createPackage` 和 `createStagedPackage`。最终 30/30 个包均已回读确认仅保留新组织仓库身份，原发布权限不变；验收结果见[迁移记录](../organization-transfer.md)。

原始配置与每包回读结果保存在迁移工作树忽略目录 `node_modules/.cache/organization-transfer/` 的 `npm-trust-before.json`、`npm-trust-after.json`。证据仅包含信任配置和时间，不记录密码、Token 或 OTP；这些本地文件不会随 PR 上传。

## 适用边界

这是远端配置迁移，无产品行为或测试基线变化，因此没有新增自动化回归用例。frontmatter 引用的现有发布工作流和 repoctl 回归在迁移准备阶段已通过，共 67 项；它们保护仓库发布约束，不验证 npm 后台配置。本次远端配置的证据来自官方 CLI 的逐包回读。配置回读成功只证明信任声明已保存；下一次计划内发布仍需核对 npm OIDC 鉴权和新仓库来源的 provenance。迁移过程中保持 Release 暂停，不通过实际发布验证凭据，也不注入旧 NPM_TOKEN 兜底。

2026-10-07 后续恢复发现：迁移后的配置在创建后 48 小时内没有完成首次发布，已触发 npm 的过期策略。上面的迁移验收保留原日期与范围，不能据此推断配置当前有效。维护者已授权删除并重建全部 30 个包的信任配置，本次重建后真实 OIDC 交换与全部包首次发布已完成；版本、latest、provenance、Git tag 和 GitHub Release 均 30/30 验收通过。新创建的配置需要在 48 小时窗口内完成首次发布，具体根因、真实 OIDC 核验和恢复结果见 [npm 信任配置过期与发布恢复](npm-trust-expiry-release-recovery.md)。

## 规则评估

不新增 AGENTS 规则。沿用现有会话归属、发布暂停、逐项验收与敏感信息处理边界，操作恢复顺序统一维护在迁移记录中。
