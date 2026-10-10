---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1280
baseline: 7829cce3ecdff1b6b32a60a3d59a3a6194013894
regressions:
  - packages/weapp-tailwindcss/test/ci/release-stages-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-stages.test.ts
  - packages/weapp-tailwindcss/test/native-ci-dependencies.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/native-release.test.ts
---

# repoctl 5.10 与 Release 阶段、依赖缓存

## 症状

2026-10-10 核对 npm `latest` 后，将 repoctl 从 5.9.0 升至 5.10.0。
此前只生成版本 PR 的运行也先等待八平台 native 矩阵，再串行执行全部质量检查：

| 运行 | 总耗时 | native 关键路径及排队 | Release job |
| --- | --- | --- | --- |
| [38032687850](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38032687850) | 34 分 32 秒 | 22 分 43 秒 | 11 分 45 秒 |
| [37953372652](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37953372652) | 93 分 18 秒 | 78 分 38 秒 | 14 分 36 秒 |

第二次先等待旧 Release 并发组约 31 分钟，macOS runner 另有最长约 41 分钟排队。
这些等待属于调度成本，不能计为编译耗时。
两轮 repoctl 步骤内的全仓 build 分别约 185/240 秒，test 约 322/427 秒。
native 冷安装日志为全部 94 个 workspace、`reused 0`；Windows ARM 两轮约 689/521 秒，macOS Intel 约 318/207 秒。
Linux 为 Node 24 构建、Node 22 ABI 和独立 PostCSS Node 20 ABI 各执行一次依赖安装。

## 根因与纠正

- 安装缓存没有覆盖 native 的宿主机或容器。现在 macOS/Windows 使用 setup-node 的 pnpm store 缓存；Linux 使用显式挂载的 store；Cargo 只缓存 registry/git 下载。native 目标分隔缓存，Rust 下载缓存包含工具链版本和两个 Cargo.lock 摘要；仍执行全部 build、test、clippy 和 ABI 验证。
- Linux 后两个容器复用同 job 安装的 node_modules。成功安装后原子生成身份标记，绑定 target、run、attempt、job，以及被跟踪的 manifests、锁文件、workspace 配置、npmrc、pnpmfile 和 patches。标记缺失、配置变化或安装失败均阻断复用；node_modules 和标记不进入跨运行缓存。Node ABI 切换是验证目的，因此不放进身份摘要。
- Release 之前只有一个长步骤。现在先用 repoctl `--stage plan` 路由，无触发时跳过 native；正式 job 下载并 stage 本轮完整产物后重新 plan，再执行 verify、prepare、upload、confirm、finalize。六阶段共享同一 checkout；路由 job 的 receipt 不传给正式 job。
- repoctl 5.10 的 receipt 会检查源码、候选版本、配置、输入和 run/attempt 身份。验证失败或身份变化不能继续准备；prepare 复用本轮验证授权，不重复执行 quality scripts。
- OIDC 审计改用官方 `--mode oidc-audit`，独立 job 且隔离恢复参数；并发组加审计后缀，避免审计等待正常发布。保留 release.yml 身份、Node 24、`id-token: write` 和 provenance。删除 setup-node 的 registry-url，避免生成缺失 NODE_AUTH_TOKEN 的认证占位；registry 仍由工作流环境变量指定。
- checkout 与发布阶段使用相同 GitHub token 优先级。实际发布继续串行，失败时只上传进度 JSON，confirm/finalize 不使用 always 或忽略错误。Release timeout 调整为 45 分钟，容纳质量检查和上游默认最长 15 分钟的公开 registry 可见性等待。

上游依据：[阶段契约](https://github.com/icelib/repoctl/blob/8e2d1f9b465707214a428e405d5f9a3d5eb55833/docs/release-stages.md)、[官方工作流](https://github.com/icelib/repoctl/blob/8e2d1f9b465707214a428e405d5f9a3d5eb55833/.github/workflows/release.yml)。发布模板仍是 `release/v2`。

## 验证

本地 macOS / Node 24.18.0 / pnpm 12.9.1：

- 先新增工作流回归，旧实现四项失败；修改后通过。
- 以下定向测试共 115 项通过，包括真实 repoctl API、阶段身份与顺序、质量只执行一次、验证失败不 push/publish、官方 OIDC 安全报告，以及原有 native 版本转换和 GitHub Release 恢复回归：

```sh
CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/ci/workflows.test.ts test/ci/release-stages-workflow.test.ts test/ci/repoctl-stages.test.ts test/native-ci-dependencies.test.ts test/native-release.test.ts test/ci/repoctl-release.test.ts test/ci/repoctl-release-notes.test.ts test/ci/release-oidc-preflight.test.ts --update=none --coverage.enabled=false
```

- 冻结安装通过；锁文件只有根 importer 的 repoctl 发生变更，保留原 vite8 8.3.1 解析。依赖图移除的是上游升级不再需要的依赖。
- 三个新增测试文件的定向 TypeScript 检查通过；native helper 的 ESLint、Node 语法检查、Linux shell 语法检查及两个工作流的 actionlint 通过。
- 实际执行 helper 的首次冻结安装与相同身份的复用入口通过；该本地验证没有启动 native 构建或多端环境。
- `pnpm release status` 仍确认 css-compat 0.1.0 → 0.1.1，由既有中文 intent 驱动；本轮工程优化不新增公开包版本提升。
- 执行 `pnpm agents:check` 和 diff 检查。

## 适用边界

本轮保留默认 build/lint/test、全部 native 版本钩子和原有 explicit publish 的同提交 coverage certificate 门禁。
阶段 receipt 不替代证书，诊断 artifact 也不具有发布授权。
没有更改生成分支 release/pnpm-version、合并版本 PR 或执行 npm publish。

尚未验证本次远端八平台矩阵、容器缓存命中或完整实际上传，因此不宣称已达到某个提速百分比。
下一轮以相同类型 Release run 的 job/step 耗时、缓存命中及队列等待分别对照，再决定是否设计 prepare 专用质量证据与构建范围。
不直接删除 prepare 的 native 前置要求，也不使用跨 runner receipt 绕过最终验证。

## 规则评估

现有 repoctl 生命周期、OIDC、生成分支所有权和先验证后交付规则已覆盖本轮边界，不新增 AGENTS 规则。
将本轮可执行约束放进持久回归；不因一次冷安装或排队记录放宽测试门禁。
