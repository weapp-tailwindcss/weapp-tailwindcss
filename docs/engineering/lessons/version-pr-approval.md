---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1279
baseline: e75fd41019dd679bcba7b3d8f74e965171bee10d
regressions:
  - packages/weapp-tailwindcss/test/ci/version-pr-route.test.ts
  - packages/weapp-tailwindcss/test/ci/version-pr-approval.test.ts
  - packages/weapp-tailwindcss/test/ci/version-pr-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/manual-version-gates.test.ts
---

# 版本 PR 内审批验收

## 症状

用户要求 main 自动生成或更新版本 PR；版本 PR 的检查自动出现待审批 run，在 PR 内批准后执行 CI，合并后自动发布。原实现要求进入 Actions 手动 Run workflow，入口不符合此操作方式。

## 根因与纠正

GitHub 原生 “Approve workflows to run” 用于 fork PR，不能通过 YAML 为本仓库的版本分支强制启用。用户确认采用环境审批：在 PR 检查详情中点击 **Review deployments → Approve and deploy**。这只是 CI 放行操作，按钮名称由 GitHub 决定。

`Version PR CI` 改为 `pull_request` 自动触发，只对同仓库 `release/pnpm-version → main` 执行身份验证。真实 Git 内容必须是合法版本、CHANGELOG、intent 和 ledger 变更；审批前独立读取当前 main，绑定事件中的 PR 编号和 head，不能拿临时 merge SHA 或 API 的后续 head 代验。

验证成功后进入 `version-pr-ci` 环境的一个审批 job。该环境 required reviewer 已配置为 `sonofmagic`；允许其审批自己创建的 run。没有配置环境 secrets，也不授予 npm OIDC 权限。`deployment: false` 保留 required reviewers，等待时不占用 runner，同时不创建 deployment 历史。审批配置缺失或非法时，身份验证直接失败，避免 GitHub 自动创建空环境后无审批运行。

所有昂贵子工作流依赖审批成功。批准后再次核对当前 PR head 与 main；新 head 产生新的审批，旧 run 被版本 PR 的并发规则取消。最终 `PR Gate` 和 `SEO Quality Gate` 都复查 freshness，任何必需检查失败、取消或跳过不能满足汇总。普通源码 PR 不产生版本专用的精确必需门禁名称，也不进入此审批队列。

完整验收显式向共享工作流传 `full_verification: true`。共享范围仍审计真实 diff，但为审批后的执行计划启用全部范围；避免 PR 事件按纯版本变更跳过 native、CSS、watch、移动端、demo 和 benchmark。所有完整验收 checkout 绑定作者 head，scope、CSS 嵌套与 native ref 逐层保持一致。完整子工作流与自动轻量检查使用不同并发组，防止互相取消；普通源码 PR、普通手动检查及 main push 的原行为保留。

main 的合法 intent 仍自动 prepare。合并版本 PR 后仍由原 `release.yml` 对准确 merge SHA 自动 publish；版本准备、正式发布、恢复、Node 24、provenance 与 npm trusted publishing/OIDC 不改入口。

## 操作入口

1. 将 intent 和修复提交 main，等待自动 prepare 更新版本 PR。
2. 在版本 PR 的 Checks 中找到 **Version PR CI / Approve version PR CI**，打开 Details。
3. 点击 **Review deployments**，选择 `version-pr-ci`，点击 **Approve and deploy**。
4. 当前 head 的全部检查成功且 PR review 满足保护要求后，合并版本 PR。Release 自动发布准确 merge SHA。
5. CI 失败时在 main 修复；自动 prepare 更新 PR 后，审批新 head 的 run。

拒绝审批会阻断 CI；等待状态不算检查成功。无需进入 Actions 手动 Run workflow。审批只控制 CI，不能代替 PR review 或授权跳过发布验证。

环境由仓库 Settings → Environments → `version-pr-ci` 管理。若新增 reviewer，至少保留一个有仓库读取权限的用户或团队；无需创建 secrets。当前 branch policy 为允许所有 ref，版本 PR 身份由工作流与真实内容验证限制。管理员仍可使用 GitHub 的显式手动 bypass，工作流不执行自动批准或 bypass。

## 验证

本轮先固化 PR 事件、merge/head 区分、跨仓身份、非法事件、旧 head、PR 编号替换、缺失环境 reviewer、审批依赖与完整范围的失败回归，再实现修复。正常测试使用 `CI=1`、`--update=none`、`--coverage.enabled=false`。

GitHub API 已配置并回读 required reviewer；实际记录通过与 CI 相同的环境校验函数。后台临时探针只验证 `deployment: false` 的真实 Waiting 状态与下游阻断，不批准、不发布。准确 run、回归数量、命令及清理在本轮最终证据中记录。

当前 #1279 已合并，仓库没有新的待验收版本 PR；因此尚未执行下一版本 PR 的批准后完整远端矩阵。首次新的版本 PR 必须审批并核验准确 head 后，再依据真实结果合并。前一轮成功矩阵记录仍仅证明旧 head，见 [原手动验收记录](version-pr-manual-ci.md)。

官方依据：[fork PR 审批](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks)、[环境审批 UI](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)、[无 deployment 的环境审批](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments#using-environments-without-deployments)。

## 适用边界

审批配置是 GitHub 仓库设置，不能仅靠克隆代码恢复；CI 会校验缺失保护并拒绝继续。受管分支不能混入源码或依赖修复；必须先改 main，再由 repoctl 重建。手动批准旧 head、旧成功检查、自动范围登记均不能放行当前版本。

本轮不创建额外包 intent，不改包 API，不自动合并版本 PR，不以验证为目的发布 npm，不启动本地全端验收。

## 规则评估

修订根规则的既有版本分支条目与权威操作文档；原 Run workflow 文档标记 superseded 并保留历史证据。审批配置、准确 head 和完整范围由可执行回归约束，不新增按标题或作者绕过测试的规则。
