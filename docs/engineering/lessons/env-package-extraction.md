---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/f61a697a3dd82670797c14aa063f6a87790ee16e/packages/weapp-tailwindcss/src/framework/index.ts
baseline: f61a697a3dd82670797c14aa063f6a87790ee16e
regressions:
  - packages/env/test/environment.test.ts
  - packages/env/test/framework.test.ts
  - packages/env/test/platform.test.ts
  - packages/env/test/project.test.ts
  - packages/weapp-tailwindcss/test/framework.test.ts
  - packages/weapp-tailwindcss/test/context-cache.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-app-type.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/ensure-built-env.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-graph.test.ts
  - packages/weapp-tailwindcss/test/ci/client-boundaries.test.ts
  - packages/weapp-tailwindcss/test/ci/env-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/approved-version-gates.test.ts
---

# 环境识别包提炼与显式快照隔离

## 症状

框架、平台与 HBuilderX 的事实识别位于主包，其他构建工具难以独立消费。框架模块同时包含 Vite root 的最近 package 边界规则，将通用识别和构建器策略放在了同一入口。

当进程设置 `UNI_PLATFORM=h5`、`UNI_UTS_PLATFORM=app-android` 时，传入空 `env` 快照仍会识别出 uni-app x；部分快照也会继承缺失的 UNI 字段，导致检测结果与调用方提供的环境不一致。

## 根因与纠正

`resolveUniPlatformsFromEnv` 将快照字段交给带默认参数的单值函数。字段为 `undefined` 时触发默认参数，重新读取进程环境。回归先固定进程 UNI 环境，验证空、部分、显式 undefined 和完整快照：修改前环境回归 5 项失败、4 项通过，修改后全部通过。

新包 `@weapp-tailwindcss/env` 按类型、环境、平台、依赖识别、项目扫描与 HBuilderX 拆分，生产源码只依赖 Node 内置模块。快照解析直接使用无环境默认值的 `resolvePlatform`；单值解析函数的省略参数及显式 `undefined` 行为继续保留。默认环境在每次调用时读取。

主包旧入口显式转导出新包 API，HBuilderX 与 uni 平台工具层委托新包。`resolveImplicitAppTypeFromViteRoot` 留在主包的 `framework/vite-root.ts`，仍在最近 package 边界停止。构建器 profile、生成器 target、preset 和样式策略保留原判断条件及配置优先级。

最初计划用 manifest `0.0.0` 加 minor intent 生成首发 `0.1.0`，实际 `pnpm release status` 却显示 `0.0.0 → 0.0.0`。核对 [pnpm 12.9.1 首发规则](https://github.com/pnpm/pnpm/blob/v12.9.1/.changeset/first-release-verbatim.md)及 [versioning 实现](https://github.com/pnpm/pnpm/blob/v12.9.1/pnpm/crates/versioning/src/plan/versions.rs)后确认：manifest 版本未在 registry 发布时，首发直接采用该版本，bump intent 不推进它。临时 `0.0.1` fixture 也保持 `0.0.1`。因此将新包初始化为 `0.1.0`，保留 env minor、主包 patch 中文 intent，继续通过 repoctl 编排；未执行版本落盘或 npm 发布。

## 验证

验证日期为 2026-10-11，基线与分支见 frontmatter、`codex/extract-env`。环境为 macOS arm64、Node 24.18.0、pnpm 12.9.1。使用独立 worktree，原 checkout 未修改；普通单测均使用 `CI=1` 与 `--update=none`。

通过的定向命令：

```sh
pnpm install --frozen-lockfile --filter weapp-tailwindcss... --filter @weapp-tailwindcss/env --filter @weapp-tailwindcss/cli --ignore-scripts
pnpm --filter @weapp-tailwindcss/env exec cross-env CI=1 vitest run --update=none
pnpm --filter weapp-tailwindcss exec cross-env CI=1 vitest run test/framework.test.ts test/bundlers/framework-selector.test.ts test/bundlers/vite-app-type.unit.test.ts test/utils/hbuilderx.test.ts test/utils/uni-platform.test.ts test/core-options.test.ts test/options.test.ts test/runtime-branch.test.ts test/runtime-branch-platform.unit.test.ts test/presets test/ci/architecture-package.test.ts --update=none
pnpm --filter weapp-tailwindcss exec cross-env CI=1 vitest run test/ci/architecture-graph.test.ts test/ci/client-boundaries.test.ts test/ci/ensure-built-env.test.ts test/ci/verify-packed-packages.test.ts --update=none
pnpm --filter weapp-tailwindcss exec cross-env CI=1 vitest run test/context-cache.test.ts --update=none
pnpm exec cross-env CI=1 vitest run --config e2e/vitest.e2e.config.ts e2e/demo-workflow-extended.test.ts e2e/package-homepages.test.ts --update=none
pnpm --filter @weapp-tailwindcss/env typecheck
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
pnpm --filter weapp-tailwindcss tsd
pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/cli run build
pnpm --filter @weapp-tailwindcss/env test:package
pnpm architecture:check
pnpm agents:check
pnpm docs:packages:check
node scripts/verify-package-homepages.mjs --skip-network
pnpm release status
git diff --check
```

- 新包 4 文件 61 项、主包消费者及 context 15 文件 145 项、CI 契约 4 文件 41 项、E2E 元数据契约 2 文件 19 项，共 266 项定向测试通过，无 skip。
- 23 个受影响依赖项目构建通过。env 根入口包含 ESM/CJS 及 `.d.ts` / `.d.cts`；主包原 framework 产物路径保留。类型检查和旧入口 tsd 通过。
- [workspace 外 tarball 消费脚本](../../../packages/env/scripts/verify-package.mjs)验证裸包 import、require、旧 framework 入口、快照隔离、生产依赖版本与 `.mts` / `.cts` NodeNext 类型；使用 strict 且不跳过声明检查，返回类型断言拒绝退化为 `any`。新包无生产依赖、无源码泄露，主包 packed manifest 将 env workspace 依赖改写为 `0.1.0`。临时目录由 `os.tmpdir()` 创建并在 finally 清理。
- 缺失 env 产物与源码更新的持久回归验证自动构建顺序。架构门禁拒绝 env 非 Node 内置依赖、生产依赖和其他 workspace 包的反向引用；客户端边界拒绝将其引入运行时包。
- 架构、规则、双语 README、主页路径、diff 与变更源码的 ESLint 检查通过。锁文件仅增加 env importer 与主包的 workspace 依赖；冻结安装通过。
- `pnpm release status` 确认 env `0.1.0 → 0.1.0` 首发与主包 `5.6.0 → 5.6.1` patch。输出还包含基线已有 intent 及依赖传播，不将整个计划归因于本次提炼。

## 适用边界

本轮只验证包级和主包定向契约。未运行全面测试、真实微信 IDE、HBuilderX、设备或浏览器 E2E，也未验证 Windows/Linux 的真实执行环境；跨平台路径语义通过 POSIX、Windows 反斜杠、盘符、UNC、相对根和根目录终止 fixture 验证。主页检查使用 `--skip-network`，不证明线上可达。

没有修改 demo、issue 复现页或样式输出，因此没有对应 static 基线需要更新。未改变 generator/preset/bundler 的平台策略，不以更宽的 `isWeb` / `isApp` 判断替换现有分支；未知值、JSON 读取失败和父目录查找规则仍与旧实现一致。

## PR 前 CI 接入复核

用户随后要求提交 PR 并跟进 CI/CD，源码整合到 main `e976c4777`。审计确认根 Vitest 自动发现 env，主包生产依赖也让 `build:ci` 自动构建它；但包外消费测试只在 Ubuntu Release Gate 执行，且 Release Gate 的触发路径遗漏 env-only 源码变化。

新增 `env.yml`，在 Linux/macOS/Windows × Node 22/24 执行依赖闭包构建、env 类型、单测与公开 tarball 消费；PR Gate 的 `needs` 与成功断言显式包含 env，维持既有取消生命周期。tarball 同时消费旧 framework 入口，冷 checkout 因此先构建 `weapp-tailwindcss...`。Release Gate 补充 `packages/env/**`，`test:release` 补充 env typecheck，不改变发布权限或实际发布流程。

新增 CI 契约修改前 3 项失败；接入后，env-workflow、workflows、css-compat-workflow 与 workflow-gate-cancellation 共 4 文件 60 项通过。最新 main 上的 22 项依赖闭包构建及 env 类型、包外消费、规则检查再次通过。远端结果以 PR 的准确 head 为准，不复用本地或旧 head 的结论。

[PR #1283](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1283) 首个 head `575fa401201d024bfe59c8bb202b4331e15ee395` 的 [PR Gate](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38132021333) 与 Version PR CI 在 job 启动前失败。GitHub 原始错误为 `Invalid input, full_verification is not defined in the referenced workflow`。整合 main 后插入 env job 时，原 CSS job 的 `with` 被挂到了 env，env 尚未声明该输入；原局部断言只匹配 uses/needs，未验证调用接口，也未运行新版审批链路测试。

补充输入契约回归先确认 2 项失败，再为 env 声明 boolean/default false 的 `full_verification`、向共享 scope 转发并在完整验收时检出准确 PR head，恢复 CSS 的原转发。审批链路纳入 env，并遍历所有本地复用调用，验证未知输入与必填参数；所有声明了完整验收输入的嵌套调用必须继续传递该范围。

修复后显式执行 env-workflow、approved-version-gates、workflows、css-compat-workflow 与 workflow-gate-cancellation，5 文件 127 项通过；规则和 diff 检查通过。该回归验证调用接口，避免工作流在测试 job 启动前就因 YAML 输入合约失败。

## 规则评估

新增 env 包级 AGENTS 并登记规则索引，明确其独立发布、只读项目扫描、快照与依赖边界；架构职责文档同步事实识别与调用方策略的所有权。边界通过架构、客户端与产物消费回归固定，没有放宽根规则、IDE 会话边界或全面验收门禁。
