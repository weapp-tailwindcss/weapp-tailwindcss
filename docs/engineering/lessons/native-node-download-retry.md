---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1346
baseline: ce6b9f312915ece76247ae72ee4d8554f51d6e9e
regressions:
  - packages/weapp-tailwindcss/test/ci/release-stages-workflow.test.ts
---

# Native 最低版本 Node 下载恢复

## 症状

[Release 42832685300](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/42832685300)
的 Intel macOS 任务已完成原生构建、lint 与消费者验证，随后安装 Node 22.18.0 失败。
check-run 注释为 `getaddrinfo ENOTFOUND nodejs.org`，该平台的最低版本 ABI 检查和产物上传未执行，Release 被阻断。

## 根因与纠正

已观察故障是官方下载域名的 DNS 解析失败，不能据此判定 native 源码或 ABI 不兼容。
用户选择保留官方源并有限重试，不新增镜像、不降级版本。

为主机侧 Node 22.18.0 和独立 PostCSS 的 Node 20.19.0 安装分别保留最多三次尝试，
使用相同的固定 setup-node SHA。仅前次安装失败才等待 10 秒、20 秒后重试；成功后不再重复安装。
临时安装步骤允许记录失败，但随后不可忽略的门禁要求至少一次明确成功，三次失败时 job 仍失败。
ABI 验证同时要求安装成功，不能使用前一阶段残留的 Node 版本代验。

Linux 容器继续沿原入口验证 GNU/musl 与最低 Node ABI；八个平台仍须全部成功后才能进入 Release。

## 验证

修复提交为 `d06af8b7a39fcd8b964d2db52eeb657769159176`。独立 worktree 完成
`pnpm install --frozen-lockfile`，未共享可写依赖目录。

三个新增回归在原 workflow 上全部失败，修复后通过。契约覆盖固定 action SHA、官方源、精确版本、
最多三次尝试、递增等待、前次失败条件、成功门禁和执行顺序；门禁脚本通过真实 Node 子进程验证，
仅 `true` 放行，`false`、空值及非法值均以状态 1 退出。

以下相关测试共 5 个文件、93 项通过：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-stages-workflow.test.ts test/ci/release-trigger-workflow.test.ts test/ci/workflows.test.ts test/ci/manual-version-gates.test.ts test/ci/release-nightly/workflow.test.ts --update=none --coverage.enabled=false
pnpm exec eslint --no-ignore .github/workflows/native.yml packages/weapp-tailwindcss/test/ci/release-stages-workflow.test.ts
git diff --check
```

修复提交的独立八平台验收见 [Native 42841704370](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/42841704370)。
最终交付还需核对 PR 当前 head 的完整检查；旧 head 成功不能代替新 head 验收。

## 适用边界

本地回归验证重试配置和失败门禁，不模拟 GitHub runner 的 DNS 故障，也不声称能恢复持续性网络中断。
正常下载成功的远端运行只证明正常路径和真实 ABI，不单独证明网络失败后的恢复路径。
超过重试上限仍阻断上传；原失败 run 使用旧 workflow，重跑它不能验证新逻辑。
本次不改公开 API、最低 Node 支持范围、发布身份或包版本，也不启动本地全端验收。

## 规则评估

现有工程流程已覆盖基础设施故障分类、同 SHA 验证和发布门禁，无需新增 AGENTS 规则。
本次通过持久回归约束恢复行为，保留原有八平台验收与 repoctl 发布流程。
