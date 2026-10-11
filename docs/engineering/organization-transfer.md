# 主仓库组织迁移记录

## 当前状态

2026-10-07 发布恢复补充：Release 已恢复为 `active`。此前迁移后的 npm 信任配置因未在创建后 48 小时内完成首次发布而过期，已按维护者授权删除并重建全部 30 个包；[真实 OIDC 核验](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37524191219) 已 30/30 通过。[main 上实际发布](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37524611131) 已上传全部 30 个目标版本，但任务因主包 registry 可见性确认超时而失败；随后已通过 repoctl 补齐元数据，30 个精确版本、latest、新组织来源的 provenance、Git tag 和 GitHub Release 均验收通过，主包与 CLI 均为 `5.5.12`。详细原因与证据见 [npm 信任配置过期与发布恢复](lessons/npm-trust-expiry-release-recovery.md)。下方保留 2026-10-02 的历史验收、暂停状态与待办，不将当时的配置回读当作当前发布授权证据。

## 2026-10-02 的迁移验收状态

2026-10-02 已将主仓库从 `sonofmagic/weapp-tailwindcss` 转移到 [weapp-tailwindcss/weapp-tailwindcss](https://github.com/weapp-tailwindcss/weapp-tailwindcss)。仓库名称与公开属性、npm 包名及所有权、文档域名和独立模板仓库保持不变。

代码准备基线为 `0bfb23912f59cfaf0b58b00353d7f08122d1f8f1`。维护者本轮要求开始迁移，已采用“先转移 GitHub、保持 npm 发布暂停”的分阶段交付。**GitHub Transfer 与 30 个 npm 包的 Trusted Publisher 迁移均已完成；发布恢复尚未完成。** npm 信任配置已逐包回读核验。发布 Token 对组织仓库的访问权、Cloudflare Actions 真实部署与 Codecov 的组织授权仍待核实。

Release 工作流在转移前停用，当前保持 `disabled_manually`。Sync Templates 原本即为 `disabled_manually`，保持原状。PR #1266 保存地址和元数据变更，待后台条件具备后经正常审核合并；不得直接触发 npm 发布。

### 转移验收

- 仓库 ID `448897619`、默认分支 `main`、1863 个 Star、103 个 Fork 保持不变。
- 10 个开放 PR 的编号、ID、head SHA、源/目标分支及草稿状态与切换前一致。
- 1221 条 Issue/PR 的编号、状态和指派逐项一致，268 条带指派记录保留。
- 1037 个 GitHub Release 的 ID、tag 和草稿状态一致；2549 条分支/标签引用及 SHA 一致。
- `main` 分支保护语义、rulesets、环境配置、webhook、Secret 名称和变量名称保持不变。
- Actions 默认权限按组织策略变为 `read`，允许创建及批准 PR 的设置保持开启。已检查所有工作流：权限均在 workflow 或 job 层显式声明，因此保留组织默认读权限。
- 本地共享 Git 配置中的 origin 已更新为 `git@github.com:weapp-tailwindcss/weapp-tailwindcss.git`，主 checkout 与附属 worktree 均使用新地址。新地址可读取全部分支/标签，旧地址可重定向读取 `main`。
- 转移刚完成时 SSH 曾短暂返回 `Repository ... is disabled`；随后 API 显示 `disabled: false`，SSH 读取恢复。迁移过程中的首次 Issue 分页清单不完整，稳定后按创建时间排序重新查询，全部 1221 条匹配；没有据临时列表重建或删除任何 Issue。

## 已准备的内容

- 30 个非私有包的 `repository`、`bugs` 与中文 patch change intent，供迁移后的计划内发布更新 npm 元数据。
- 根 README、包 README、文档站导航、结构化数据、贡献与源码入口、API 文档生成器、showcase 脚本和 Star 徽章的主仓库地址。
- 首页 Star 查询及 sessionStorage 使用新的 owner；浏览器回归验证旧 owner 缓存不会覆盖新仓库数据。
- 中英文 GEO 索引由文档构建重新生成。历史 Issue/PR/commit 引用、CHANGELOG、作者与赞助入口、AtomGit 镜像及其他独立仓库保持原有身份。
- 最初准备快照保存在本工作树忽略目录 `node_modules/.cache/organization-transfer/pre-transfer.json`，包含仓库身份、分支保护、rulesets、协作者、环境、webhook、Secret 名称、变量名称、工作流状态、组织策略、Pages 和 Issue 指派；不包含 Secret 值。本次切换前后已另存 `cutover-before.json` 与 `cutover-after.json`，用于上方逐项验收。

本轮没有修改 demo 页面或样式输出，因此不需要更新 demo static 基线；文档站索引已随构建更新。

## 后台放行清单

### GitHub

- 转移前已核实原仓库管理员与目标组织 Owner 身份，并确认目标组织无同名仓库；转移后 `sonofmagic` 保持仓库管理员。
- 最新读取的组织 Actions 默认权限为 `read`，允许 Actions 创建及批准 PR。Release 已显式申请 `contents: write`、`pull-requests: write` 和 `id-token: write`，不需要为了迁移全局扩大默认权限。
- 原仓库 `main` 要求一次审核、严格的 `SEO Quality Gate`，禁止强推与删除。转移后已逐项对照快照，不绕过审核合并。
- 已记录 268 个带指派的 Issue/PR，指派对象均为组织 Owner `sonofmagic`。
- 迁移前 Release 为 `active`，现已停用等待发布接通；Sync Templates 原本为 `disabled_manually`。恢复时按快照恢复，不能将原本停用的模板同步自动启用。
- 最新 Release run `36843628878` 已失败，发布依赖协议修复 PR #1261 尚未合并，发布 PR #1255 仍需重新生成。这些 PR 已随仓库保留，必须在恢复发布前解决既有发布问题。
- 当前工作流选用 `REPOCTL_RELEASE_TOKEN`、`CHANGESETS_RELEASE_TOKEN` 或 `github.token`。现有 Secret 清单含后者对应的 `CHANGESETS_RELEASE_TOKEN`，但不能从 Secret 名称推断其权限；需在授权后台核实它对目标组织仓库的访问权。不要复制或展示 Token 值。

### npm Trusted Publisher

2026-10-02 已使用 npm 11.16.0 官方 `trust` 命令完成全部 30 个发布包的配置迁移，并逐包回读核验：

| 字段 | 迁移后目标 |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `weapp-tailwindcss` |
| Repository | `weapp-tailwindcss` |
| Workflow filename | `release.yml` |
| Environment | 当前工作流和全部 30 个包均未配置 environment |
| 发布权限 | 保留原有 `createPackage` 与 `createStagedPackage`，未扩大权限 |
| 运行环境 | GitHub-hosted runner、Node 24、OIDC、provenance |

通过 `npm trust list` 保存原配置，再逐包执行 `npm trust github` 添加新身份、回读确认、使用 `npm trust revoke --id=...` 撤销原身份，最后再次回读。全部包最终均仅保留新仓库身份，工作流仍为 `release.yml`，无 environment 限制，两种原有发布权限保持不变。npm 短时认证过期时由维护者完成官方网页 2FA，再从当前包继续；未再自动启动浏览器。

原配置和最终配置分别保存在本工作树忽略目录 `node_modules/.cache/organization-transfer/npm-trust-before.json`、`npm-trust-after.json`，包含包名、信任 ID、配置与核验时间，不包含 Token 或 OTP。最终核验完成时间为 `2026-10-01T19:06:20.013Z`（UTC）。

| 包 | Trusted Publisher 核实状态 |
| --- | --- |
| `@weapp-tailwindcss/cli` | 已迁移并回读核验 |
| `@weapp-tailwindcss/cn` | 已迁移并回读核验 |
| `@weapp-tailwindcss/cva` | 已迁移并回读核验 |
| `@weapp-tailwindcss/debug-uni-app-x` | 已迁移并回读核验 |
| `@weapp-tailwindcss/engine` | 已迁移并回读核验 |
| `@weapp-tailwindcss/escape` | 已迁移并回读核验 |
| `@weapp-tailwindcss/experimental` | 已迁移并回读核验 |
| `@weapp-tailwindcss/hbuilderx-runner` | 已迁移并回读核验 |
| `@weapp-tailwindcss/init` | 已迁移并回读核验 |
| `@weapp-tailwindcss/logger` | 已迁移并回读核验 |
| `@weapp-tailwindcss/lynx` | 已迁移并回读核验 |
| `@weapp-tailwindcss/merge` | 已迁移并回读核验 |
| `@weapp-tailwindcss/postcss` | 已迁移并回读核验 |
| `@weapp-tailwindcss/postcss-calc` | 已迁移并回读核验 |
| `@weapp-tailwindcss/react-native` | 已迁移并回读核验 |
| `@weapp-tailwindcss/reset` | 已迁移并回读核验 |
| `@weapp-tailwindcss/runtime` | 已迁移并回读核验 |
| `@weapp-tailwindcss/shared` | 已迁移并回读核验 |
| `@weapp-tailwindcss/source-scan` | 已迁移并回读核验 |
| `@weapp-tailwindcss/typography` | 已迁移并回读核验 |
| `@weapp-tailwindcss/ui` | 已迁移并回读核验 |
| `@weapp-tailwindcss/variants` | 已迁移并回读核验 |
| `tailwindcss-config` | 已迁移并回读核验 |
| `tailwindcss-core-plugins-extractor` | 已迁移并回读核验 |
| `tailwindcss-injector` | 已迁移并回读核验 |
| `theme-transition` | 已迁移并回读核验 |
| `weapp-style-injector` | 已迁移并回读核验 |
| `weapp-tailwindcss` | 已迁移并回读核验 |
| `weapp-tw` | 已迁移并回读核验 |
| `wetw` | 已迁移并回读核验 |

本次验收仅证明 30 个包的新信任配置已保存、旧身份已移除；未执行 `npm publish`、版本变更或 dist-tag 修改。下一次计划内真实发布仍需验证 OIDC 鉴权与新仓库来源的 provenance。Release 保持 `disabled_manually`，仓库 Secret 中的旧 `NPM_TOKEN` 不得注入发布步骤作为失败兜底。认证交接与浏览器清理的复盘见 [npm Trusted Publisher 迁移与认证交接](lessons/npm-trusted-publisher-migration.md)。

### Cloudflare 与 Codecov

- 2026-10-02 复测：Wrangler OAuth 可读取生产和预览 Worker。生产最近一次部署为 `2026-09-15T13:04:28Z`，版本 `63b304b1-4ca4-46c7-bae9-0faec5852c86`；预览最近一次部署为 `2026-08-26T07:03:16Z`，版本 `7cc1fd48-82f9-4e15-a0af-59fda1701d10`。没有据此宣称组织迁移后已经成功部署。
- 主站 HTTP 冒烟检查 28/28 通过：中英文首页与简介、canonical 和结构化数据、CSS/JS、robots 与双语 sitemap、LLM 索引/文本、组件 registry、站内 301/404，以及两个旧生产域名的路径和查询参数保留跳转。报告保存于本工作树忽略目录 `node_modules/.cache/organization-transfer/cloudflare-live-http.json`，核验时间为 `2026-10-01T19:17:35.753Z`（UTC）。此前直接 HTTP 返回 403 的结果已被本次成功访问更新；本次没有做浏览器视觉验收，也未比对远端文件与当前 main 构建的哈希。
- GitHub 组织存在 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`，可见性均为 `all`。维护者确认统一使用组织密钥后，已删除仓库两项同名旧 Secret 并回读确认，避免旧值覆盖组织配置；未读取或展示 Secret 值。新 Token 的真实上传权限仍需首次 Actions 部署证明。
- 原远端 `main` 的 `.github/workflows/docs.yml` 仅做构建与 `deploy:worker:dry-run`，不执行上传。由于 Cloudflare Builds 额度耗尽，维护者决定将生产构建和部署改由 GitHub Actions 完成；PR #1266 已准备 `Deploy Docs Worker`，仅由目标仓库的 `main` 推送或手动运行，使用 Node 24 和锁定的 pnpm/Wrangler，检查成功后直接上传现有生产 Worker。部署前拒绝过期提交，固定并发组不取消进行中的部署；部署后核对当前构建资源哈希。预览部署不启用。
- `GET /orgs/weapp-tailwindcss/installations` 返回 `total_count: 0`。新方案不再依赖 Cloudflare GitHub App 或 Connected Builds 的仓库授权，不需要为此重连 Git 构建。
- 本机 OAuth 对生产及预览 Worker 的 Builds triggers API 复查仍返回 403，无法停用自动触发。已请维护者在两者的 Settings → Builds 停用自动构建或断开 Git 连接，保留 Worker 和域名；尚未收到完成确认，不将额度用完或组织 App 缺失视为触发已关闭。
- `next.tw.weapp.dev` 本机 DNS 查询返回 `ENOTFOUND`，Cloudflare Workers Domains API 也没有该域名或任何 `weapp-tailwindcss-next` 的自定义域名绑定。该预览入口未通过验收；生产域名及两个旧生产域名的绑定均启用。本次未修改 DNS、域名绑定或生产内容。
- Codecov 旧仓库 API 可读取，但这不证明其 GitHub App 已获组织授权。迁移后必须验证新仓库身份和上报。
- GitHub Pages 的 `gh-pages:/` 来源已保留，新站点地址为 `https://weapp-tailwindcss.github.io/weapp-tailwindcss/`，API 状态为 `built`，没有自定义域名。旧地址 `sonofmagic.github.io/weapp-tailwindcss/` 不随仓库重定向；继续以 `tw.weapp.dev` 为主入口，不在旧仓库位置创建同名仓库。

## 后续恢复顺序

1. npm Trusted Publisher 已全部迁移并核验，文档主域名 HTTP 验收通过。确认生产和预览 Connected Builds 自动触发均已停用；预览域名不在本次 Actions 迁移范围。继续核实 Codecov 集成及发布 Token 对新仓库的访问权，保持 Release 停用。
2. 地址和 Actions 部署变更 PR #1266 须经一次审核及 `SEO Quality Gate` 合并到 `main`，由 Actions 完成首次真实生产上传和当前构建资源哈希验收，记录提交、run 和 Worker 版本。当前尚缺审核，未绕过保护或实际上传。另行完成既有发布修复 PR #1261；不得手工修改 `release/pnpm-version`。网站上传后验收失败时按 [网站部署说明](../../website/README.md) 停止后续部署并按需回退 Worker 版本。
3. 后台身份与权限核对通过后，仅恢复切换前原本启用的 Release 工作流。通过 repoctl 的 prepare 流程重新生成发布 PR #1255，不能直接发布旧生成分支的产物。
4. 下一次计划内真实发布逐包核对 npm 版本与 dist-tag、Git tag、GitHub Release 及新组织来源的 provenance。dry-run 不是发布认证成功证据；部分成功时使用 repoctl 恢复缺失项，不能重发已发布版本。
5. Sync Templates 原本停用，本次不恢复。若今后单独启用，先验证 `TEMPLATE_SYNC_SSH_KEY` 对独立模板仓库的权限。

异常时保持发布暂停，修复权限或配置；不把转回个人账户作为可靠回滚机制。当前停用状态已在本记录和迁移交付中明确说明。

## 验证记录

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflows.test.ts test/ci/repoctl-release.test.ts --update=none`：67 项通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/website build`：英文、中文构建通过，GEO 索引已更新。构建有 CSS 压缩的 missing font size 警告，未阻断生成。
- `CI=1 pnpm release status`：repoctl 正确识别 30 个发布包的 metadata change intent；没有执行版本写入或发布。
- `CI=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4188/zh-cn/ pnpm --filter @weapp-tailwindcss/website exec playwright test tests/index.spec.ts --project=chromium --grep 'GitHub badge requests|support signals retain' --retries=0`：新组织请求与旧缓存隔离、现有缓存与开关行为共 2 项通过；服务来自本工作树的构建产物。
- 修改过的 TypeScript/TSX 文件通过定向 `pnpm exec eslint`；未使用自动修复。
- 30 个非私有包逐项核对通过：仓库元数据与根配置一致，包名、版本、导出、依赖及其他非地址字段保持不变。
- `CI=1 pnpm agents:check` 与 `git diff --check`：准备阶段通过；本次迁移记录更新后重新验证。
- 本次 npm 管理命令逐包回读核验 30/30 通过：目标仓库、workflow、environment、权限及旧身份移除均符合预期；前后快照包名集合完全一致。
- Cloudflare 线上检查：生产 HTTP 28/28 通过；预览 DNS/自定义域名未通过。后续 Actions 切换已移除仓库同名密钥；Builds API 仍返回 403，停用触发、真实部署及组织 Token 上传权限尚未验收。未启动新 Chrome。
- Actions 切换：部署门禁回归 18 项和现有 CI/发布回归 67 项通过；`actionlint .github/workflows/docs.yml .github/workflows/website-seo-quality.yml` 与新增 TypeScript 定向 ESLint 通过。`CI=1` 下按顺序运行网站 `check:docs-audience`、`seo:few-keywords`、`build`、`seo:quality:strict`、`test:worker`、`deploy:worker:dry-run` 全部通过，完成双语构建及本地 200/301/404/cache 检查。日志保存在忽略目录 `node_modules/.cache/organization-transfer/actions-docs-build.log`，没有据 dry-run 声称真实上传成功。
- 本次修改生产部署工作流、部署门禁、PR 门禁回归与维护文档，没有调整 npm 发布流程。未运行全仓多端测试或实际 npm 发布；PR 的远端检查结果以当前 head 为准，不将运行中、排队或跳过的检查标记为通过。切换边界见 [Cloudflare 构建额度与 Actions 部署](lessons/cloudflare-actions-deployment.md)。

本轮不新增 AGENTS 规则；使用现有发布、隔离和验收约束。

参考：[GitHub 仓库转移](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)、[npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)。
