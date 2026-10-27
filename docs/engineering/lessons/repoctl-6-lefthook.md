---
status: partial
issue: https://github.com/icelib/repoctl
baseline: 60aca0b2377457a29ac7dc23309abb6690b25c6e
regressions:
  - packages/weapp-tailwindcss/test/ci/git-hooks/commit.test.ts
  - packages/weapp-tailwindcss/test/ci/git-hooks/install.test.ts
  - packages/weapp-tailwindcss/test/ci/git-hooks/config.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-previous-release.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - scripts/agents/eslint-scope.test.mjs
---

# repoctl 6.2.1 与 Lefthook 迁移

## 症状

2026-10-27 评估时，仓库安装 repoctl 5.10.3，npm 最新稳定版为 6.2.1。根开发环境声明允许 Node 22.18.0，而新版 repoctl 要求 `^22.23.4 || ^24.22.1 || >=26.12.1`；`.nvmrc` 仍指向更旧的 22.16.0。已有 Husky/lint-staged 承担暂存文件 ESLint 自动修复与提交消息检查。

升级后的第一次发布回归有五个测试文件无法导入 repoctl，错误为 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`，指向 `@arethetypeswrong/core/src/index.ts`。同一安装下，原生 Node 导入 repoctl 成功，加上 `--conditions=development` 后可重现失败。

## 根因与纠正

- repoctl 6.2.1 的发布 API、六阶段命令及 `.changeset/ledger.yaml` 的 `{ dir, intents }` 格式保持兼容。新增 snapshot、制品发布与提交检查策略是可选能力，本次保留现有发布架构。
- 开发工具链对齐新版 Node 要求，默认 Node 24.22.1；Vitest、UI、coverage 统一为 5.0.5，commitlint CLI 为 21.2.4。公开包的 Node 范围保持原样。兼容工作流先在受支持的开发 Node 安装、构建、验证 hooks，再切回 Node 22.18.0 执行原最低运行时用例；native 的旧 Node ABI 验证保持。
- 官方 6.2.1 仍使用分页 Release 列表判断已知版本是否存在。将[准确 tag 查询补丁](../../../patches/@icebreakers__monorepo@6.2.1.patch)移植到新 dist chunk 和类型声明，继续仅将 404 判为缺失；空体、数组、错 tag、权限异常、draft、prerelease、checkpoint 和 tag/gitHead 冲突保持阻断。不能通过删除旧补丁消除安装失败。
- repoctl 新增的制品检查静态依赖 `@arethetypeswrong/core`，该包的 development 出口指向未编译 TS。Vitest 5 默认向 worker 添加 development 条件。主包测试使用 Vite 后置 `configEnvironment`，在默认条件合并后替换 Node 环境的条件为 `node`，使测试按实际 Node CLI 加载发布入口。单独声明 `ssr.resolve.conditions` 仍会被默认数组追加，不能解决问题；无需改 NODE_ENV、内联依赖或 alias 第三方内部文件。
- 使用精确版本 Lefthook 2.2.2，移除 Husky/lint-staged。原生 pre-commit 的 glob/exclude 与 [Node runner](../../../scripts/git-hooks/staged-eslint.mjs) 一致，保留既有 ESLint 范围。runner 从 Git NUL 输出取文件，以 Node 参数数组分批调用 ESLint，避免文件名 shell 插值及 Windows 参数长度限制。
- Lefthook 负责隐藏、恢复部分暂存文件的未暂存修改及 `stage_fixed`。runner 不自行 stash 或重新暂存。真实 Git 回归覆盖成功修复、后续检查失败、恢复冲突、重命名、删除、特殊文件名和 commitlint 路径传递。
- 根 prepare 使用 `repo tooling hooks install --json`，禁止 Lefthook 自身 postinstall。官方安装器保护自定义和继承的 hooksPath。它允许从 linked worktree 安装到共享 hooks，因此本轮真实工作树安装始终使用 `CI=1 LEFTHOOK=0`；启用安装只在隔离 Git fixture 验证。未更改用户 checkout 的 `.husky/_` 设置。

补丁移除条件：上游 npm 版本包含准确 tag 只读查询及等价拒绝门禁，再通过现有前序发布回归后，同时删除 patch、workspace 和 lock 登记。原问题证据见[此前发布完整性记录](main-ci-evidence-boundaries.md)。

## 验证

环境为 macOS、Node 24.22.1、pnpm 12.14.0，基线加本轮未提交改动；原始基线不包含本次升级。

发布、版本 PR、metadata、工作流、workspace 消费方与 hooks 的定向命令：

```sh
CI=1 LEFTHOOK=0 pnpm --config.verifyDepsBeforeRun=false --filter weapp-tailwindcss exec vitest run \
  test/ci/repoctl-stages.test.ts test/ci/repoctl-release.test.ts \
  test/ci/repoctl-previous-release.test.ts test/ci/repoctl-release-notes.test.ts \
  test/ci/npmmirror-sync.test.ts test/ci/release-stage.test.ts \
  test/ci/release-stage-source.test.ts test/ci/release-route.test.ts \
  test/ci/release-dispatch.test.ts test/ci/release-trigger-workflow.test.ts \
  test/ci/release-stages-workflow.test.ts test/ci/auto-prepare-plan.test.ts \
  test/ci/workflows.test.ts test/ci/version-pr-approval.test.ts \
  test/ci/version-pr-route.test.ts test/ci/version-pr-workflow.test.ts \
  test/ci/release-metadata.test.ts test/ci/release-metadata \
  test/ci/verify-packed-packages.test.ts test/ci/packed-runtime-dependencies.test.ts \
  test/ci/approved-version-gates.test.ts test/ci/git-hooks --update=none
```

上述命令最终 26 个文件、506 项全部通过。新增工具链测试最初直接读取公开包未导出的 package.json 子路径而失败，改为从仓库 manifest 读取后定向复验及整组复验均通过。

其他验证：

- `CI=1 LEFTHOOK=0 pnpm install --frozen-lockfile`：通过，使用当前锁文件且没有重新解析依赖。
- `CI=1 LEFTHOOK=0 pnpm --config.verifyDepsBeforeRun=false run prepare`：通过，明确返回 `status: skipped, reason: ci`，未改共享 Git 配置。
- `CI=1 LEFTHOOK=0 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c scripts/agents/vitest.config.mts scripts/agents/eslint-scope.test.mjs --update=none`：25 项通过，确认真实 ESLint 配置图不启用 Prettier。
- 从根项目执行 `vitest run --project weapp-tailwindcss test/ci/repoctl-previous-release.test.ts --update=none`：13 项通过，确认项目聚合入口也消费相同 Node 条件。
- 修改的脚本、配置与工作流定向 ESLint 通过；`stylelint --print-config packages-runtime/ui/src/index.css` 通过；真实 `readSnapshot` 成功读取 32 个公开源码包及 pnpm 12 的双文档锁文件。
- 锁文件语义检查确认 pnpm 工具链文档未变；非根 importer 的依赖声明和基础版本仅有 Vitest catalog 升级，其余为 peer 上下文重算。公开包 manifest 未修改。
- `pnpm agents:check` 和 `git diff --check`：通过。

## 适用边界

本轮只做本地定向验证，未运行全仓、多端、Windows/Linux 原机或远端 CI，未执行真实版本准备、npm 上传或 GitHub Release 写入。真实发布与 OIDC 行为通过原有隔离客户端回归验证，不将其描述为真实发布证据。Windows、Linux/macOS 的工作流兼容作业已加入独立 hook 集成测试，执行位置在最低运行时切换之前。

本次只升级私有工程工具，没有公开包行为变化，不新增 change intent 或调整公开包版本。原 checkout 的 Tailwind 子模块外部变动保持原样。

## 规则评估

不新增跨仓库安全边界。将根 AGENTS 的首次安装说明由 Husky 更新为 Lefthook；按现有“批量写文件链路”触发条件增加 scripts/git-hooks 的领域入口并同步索引，明确 runner 与 Lefthook 的职责。提交检查边界、部分暂存和 Git 配置保护由持久回归维护。
