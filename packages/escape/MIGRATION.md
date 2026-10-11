# 源码来源、包名迁移与发布

## 固定来源

- 上游：[sonofmagic/weapp-core](https://github.com/sonofmagic/weapp-core)。
- 标签：`@weapp-core/escape@8.0.0`。
- 提交：[`abfdcce3a2486879524e8e593ea34ee73ef7f6a3`](https://github.com/sonofmagic/weapp-core/tree/abfdcce3a2486879524e8e593ea34ee73ef7f6a3/packages/escape)。
- npm 基准：`@weapp-core/escape@8.0.0`，integrity 为 `sha512-dH2zPSfsqEoIuAVLUu1UCEubfFdQoJo6gUneTpvUjz30hss/MgAkj6b1WEylCqOPT6g8d4bj66TWPRsg6QGcLA==`。

源码、测试、MIT LICENSE 和历史记录从固定提交导入。九个源码文件保持原样；测试/构建配置适配当前仓库，基准用例使用 Vitest 5 的 context.bench。原历史位于 `UPSTREAM_CHANGELOG.md`，源仓库保留 Git 历史，不导入整个仓库。

## 包名与版本

当前包名为 `@weapp-tailwindcss/escape`，目录为 `packages/escape`；版本重置为 0.0.1，由 repoctl 管理独立发布并记录中文 patch intent。pnpm 首次发布沿用 manifest 初始版本，不再额外递增；`pnpm release status` 应显示 `0.0.1 → 0.0.1`。不会沿用旧包的 8.x 版本或修改旧包发布配置。

公开函数、类型、映射语义和 ESM/CJS 导出路径保持不变，迁移消费者只需调整 import 和依赖包名。消费者包不新增 engines 限制，维护环境遵循根 Node/pnpm 要求。

公开 workspace 消费方统一使用 repoctl 要求的 `workspace:*`，打包时转换为同批发布的精确版本。原迁移保留 `workspace:~` / `workspace:^` 的做法会在 Release 的协议检查阶段失败，已由发布契约与真实 tarball 检查共同约束。`escape-published` 固定为旧包 npm 8.0.0 的测试 alias，不能改为本地链接。历史发布版 fixture、旧版本基准和历史文章继续记录旧包身份。

双向符号还原应显式传入同一 `map`，与 runtime 的共享映射策略一致。迁移不会调整默认 unescape 行为；JS 字符串语法转义、regex 与其他间接依赖不迁移。

## 首次发布

1. 使用 `pnpm release status` 确认新包及切换生产依赖的消费者具有中文 patch intent。
2. 先确认新包已在 npm registry 建立。npm 的 `trust` 命令要求包已经存在且当前账号具有写权限并启用 2FA；不能为返回 404 的包预先绑定 trusted publisher。首次发布的初始化方式需单独确认，不能向现有 OIDC Release 工作流注入发布 token。
3. 包建立后，使用 `pnpm exec npm trust github @weapp-tailwindcss/escape --repo sonofmagic/weapp-tailwindcss --file release.yml --allow-publish --yes` 绑定本仓库，再用 `pnpm exec npm trust list @weapp-tailwindcss/escape --json` 核对；当前无 GitHub environment。不修改旧包的 trusted publisher。
4. 由 repoctl 和现有 Release workflow 发布，保留 Node 24、OIDC 和 provenance，不在此迁移任务中发布 npm 包或注入发布 token。新包首次发布权限和 trusted publisher 的配置需要在发布前核验。
5. 新包可从 npm 安装后，再同步仍锁定已发布依赖的独立模板，重新生成其真实锁文件并验证冻结安装。不得为尚未发布的包编造 registry integrity 或锁文件。

打包检查在 workspace 外加载 tarball，验证新包名的 ESM/CJS、双端类型及消费者依赖范围。实际验证记录见下方。

## 首次发布结果（2026-10-02）

`@weapp-tailwindcss/escape@0.0.1` 已完成账号初始化发布。npm 的 stage 新包初始化请求实际返回 404，用户随后明确授权本轮首次发布例外；该版本没有 OIDC provenance。后续已通过 `npm trust` 建立并读回 `sonofmagic/weapp-tailwindcss` / `release.yml` 的 GitHub Actions 发布权限。实际命令、失败边界与产物校验见[发布复盘](../../docs/engineering/lessons/escape-release-protocol.md)。

## 本次验证记录

以下验证针对迁移与改名涉及的包，未启动全仓或多端 E2E。

- `pnpm install --frozen-lockfile --ignore-scripts --offline`：冻结安装通过；锁文件仅调整九个相关 workspace importer。
- `CI=1 pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/cn... --filter @weapp-tailwindcss/merge... run build`：15 个包的依赖闭包构建通过。
- `pnpm --filter @weapp-tailwindcss/escape test`：11 个文件、120 项通过，包含 npm 8.0.0 对照。
- `pnpm --filter @weapp-tailwindcss/escape typecheck`、`pnpm --filter @weapp-tailwindcss/escape test:types`：源码类型与打包声明测试通过。
- `pnpm --filter @weapp-tailwindcss/escape test:package`：0.0.1 tarball 的 ESM/CJS、双端类型、五个消费者的依赖范围与旧包引用检查通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/runtime --filter @weapp-tailwindcss/merge --filter @weapp-tailwindcss/cn -r exec vitest run --update=none`：14 个文件、94 项通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/selectorParser.test.ts test/calc-escaped-identifiers.test.ts --update=none`：2 个文件、73 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/js.test.ts test/wxml/replaceWxml.test.ts test/wxml/templeteReplacer.test.ts test/wxml/customAttributes.test.ts test/ci/architecture-contract.test.ts test/ci/benchmark-report.test.ts test/ci/workflows.test.ts --update=none`：7 个文件、182 项通过，4 项既有跳过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/runtime-class-set-escaped-candidates.unit.test.ts test/bundlers/runtime-class-set-boundary.unit.test.ts test/bundlers/generator-css-class-selectors.unit.test.ts test/customReplaceDictionary.test.ts test/dic.test.ts --update=none`：5 个文件、15 项通过。
- `pnpm --filter benchmark-runtime-cn-vs-merge all`：parity、bundle、bench 与对应报告重新生成；cn/merge 及上游对照无意外差异，slim 保留预期的 `slim-excluded-fill` 差异，不据此宣称性能提升。
- 九个 `src/*.ts` 文件与上述来源 SHA 逐字节一致。
- `pnpm release status`：新包以 0.0.1 首次发布，相关生产消费者进入 patch 发布计划。
- `pnpm agents:check`、`node scripts/check-package-readmes.mjs`、受影响文件的 `pnpm exec eslint` 和 `git diff --check` 通过。

定向回归共 484 项通过、4 项既有跳过。独立模板的依赖与锁文件按发布后切换的边界保留，本次没有修改 demo 或 static 基线。
