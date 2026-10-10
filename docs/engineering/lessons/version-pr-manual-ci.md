---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1279
baseline: ecd0676ee35ab9f34c25fa6175aaf6c032664913
regressions:
  - packages/weapp-tailwindcss/test/ci/version-pr-route.test.ts
  - packages/weapp-tailwindcss/test/ci/version-pr-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/manual-version-gates.test.ts
  - packages/weapp-tailwindcss/test/ci/release-route.test.ts
  - packages/weapp-tailwindcss/test/ci/release-trigger-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/install-workspace.test.ts
  - packages/weapp-tailwindcss/test/ci/install-memory-workflow.test.ts
---

# 自动生成版本 PR、人工验收、合并发布

## 症状

用户需要 `main` 有待发布变更时自动更新 version packages PR，PR 上的正式 CI 人工启动，合并版本 PR 后自动发布。
把 prepare 改成人工启动改变了版本 PR 的生成入口；保留自动生成但自动执行整个 PR 矩阵又会重复占用 runner。

## 根因与纠正

版本准备、PR 验收和 npm 发布分别拥有触发方式。Release 的自动 main push 只使用明确的 prepare 模式；同仓库、已合并、目标 main、来源 `release/pnpm-version` 的 PR closed 事件才使用 publish。
自动 prepare 在启动昂贵验证前读取官方只读版本计划：有效待发布 intent 才继续；无待发布变更或已被新 main 取代的推送不启动 native。解析、计划或网络失败不能被写成无需验证。
prepare 保留完整 native、质量检查以及 before/afterVersion 生命周期，不消费轻量验收 receipt 授权 npm。
prepare 与正式发布使用不同并发组，避免 GitHub 单 pending 槽位让新 prepare 取代排队的 publish；正式发布与恢复保持串行，不自动取消。

自动 PR 事件先按真实 Git 内容证明纯版本变更，满足版本、固定组、workspace、CHANGELOG、intent 和 ledger 契约后登记等待手动验收。混入依赖、源码或修改历史台账仍执行原源码 CI。
此阶段不产生精确的必需 `SEO Quality Gate` 成功结果，因此保留现有 branch protection 就能阻止未验收版本 PR 合并。

`Version PR CI` 只有 workflow_dispatch 入口，必须选择 `release/pnpm-version` 分支。入口读取唯一未合并版本 PR，校验同仓库、main 目标、准确 head、当前 checkout、当前 main 祖先以及纯版本差异，再在该 head 运行 PR Gate、Release Gate、SEO、README、Architecture、Agents、CI、Benchmark、React Native 与 Lynx。
GitHub PR API 的 base SHA 可能仍对应历史基线：本轮实际 PR 返回 `172d57fb`，main 已为 `c4478139f`。入口与最终门禁均独立读取 main ref，不能用 PR 响应中的旧 base 代替当前 main。
手动复用调用不传元数据快路径的 base/head 参数，正式 CI 使用原有完整范围；所有应执行子工作流都必须成功，skipped、cancelled、failure 均不能满足汇总。
最终输出稳定 `PR Gate` 和 `SEO Quality Gate` 前重新核对 PR head 与 main；单独在版本分支启动 SEO 仅输出 `Version PR SEO verification`，不能代替完整验收。

## 验证

本地回归设置 `CI=1`、`--update=none`，覆盖旧 head、错误分支、同名外仓 PR、重复/已合并 PR、未知 Git 边界、main 前进、混入源码/依赖、历史台账篡改、汇总失败与自动等待名称。
定向执行版本路由、汇总、官方 prepare/prerelease plan、release stages、内容分类与取消生命周期测试，13 files / 306 tests 通过；ESNext/Bundler 严格类型检查、受影响新文件的显式 ESLint、12 个工作流 actionlint、`pnpm agents:check`（59 rules / 261 documents）与 diff 检查通过。旧 `workflows.test.ts` 被仓库 ESLint 配置忽略，强制检查时仍有历史格式错误；本次修改的表达式使用模板字面量并移除生命周期块内遗留未使用变量，不扩大到无关全文件格式重写。
工作流检查确认手动验收只有读权限、不启动 prepare/publish、不申请 npm OIDC；发布 OIDC 身份仍在原 release.yml 中。
具体远端 run 与准确 head 在本轮最终验收记录中分别统计成功、跳过、取消和未完成，自动登记不计为正式测试通过。

`ecd0676ee` 推送自动触发 [prepare 38048985622](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38048985622)，8 个 native 目标、verify 与 prepare 全部成功；npm upload、confirm、finalize 跳过。#1279 自动更新为 `fc3619e0f89db0fd7dc0a80a597b8ad029434075`，真实差异证明 metadata_only=true。
同 main 的 [OIDC-only 38049131542](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38049131542) 对全部 39 个公开 workspace 包交换成功，HTTP 201；其余阶段均跳过。

第一次 [手动验收 38051370442](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38051370442) 绑定新 head 后发现两项安装边界：macOS Node 22 + pnpm 11 在默认约 2GiB V8 堆退出 134；最小 Node 场景残留 22.12.0，低于根 engines 的 22.18.0，也低于 pnpm 11 的 22.13 启动要求，退出 1。两项均在测试开始前失败，不能记为业务断言失败或用重跑掩盖。
修复统一 CI 的安装保护入口，为安装子进程设置受可用内存约束、最大 4GiB 的堆预算，保留显式 Node 参数且不改变父进程或后续测试的预算；最小 Node 场景对齐现有 engines，并用契约测试防止漂移。
两项修复整合后 6 files / 101 tests 通过，真实安装子进程探针验证 frozen-lockfile 参数与环境隔离；另在 Node 22.18 实际运行 11 项回归通过。受影响新文件显式 lint、严格类型、actionlint、规则与 diff 检查通过；最终仍需重新生成的 PR head 远端确认。

## 操作入口

1. 将 change intent 和修复提交到 main，等待 Release 自动 prepare 更新版本 PR。禁止手工推送生成分支。
2. 在 Actions → Version PR CI → Run workflow 选择 `release/pnpm-version` 分支启动正式 CI。
3. 当前 head 的全部应执行检查成功后，由维护者合并版本 PR。Release 自动发布准确 merge SHA。
4. 如果正式 CI 失败，在 main 修复；自动 prepare 更新 PR 后再对新 head 人工启动验收。

可使用相同的 CLI 入口：

```sh
gh workflow run version-pr-ci.yml --repo weapp-tailwindcss/weapp-tailwindcss --ref release/pnpm-version
```

手动 Release prepare 仍保留为 main 的补救入口；alpha/beta/rc/next 预发布线在 Release 中人工选择 auto，保留官方 prerelease 生命周期。main 的 auto 和预发布线的 prepare 被拒绝，防止混淆准备与发布。本次任务不发布 npm、不合并版本 PR。

## 适用边界

源码 PR 的自动 CI、branch protection、正式发布的完整验证、trusted publishing/OIDC 与恢复 checkpoint 均保留。
一个 head 的成功不授权后续 head；重新生成版本 PR 后必须重新验收。版本分支不包含最新 main 时先等待生成，不用旧产物代验。

## 规则评估

修订根规则的现有生成分支条目，统一到本操作入口。先前的手动 prepare 策略记录标记 superseded，保留其内容分类与 OIDC 证据。
不新增以标题、作者或分支名豁免源码验证的规则。
