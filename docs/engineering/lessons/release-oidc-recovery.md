---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1279
baseline: 67e9402ea61f9d2ef47724ee2cbead7a7a2cf823
regressions:
  - packages/weapp-tailwindcss/test/ci/release-dispatch.test.ts
  - packages/weapp-tailwindcss/test/ci/release-route.test.ts
  - packages/weapp-tailwindcss/test/ci/release-trigger-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/release-stages-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/release-stage.test.ts
  - packages/weapp-tailwindcss/test/ci/auto-prepare-plan.test.ts
---

# 合并版本 PR 的 OIDC 发布恢复

## 症状

[发布 run 38067472632](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38067472632/job/114261761895) 来自 `pull_request_target: closed`，发布源码为版本 PR #1279 的 merge SHA `e75fd41019dd679bcba7b3d8f74e965171bee10d`。完整 native、plan、verify、prepare 成功，首包 `@weapp-tailwindcss/native-darwin-arm64@5.6.1` 的 GitHub OIDC 请求返回 200，npm token exchange 返回 404。pnpm 报 `ERR_PNPM_AUTH_TOKEN_EXCHANGE / Unknown error`，上传、确认和元数据列表均为空；恢复前核验全部 16 个目标版本仍为 registry 404。

相同工作流 blob、Node 24.21.0、npm 11.19.0、pnpm 12.9.1 下，[main dispatch 审计 38062721493](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38062721493) 全部 39 包交换返回 201；更早 push 发布也成功。证据指向事件身份差异，失败 run 未输出实际 claims，尚不能确定 npm 拒绝的具体字段。不能把 404 解释为包不存在、工具版本不足或 audience 错误。修改 checkout 或 GITHUB_SHA 不会改变 GitHub JWT 的事件身份。

[第一次 dispatch 恢复 38073618407](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38073618407/job/114280620530) 已完成全部 8 个 native job、12m37s 的完整 verify、prepare 与全部 39 包的 OIDC 交换（201），但实际上传返回 422：`resolvedDependencies[0].digest.gitCommit=e75fd410…` 与证书的 `SourceRepositoryDigest=7234fe1b…` 不一致。旧 `release-stage.mjs` 将实际 checkout HEAD 覆盖到 `GITHUB_SHA`，pnpm 用该值构造 provenance，但证书始终绑定真实工作流 revision。此次 16 个目标版本仍全部 404，未发生部分上传。OIDC 审计成功只能证明凭据交换，不能证明签名与上传成功。

## 根因与纠正

`pull_request_target` 仅负责调度：验证同仓库已合并 `release/pnpm-version → main`，从 API 再次核对 PR 编号、closed、merge SHA 以及 origin/main 祖先关系，调用原 `release.yml` 的 main dispatch。调度 job 只有读取源码/PR 和创建 Actions run 的权限，没有 id-token 或上传步骤，使用独立并发组，不占用正式发布队列。

dispatch 输入仅接受 `version_pr` 编号，不接受任意发布源码。plan 在可信工作流提交读取新路由，再 checkout API 确认的准确 merge SHA；native 与发布 job 消费同一 ref。main 前进时仍发布原版本源码，完整验证和每阶段 receipt 在新 run 重新生成。

plan 与 release job 都先 checkout `github.sha`，校验 HEAD 等于真实工作流 SHA，将只依赖 Node 内置模块的 `release-stage.mjs` 固定到 `RUNNER_TEMP`，再 checkout API 确认的原 merge SHA。历史版本的计划与正式六阶段都调用固定 driver，不能从旧源码树重新加载旧 wrapper。固定发生在 verify 前，不覆盖源码或 receipt；临时文件生命周期由 runner 管理。

driver 校验初始 HEAD 与 `CI_RELEASE_SOURCE_SHA`，校验发布线等于真实 `GITHUB_REF_NAME`，随后原样传递 GitHub SHA、ref、workflow 与 OIDC 环境。repoctl 的 receipt 绑定实际 Git HEAD/内容/配置/run/attempt，checkpoint 和最终 tag 绑定原版本来源；prepare 后合法产生的新提交继续由官方 receipt 校验。不能直接注入 `REPO_RELEASE_SOURCE_SHA` 绕过普通 verify 前置校验，也不能用并不存在的 `release ci --branch` 参数选择发布线。

[SLSA GitHub Actions workflow/v1](https://github.com/slsa-framework/github-actions-buildtypes/blob/main/workflow/v1/README.md) 的首个 resolved dependency 是执行工作流的 revision。恢复时 provenance 的 workflow revision 为新工作流 SHA，实际包 checkout、receipt、checkpoint、tag 来源为原 merge SHA；不能宣称标准 provenance 单独证明了历史包源码。本次 16 个目标版本的 registry 元数据均没有 `gitHead`，源码来源通过实际 checkout、receipt、checkpoint 与 tag 另外核验。正式上传前在同一个 job 执行 repoctl OIDC 审计，失败阻断后续上传。

正式发布与恢复保持串行、不自动取消，保留 Node 24、provenance、durable checkpoint 及 plan → verify → prepare → upload → confirm → finalize。关联已合并受管版本 PR 的恢复沿用原自动发布证书边界；未关联版本 PR 的手动 publish / publish-unpublished 继续要求同提交 coverage certificate。不得借恢复复制旧 run receipt，或在验证后覆盖源码文件。

## 操作

日常流程保持 main intent 自动生成版本 PR → PR 内审批完整 CI → 合并后自动发布。无需人工启动正常发布。

已合并版本的失败恢复，在修复 main 后使用：

```sh
gh workflow run release.yml --ref main -f mode=publish -f version_pr=1279
```

只允许填写实际已合并受管版本 PR 编号。不要重跑旧 PR 身份的失败 job；它仍会取得同一事件身份。检查目标 run 的源码 SHA、全部阶段、公开 registry 与最终元数据；调度成功或 OIDC 审计成功均不等于包已发布。

## 验证

先固化 PR 不能直接上传、调度权限隔离、准确 merge checkout、OIDC 失败阻断的失败回归；第二轮新增身份保留与固定 driver 回归，在旧实现上 19 项失败，再修复。临时目录带空格的真实子进程测试发现 macOS `/var` 符号链接导致入口判断不执行，改为 realpath 比较，并保留该回归。定向 Vitest 使用 `CI=1 --update=none --coverage.enabled=false`；同时检查 ESLint、actionlint、类型、规则与 diff。新路由通过真实 GitHub API 回读 #1279 并确认 main 祖先关系；不启动本地全端验收。

第一轮本地结果：7 个测试文件、211 项通过（release-dispatch、release-route、release-trigger-workflow、release-stages-workflow、workflows、release-stage、auto-prepare-plan）。`pnpm exec eslint scripts/ci/release-dispatch.mjs scripts/ci/release-route.mjs`、`actionlint .github/workflows/release.yml`、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`、`pnpm agents:check` 和 `git diff --check` 均通过。首次类型检查发现本地 logger/reset/style-injector 缺少声明，定向构建三个依赖后通过，没有修改这些包。

第二轮本地结果：同一 7 个测试文件、219 项通过；ESLint（release-stage）、actionlint（release.yml）、类型检查、`agents:check`（59 规则 / 263 文档 / 793 命令）和 diff 检查均通过。自动 prepare CLI fixture 现在显式提供真实 push SHA，不能再依赖 wrapper 隐式覆盖身份。

### 实际发布与公开核验

[恢复 run 38077149802](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38077149802) 已完成并成功。执行工作流 SHA 为 `67e9402ea61f9d2ef47724ee2cbead7a7a2cf823`，实际发布源码固定为 #1279 的原 merge SHA `e75fd41019dd679bcba7b3d8f74e965171bee10d`。8/8 native job 与 plan、verify、prepare、upload、confirm、finalize 全部成功；同 job 的 OIDC 审计完成 39/39 包的凭据交换。未使用长期 npm token，没有重复发布或修改原版本。

发布 job 的实际阶段时间如下，时间均为 2026-10-10 UTC。plan 在 verify 前完成；耗时来自 GitHub step 起止时间，按秒计算，没有推算提速比例。

| 步骤 | 起止时间 | 耗时 |
| --- | --- | --- |
| verify | 19:09:02–19:21:04 | 12m02s |
| prepare | 19:21:04–19:21:05 | 1s |
| OIDC audit | 19:21:05–19:21:15 | 10s |
| upload | 19:21:15–19:22:52 | 1m37s |
| confirm | 19:22:52–19:27:59 | 5m07s |
| finalize | 19:27:59–19:31:00 | 3m01s |

全部 16 个目标版本上传、公开确认且 `latest` 正确：

| 包 | 版本 |
| --- | --- |
| `@weapp-tailwindcss/native-{darwin-arm64,darwin-x64,linux-arm64-gnu,linux-arm64-musl,linux-x64-gnu,linux-x64-musl,win32-arm64-msvc,win32-x64-msvc}`（8 包） | `5.6.1` |
| `@weapp-tailwindcss/cli`、`weapp-tailwindcss` | `5.6.1` |
| `@weapp-tailwindcss/css-compat` | `0.1.1` |
| `@weapp-tailwindcss/experimental` | `0.0.50` |
| `@weapp-tailwindcss/lynx` | `0.4.2` |
| `@weapp-tailwindcss/postcss` | `3.4.1` |
| `@weapp-tailwindcss/react-native` | `0.3.2` |
| `tailwindcss-injector` | `1.0.25` |

confirm 等待 npm 元数据传播，期间 Lynx 的公开查询曾返回 404，最终变为 200 且 `latest=0.4.2`；这是上传被接受后的可见性等待。公开读取 16 个版本的 npm attestations，确认 invocation 指向本轮 run、workflow digest 等于 `67e9402…`，attested subject 的 sha512 与 registry `dist.integrity` 全部一致。该核验确认公开证明与产物匹配，不将 workflow digest 当作历史包源码 digest。

16/16 远端 Git tag 均指向原 merge SHA，16/16 GitHub Release 均正式发布，包含 [weapp-tailwindcss 5.6.1](https://github.com/weapp-tailwindcss/weapp-tailwindcss/releases/tag/weapp-tailwindcss%405.6.1) 和 [css-compat 0.1.1](https://github.com/weapp-tailwindcss/weapp-tailwindcss/releases/tag/%40weapp-tailwindcss/css-compat%400.1.1)。[durable checkpoint](https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/repoctl-release-state/.repoctl-release/b43ee3d6d16864617ad4ae3829b98f759f7a5db4b48b9a984af5349016c75180.json) 回读为 `accepted=16`、`metadata=16`、`npm=complete`、`uploadComplete=true`、`complete=true`，镜像同步 hook 完成。`repoctl-ci-progress.json` 的六阶段全部 complete、无 pending；上传进度文件保留的 `confirming` 字段不能替代最终 checkpoint 判断。

发布恢复验收已完成。同一修复 SHA 的 [CI 38077140927](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38077140927) 31 个 job 全部成功，Architecture、Agent Workflow Contract 和 Deploy Docs Worker 成功；push Release 无待发布 intent，成功结束并跳过重型发布 job。PR Benchmark Report 对 push 正常跳过。[Benchmark 38077140952](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38077140952) 单独跟进，以最终实际状态判定，不把仍排队或运行的任务计为成功。

此次用户明确要求修复并成功发包；不更改版本、包 API、intent，不自动合并或关闭 issue。

## 适用边界

适用于同仓库已合并受管版本 PR。预发布、未关联版本 PR 的手动发布及证书流程保留原边界；任何身份校验、native、verify 或 OIDC 失败都必须阻断上传。恢复是否完成依据实际 registry 与 repoctl 最终化，不能仅凭工作流被接受调度判定。

## 规则评估

补充根规则既有 OIDC 条目的事件边界，并更新版本 PR 操作文档；调度、源码身份、证书条件与上传顺序由回归约束。不新增绕过质量门禁的规则，不使用长期 npm token 规避可信发布。
