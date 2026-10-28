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
  - benchmark/version-compare/test/dispatch-inputs.test.mjs
  - e2e/node-toolchain-workflow-contract.test.ts
  - packages/weapp-tailwindcss/test/ci/install-memory-workflow.test.ts
  - website/scripts/content-metadata.test.ts
  - website/scripts/metadata-environment.test.ts
  - scripts/agents/eslint-scope.test.mjs
---

# repoctl 6.3.0 与 Lefthook 迁移

## 症状

2026-10-27 评估时，仓库安装 repoctl 5.10.3，npm 最新稳定版为 6.2.1。根开发环境声明允许 Node 22.18.0，而新版 repoctl 要求 `^22.23.4 || ^24.22.1 || >=26.12.1`；`.nvmrc` 仍指向更旧的 22.16.0。已有 Husky/lint-staged 承担暂存文件 ESLint 自动修复与提交消息检查。

升级后的第一次发布回归有五个测试文件无法导入 repoctl，错误为 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`，指向 `@arethetypeswrong/core/src/index.ts`。同一安装下，原生 Node 导入 repoctl 成功，加上 `--conditions=development` 后可重现失败。

## 根因与纠正

- 最终升级到正式 repoctl 6.3.0，发布 API、六阶段命令及 `.changeset/ledger.yaml` 的 `{ dir, intents }` 格式保持兼容。稳定发布架构保留，新增 nightly 通过独立链路接入，详见 [Nightly 原生产物与发布身份](../nightly-publication.md)。
- 开发工具链对齐新版 Node 要求，默认 Node 24.22.1；Vitest、UI、coverage 统一为 5.0.5，commitlint CLI 为 21.2.4。公开包的 Node 范围保持原样。兼容工作流先在受支持的开发 Node 安装、构建、验证 hooks，再切回 Node 22.18.0 执行原最低运行时用例；native 的旧 Node ABI 验证保持。
- 官方 6.2.1 仍使用分页 Release 列表判断已知版本是否存在，迁移期间曾保留临时补丁。[上游源码 PR #1121](https://github.com/icelib/repoctl/pull/1121)以独立提交交付准确 tag 查询，并在 6.3.0 正式发布。只有明确 404 表示缺失；空体、数组、错 tag、权限异常、draft、prerelease、checkpoint 和 tag/gitHead 冲突继续阻断，旧注入客户端仍兼容。安装正式版并通过准确 tag 回归后，删除补丁文件、workspace 和 lock 登记。
- repoctl 新增的制品检查静态依赖 `@arethetypeswrong/core`，该包的 development 出口指向未编译 TS。Vitest 5 默认向 worker 添加 development 条件。共享插件 `scripts/testing/native-node-conditions.mjs` 使用 Vite 后置 `configEnvironment`，在默认条件合并后替换 Node SSR 与 Vitest 环境的条件为 `node`，使主包、test-helper 和网站这三个真实 CLI 消费方按实际 Node 加载发布入口。首轮完整 CI 暴露了原先仅覆盖主包的遗漏；插件不改变其他项目或浏览器环境。单独声明 `ssr.resolve.conditions` 仍会被默认数组追加，不能解决问题；无需改 NODE_ENV、内联依赖或 alias 第三方内部文件。
- 使用精确版本 Lefthook 2.2.2，移除 Husky/lint-staged。原生 pre-commit 的 glob/exclude 与 [Node runner](../../../scripts/git-hooks/staged-eslint.mjs) 一致，保留既有 ESLint 范围。runner 从 Git NUL 输出取文件，以 Node 参数数组分批调用 ESLint，避免文件名 shell 插值及 Windows 参数长度限制。
- Lefthook 负责隐藏、恢复部分暂存文件的未暂存修改及 `stage_fixed`。runner 不自行 stash 或重新暂存。真实 Git 回归覆盖成功修复、后续检查失败、恢复冲突、重命名、删除、特殊文件名和 commitlint 路径传递。
- 根 prepare 使用 `repo tooling hooks install --json`，禁止 Lefthook 自身 postinstall。官方安装器保护自定义和继承的 hooksPath。它允许从 linked worktree 安装到共享 hooks，因此本轮真实工作树安装始终使用 `CI=1 LEFTHOOK=0`；启用安装只在隔离 Git fixture 验证。未更改用户 checkout 的 `.husky/_` 设置。
- 手动补充的 [CI 兼容矩阵](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40541520612)在 Windows Node 22/24 各捕获一项失败：消息文件的绝对路径包含空格、中文与单引号，进入 repoctl 前已被截断。Lefthook 2.2.2 的 `{1}` 原样替换参数，Windows 执行器又手工拼接带双引号的 `CmdLine`；`scripts/runner` 同样拼接参数，迁移到 runner 不能修复原始信息丢失。官方待合并 [PR #1464](https://github.com/evilmartians/lefthook/pull/1464)和 [issue #1613](https://github.com/evilmartians/lefthook/issues/1613)记录了这些边界。
- commit-msg 因此改为原始参数桥接：官方 hook 模板在启动 Lefthook 前 source 仓库 rc，保存 Git 的原始 `$1` 到专用环境变量；Node helper 只读该值，以参数数组启动 repoctl。原计划的 `"{1}"` 命令插值停止使用。Git 明确保证 pre-commit、commit-msg 在工作树根执行，因此 rc 使用固定相对路径，不拼接本机绝对路径。rc 每次覆盖旧值，缺少原始参数时失败；特殊路径回归通过 `git hook run commit-msg -- ABS_PATH` 验证官方安装的真实入口。Lefthook 版本、受控安装器、部分暂存与安装保护职责保持。

补丁原移除条件现已满足：正式 npm 版本包含准确 tag 查询及等价拒绝门禁，本仓库前序发布回归通过。后续维护直接消费正式版本，不再维护此补丁。原问题证据见[此前发布完整性记录](main-ci-evidence-boundaries.md)。

上游同时交付显式参考 gitlink 清单、隔离源码准备回执、宿主平台过滤与真实 CJS 原生加载验证，公开 API 含类型测试和集成回归。fixed group 通过[版本 PR #1122](https://github.com/icelib/repoctl/pull/1122)计算并联动发布 repoctl、`@icebreakers/monorepo` 6.3.0。

[稳定发布主 job](https://github.com/icelib/repoctl/actions/runs/40525064775/job/122262277058)六阶段全部成功。两个 npm 包的公开 tarball SHA-512 与 registry integrity、SLSA v1 subject 一致，provenance 绑定 `release.yml@refs/heads/main`、run `40525064775/attempts/1` 和准确源码 `7dc84a1a84b33026742db972e258577df0639607`；两个 tag 和正式 GitHub Release 也指向该提交。registry metadata 未提供 `gitHead`，准确来源由 provenance 证明。源码与版本 PR 的九组 OS × Node 矩阵及原生 `PR Validation` 均成功；版本 PR 的 Dev Container 按纯生成版本变更跳过，源码 PR 的两组 Dev Container 已通过。

## 验证

最终环境为 macOS、Node 24.22.1、pnpm 12.14.0、repoctl 6.3.0，源码为 `52d6d6fb3ed431507194ae799e5edd0c365dcbcf` 加本轮依赖与记录改动；原始基线不包含本次升级。

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
  test/ci/approved-version-gates.test.ts test/ci/git-hooks \
  test/ci/release-gate-paths.test.ts test/ci/release-nightly \
  --update=none --coverage.enabled=false
```

上述命令在正式 6.3.0 下最终 34 个文件、618 项全部通过。新增工具链测试最初直接读取公开包未导出的 package.json 子路径而失败，改为从仓库 manifest 读取后定向复验及整组复验均通过。

其他验证：

- `CI=1 LEFTHOOK=0 pnpm install --frozen-lockfile`：通过，使用当前锁文件且没有重新解析依赖。
- `CI=1 LEFTHOOK=0 pnpm --filter weapp-tailwindcss... run build`：22 项目依赖闭包构建通过。
- `CI=1 LEFTHOOK=0 pnpm --config.verifyDepsBeforeRun=false run prepare`：通过，明确返回 `status: skipped, reason: ci`，未改共享 Git 配置。
- `CI=1 LEFTHOOK=0 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c scripts/agents/vitest.config.mts scripts/agents/eslint-scope.test.mjs --update=none`：25 项通过，确认真实 ESLint 配置图不启用 Prettier。
- 从根项目执行 `vitest run --project weapp-tailwindcss test/ci/repoctl-previous-release.test.ts --update=none`：13 项通过，确认项目聚合入口也消费相同 Node 条件。
- 修改的脚本、配置与工作流定向 ESLint 通过；`stylelint --print-config packages-runtime/ui/src/index.css` 通过；真实 `readSnapshot` 成功读取 32 个公开源码包及 pnpm 12 的双文档锁文件。
- 锁文件语义检查确认 pnpm 工具链文档未变；初始迁移的非根 importer 基础版本变化来自 Vitest catalog。最终 6.3.0 更新的包记录仅替换 repoctl 和 monorepo，额外刷新 benchmark/app 的既有 Vue compiler peer 上下文，未提升其基础依赖版本。公开包 manifest 未修改。
- `pnpm agents:check` 和 `git diff --check`：通过。

首次本仓库 PR 的 [Synthetic Performance Gate](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40529327825/job/122277840147)在 `d373bf6ae02fd9f509a908e4cccdcfd688b6bdef` 失败于诊断工作流测试：实际选择 22.23.4，测试仍期望 22.23.3，尚未进入性能采样。已同步精确版本断言和诊断说明；定向复现为 21 通过、1 失败，修复后 benchmark 工程回归 36 文件、279 项通过，未改性能预算。日志同时显示宽松的 `node-version: 22` 命中 hosted 缓存 22.23.3，低于新开发范围。根据 [setup-node 的缓存协议](https://github.com/actions/setup-node/blob/v6/docs/advanced-usage.md#check-latest-version)，在 49 个开发安装入口增加 `check-latest: true`，先刷新宽松版本解析；准确的 22.18.0、20.19.0 运行时切换与已有固定 HBuilderX 版本保持。新增契约在修复前识别全部遗漏，修复后 4 项通过；它扫描实际受管 YAML，并独立校验最低 ABI 及先安装、后切换的顺序。后续 CI 仍需核对实际解析的 Node，不能只看 job 名称中的主版本。

同一 head 的 Unit Tests 三个分片还发现三处测试边界问题：test-helper 与网站未使用真实 Node 解析条件；metadata 渲染测试缺少 Docusaurus context；浏览器 VM 回归依赖 CommonJS 导出形状，根聚合入口与独立网站入口表现不同。现已共享解析插件、补齐 production/next 的文档与博客渲染断言，并在没有 `process` 和 CommonJS `module` 的 VM 中执行真实 web bundle，通过 `globalThis` 观察来源注入。根聚合及独立网站入口分别 3 文件、29 项通过，test-helper 两文件、32 项通过。

最低运行时契约原来错误地要求 Node 22.18.0 满足根开发工具的引擎范围。测试现分别核对工作流实际选择的安装 Node、公开包运行时及 pnpm 范围，并验证安装、构建、hooks、切换、公开包回归的顺序。修复前 1 项失败，修复后相关安装与 hooks 配置 4 文件、17 项通过；没有抬高公开包最低运行时。

整合上述 CI 修复后，在原 34 文件命令中追加 `install-memory-workflow.test.ts`、`install-frozen-config.test.ts`、`install-workspace.test.ts`，共 37 文件、632 项通过；三个网站文件分别从根聚合与网站独立入口执行，各 29 项通过。test-helper 的两个真实 repoctl 消费回归 32 项、新 Node 工作流契约 4 项及 agents 检查通过。定向 ESLint 无错误，按仓库现有规则忽略两个测试配置路径；`git diff --check` 通过。

继续整合 Windows 原始参数桥接后，在提交 `b153b595d52ca5716b3502fcb2bd6fee7fe9aa02` 重新执行上述 37 文件，636 项全部通过；其中真实 Git hook 回归 19 项，包含部分暂存、失败恢复、冲突阻断、特殊绝对路径，以及缺参数拒绝和陈旧环境变量覆盖。新 helper、shell rc 与配置的定向 ESLint（显式 `--no-ignore`）、Node/shell 语法检查通过。六类合成 runner 的时钟 mock 同步修复后，8 文件、64 项通过，详见[时钟边界记录](ci-synthetic-artifact-clock.md)。上述本地结果来自 macOS，Windows 修复须以新提交的兼容矩阵确认。

手动完整 CI 另捕获 Vite 4 HMR 用例超过 120 秒。诊断证明夹具的 runtime 扫描了整个工作树；补充显式源码根及跨夹具污染断言后，Node 22.23.4、24.22.1 的 Vite 4–8 共 10 项通过。整合后 Node 24 再验 5 项通过；原 120 秒门限、CSS 修改与 emitFile 两轮重放断言保留。完整根因、可失败的负例及边界见[HMR 夹具源码根记录](vite-hmr-fixture-source-root.md)。

## 适用边界

本地仅执行定向验证，未运行本地全仓、多端或 Windows/Linux 原机验收；本仓库 PR CI、手动兼容矩阵和首次真实 nightly、官网 next 部署按准确提交分别记录。旧提交的远端成功不能证明后续修复已通过。上游源码、版本 PR 和稳定发布已真实执行，不能据此替代本仓库发布后消费者或线上验收。Windows、Linux/macOS 的工作流兼容作业已加入独立 hook 集成测试，执行位置在最低运行时切换之前。

本次只升级私有工程工具，没有公开包行为变化，不新增 change intent 或调整公开包版本。原 checkout 的 Tailwind 子模块外部变动保持原样。

## 规则评估

不新增跨仓库安全边界。将根 AGENTS 的首次安装说明由 Husky 更新为 Lefthook；按现有“批量写文件链路”触发条件增加 scripts/git-hooks 的领域入口并同步索引，明确 runner 与 Lefthook 的职责。提交检查边界、部分暂存和 Git 配置保护由持久回归维护。
