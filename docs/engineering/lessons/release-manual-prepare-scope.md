---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1279
baseline: 172d57fb7ddb8db240ad9d5639441a57141f78fb
regressions:
  - packages/weapp-tailwindcss/test/ci/release-route.test.ts
  - packages/weapp-tailwindcss/test/ci/release-stage.test.ts
  - packages/weapp-tailwindcss/test/ci/release-metadata.test.ts
  - packages/weapp-tailwindcss/test/ci/release-scope.test.ts
  - packages/weapp-tailwindcss/test/ci/release-trigger-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/release-stages-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
---

# 手动准备版本与 Actions 内容分类

## 症状

repoctl 已升级到 5.10.0，但普通 main 推送仍自动准备版本，并更新版本 PR #1279。
版本号、CHANGELOG 和台账变更随后再次触发源码、native、移动端、demo 和 benchmark 检查。
仅减少单个发布步骤的耗时不能消除这批重复调度。

本轮先临时停用 Release，再读取运行与 job 状态：

- 候选自动运行 [38037262941](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38037262941) 已成功结束，upload、confirm、finalize 均跳过，未发布 npm；没有取消已完成运行。
- 仅取消仍活动的自动版本 PR 衍生 [PR Gate 38040696783](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38040696783)。最终状态 cancelled，186 个 job 中 54 success、6 failure、126 cancelled；原有失败仍保留。
- #1279 的 head 为 `b4a92649a93c1d38f2c4dcd9649323aba4802310`，共有 22 条 PR 事件记录，包含重复触发、跳过和被替代运行；此数字不等于 22 条占用 runner 的运行。
- `action_required` 单独作为等待维护者授权的记录保留，不批量批准、重跑或计入 runner 占用。有效源码和人工运行不取消，不修改生成分支。

旧运行的 API 时间样本：自动 Release 路由排队 271 秒、执行 68 秒；Release job 排队 2 秒、执行 629 秒。
上述 PR Gate 已成功 job 的最长排队为 1897 秒。排队按 `started_at-created_at`，执行按 `completed_at-started_at` 计算；被取消且未启动的 job 不作为执行样本。

## 根因与纠正

Release 移除所有 push 入口，保留人工 dispatch；默认模式为 prepare，预发布也由人工启动。
自动入口仅接收已合并、同仓库、目标 main、来源 `release/pnpm-version` 的 PR closed 事件。
事件路由固定使用 `merge_commit_sha`，并显式输出 publish 模式；普通 PR 不启动发布 job。

路由、native 与发布 checkout 使用相同完整 SHA。Actions runner 会覆盖默认 `GITHUB_SHA` 和 `GITHUB_REF_NAME`，不能依赖 job env 改写它们。
统一阶段入口以 `CI_RELEASE_SOURCE_SHA`、`CI_RELEASE_BRANCH` 校验初始 plan/verify 的 HEAD，再给 repoctl 子进程传递准确身份。
prepare 后预发布可能合法产生新版本提交，后续 upload/confirm/finalize 使用当前 HEAD 并交由官方 receipt 校验，不强制退回旧 source SHA。
辅助变量不复用 repoctl 的 `REPO_RELEASE_SOURCE_SHA` 恢复参数，也不在不同 runner 或运行间传递 receipt。

共享分类器直接读取 Git 提交内容：PR 使用 merge-base(base, head) 到 head，push 使用事件 before 到 after。
只有注册 workspace manifest 顶层合法版本提升、对应 CHANGELOG 唯一新版本段、已消费 intent 删除、ledger 合法新增共同通过，才认定纯版本变更。
固定组、workspace 协议、intent 最低升级幅度和台账引用同时校验，历史 CHANGELOG 和 ledger 不得篡改。
依赖、锁文件、源码、exports、脚本、workflow 或任何无法确认的变更均保留完整检查，不依赖标题、作者或发布分支名称放行。

PR Gate、Release Gate、CI、Benchmark、RN、Lynx、SEO 和独立 css-compat 门禁消费相同分类入口。
纯版本变更完成轻量一致性验证后跳过重型检查，main 合并同样适用。
PR Gate、SEO Quality Gate 和 Quality Gate 汇总要求分类成功；启用的检查必须 success，不能把失败依赖的 skipped 状态当作成功。
普通文档变更沿用已有源码豁免，网站文档仍执行 SEO；CHANGELOG 和 intent 变更不能借文档扩展名绕过版本校验。

分类依赖单独放在私有 `tools/ci-scope`，冻结生产依赖安装只需要 yaml 和 semver；必须同时使用 `--prod --ignore-scripts`，避免安装根开发依赖和执行生命周期。
native 矩阵 `max-parallel: 4`，benchmark 为 2。Expo web/iOS 并行、Android 在 web 后启动，单次最多两个 Expo job。
RN、Lynx、SEO 按 PR/ref 取消旧运行；真实发布与恢复仍串行、不自动取消，OIDC 审计使用独立并发组。

## 操作

1. 源码、CI 或发布规范修复先提交 main，禁止直接修改 `release/pnpm-version`。
2. 需要生成或更新版本 PR 时，在 Actions 的 Release 选择 main 和 prepare 手动启动；alpha/beta/rc/next 同样人工启动。
3. 审核重新生成的版本 PR。合并后自动进入 publish，完整 native、质量与打包验证仍执行；prepare 不上传 npm。
4. 仅核验 npm 信任关系时选择 `oidc_audit=true`。审计 job 独立运行，plan、native、发布 job 均跳过。
5. 恢复部分发布继续使用 publish-unpublished 的包/版本输入及 repoctl checkpoint；确认已进入上传或最终化的运行不因队列清理而取消。

OIDC 保留 `.github/workflows/release.yml` 身份、Node 24、`id-token: write` 和 provenance，不注入 NPM_TOKEN/NODE_AUTH_TOKEN。
显式 publish/publish-unpublished 的现有 coverage certificate 条件不变；自动发布保留完整常规验证。

## 验证

本地 macOS、Node 24.18.0、pnpm 12.9.1，基线为 frontmatter 提交。
新增触发回归在旧工作流全部失败后通过；Quality Gate 失败传播回归也先失败再修复。
回归覆盖真实 Git 多提交 push、PR base 前进、缺失 ref、版本混入依赖/源码、篡改历史台账、缺失 intent、伪造标题、阶段身份变化、strict 发布路由与失败阻断。
最终合并验证为 14 个测试文件、271 项通过，没有更新快照或基线。

```sh
CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/ci/pr-scope.test.ts test/ci/release-metadata.test.ts test/ci/release-scope.test.ts test/ci/release-route.test.ts test/ci/release-stage.test.ts test/ci/release-trigger-workflow.test.ts test/ci/release-stages-workflow.test.ts test/ci/workflows.test.ts test/ci/css-compat-workflow.test.ts test/ci/repoctl-stages.test.ts test/ci/repoctl-release.test.ts test/ci/repoctl-release-notes.test.ts test/ci/release-oidc-preflight.test.ts test/native-release.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/ci-scope install --prod --frozen-lockfile --ignore-scripts
pnpm agents:check
```

真实 #1279 head 分类为 `metadata_only=true`，core/watch/website 等重型范围为 false。
隔离临时 checkout 的冻结安装实际只安装 yaml 2.9.1 和 semver 7.8.5，锁文件保持不变；本地热 store 样本 531ms，不作为 hosted runner 安装耗时或提速百分比。
锁文件仅新增工具 importer，已有 packages/snapshots 和解析结果保留。

TypeScript 使用仓库 ESNext/Bundler/allowJs 设置定向检查新增测试；新脚本与回归显式 ESLint `--no-ignore`，11 个修改工作流执行 actionlint，Node 语法与 diff 检查均通过。
`agents:check` 为 59 份规则、259 份文档、789 个命令入口，0 errors。定向类型入口如下；这些检查不等于全仓类型验收：

```sh
pnpm exec tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler --target ESNext --allowJs --checkJs false --types node --skipLibCheck packages/weapp-tailwindcss/test/ci/release-route.test.ts packages/weapp-tailwindcss/test/ci/release-stage.test.ts packages/weapp-tailwindcss/test/ci/release-metadata.test.ts packages/weapp-tailwindcss/test/ci/release-scope.test.ts packages/weapp-tailwindcss/test/ci/release-trigger-workflow.test.ts
```

远端只定向启动只读 CI Change Scope 与 OIDC 审计；实际 run、attempt、队列/执行时间和结果在交付时补充，不用 npm publish 验证调度。

## 适用边界

本轮不发布 npm、不合并版本 PR、不关闭 issue、不启动本地全面或多端验收。
手动 prepare 和正式 publish 保留完整 native、质量与打包验证和版本生命周期钩子。
branch protection、OIDC 信任配置及包的公共 API 不变。

以下属于已有真实失败，不能通过调度优化宣布解决：

- [main CI 38037262768 / job 114170257231](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38037262768/job/114170257231)：css-compat homepage 契约。
- [main CI / job 114170257186](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38037262768/job/114170257186)：Lynx 结构选择器 text/canvas 对照断言。
- #1279 上述 PR Gate 的六个 css-compat portability job 已失败，取消其它过时工作不抹除其状态；后续真实源码验收和正式发布仍须修复这些问题。

## 规则评估

修正根规则对版本分支触发的描述，明确人工 prepare、合并后自动 publish 与生成分支所有权。
新增私有分类依赖工具的就近规则及索引；内容与触发边界使用持久回归维护，不增加耗时阈值或测试豁免名单。
