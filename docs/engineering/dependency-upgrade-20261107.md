# 2026-11-07 全仓依赖评估与升级报告

本轮从 `origin/main` 的准确基线 `a73127455` 开始，在独立 worktree `codex/dependency-upgrade-20261107` 完成依赖盘点和可安全落地的正式版升级。覆盖根 workspace、全部 tracked workspace、demo（含 Web、issue 复现和 style-injector）、7 个本地模板、e2e 历史 fixture、根与模板锁文件，以及两个 Rust `Cargo.lock`。本轮共核对 108 个 manifest、9 份 pnpm 锁和 2 份 Cargo 锁；`submodules/tailwindcss-mangle`、生成目录和 `generic-vite` 忽略目录不在范围内。

## 结果清单

### 已升级

- 根 package manager 与显式声明同步从 `pnpm@12.15.0` 升至 `pnpm@12.18.0`。
- Tailwind CSS 4 全套从 `4.3.4` 升至 `4.3.5`；同步刷新根、demo、Lynx 示例和 7 个模板的锁文件与模板 workspace 配置。
- Sass/`sass-embedded` 升至 `1.108.0`，Playwright 升至 `1.65.0`，`tsdown` 升至 `0.23.7`，`tslib`、`undici`、Wrangler、repoctl、rimraf、semver、图标包、miniprogram API typings、es-toolkit、uview-plus、Storybook、SWC 等按正式版更新。
- 可验证的主版本工具升级：`boxen 9`、`del 9`、`chokidar 6`、`pixelmatch 8`、网站 `css-minimizer-webpack-plugin 8`、`dotenv 18`，并完成受影响调用方构建/测试验证。
- 移除废弃且未使用的 `@types/get-value` 以及未使用的根 `minimatch` 直接声明；benchmark 的两个 `cn` 声明统一到 `0.5.2`。
- Lynx 运行时/构建工具：`@lynx-js/react 0.129.2`、`@lynx-js/react-rsbuild-plugin 0.22.2`、`@lynx-js/types 4.4.2`、`@lynx-js/rspeedy 0.18.5`，Remotion 全套升至 `4.0.541`；公开中英文文档和静态证据同步重生成。
- 两个 Rust crate 的锁文件仅更新兼容的补丁版本，未改变公开 ABI 或 Rust 最低版本声明。
- 7 个本地模板分别执行模板升级脚本并保留独立锁文件；旧的 Tailwind 4.3.4 与 `@weapp-tailwindcss/postcss@3.4.3` patch 在正式 `postcss@4.0.0` 已替代后删除，未手工编辑生成锁文件。

### 已是最新或按当前矩阵已对齐

- 当前正式版 Tailwind、Sass、Playwright、Lynx、Wrangler、repoctl、图标、类型包和 Rust 锁身份已通过冻结安装及锁身份核对。
- Vue/React/TypeScript/Vite、Webpack/Rollup、Expo/RN、Babel、ESLint、Stylelint、Tailwind Variants 等框架族按仓库兼容矩阵核对；能够独立升级的 patch/minor 已升级，其余保持矩阵版本。
- `templates.jsonc` 只列 5 个外部模板 URL；tracked 本地模板实际有 7 个，其中额外 2 个是仓库维护的本地变体，不是漏项。

### 保留

- Taro `4.3.1`：当前根和模板 patch 精确绑定该版本，直接改为 `4.3.2` 会丢失 Taro Webpack/Harmony 兼容补丁。退出条件是将补丁迁移到 4.3.2 并完成 Webpack、Harmony、HMR 及模板矩阵验证。
- Mpx `2.11.1` 的 Webpack 插件：`2.11.1` 有精确的兼容 patch；退出条件是把 patch 安全移植到 `2.11.2`，再通过 WXS、HMR 和模板生产构建。
- Taro 消费者的 ESLint `8.57.1`、`eslint-plugin-react-hooks@4.6.2`、`eslint-plugin-vue@8.7.1`：由 Taro 4.3.1 peer 约束决定。
- Taro RN transformer 使用 Stylelint 16，脚本断言 `16.10.0`；根 Stylelint 保持 catalog `17.16.0`。尝试 18 后现有配置规则被移除，已回退并记录退出条件。
- Vue/React/TypeScript/Vite、Webpack/Rollup、Expo/RN、Babel、ESLint/Stylelint、Tailwind Variants 等主版本按现有消费者矩阵保留，待整体迁移而非机械执行 latest。
- Vue2/360、历史 Tailwind `3.2.2` fixture、Taro `4.2.1` fixture 保留专项兼容测试目的。

### 阻塞

- `pnpm e2e:preflight prepare` 的新报告位于 `e2e/.artifacts/preflight/c1ae5c8c-02df-4f62-b1d9-dc68ac77465d/`。微信、HBuilderX、iOS、Harmony、Web 通过；Node `v24.18.0` 不满足仓库声明 `^22.23.4 || ^24.22.1 || >=26.12.1`，Android 同时发现 `L204203G00581` 与 `emulator-5554` 两个目标，无法选择唯一设备。按仓库门禁，未启动全量多端 E2E、设备 static 基线或以旧报告放行。
- `pnpm test:core` 的 5 个 `test/ci/auto-prepare-plan.test.ts` 失败来自 fixture 内部 pnpm 子进程访问被环境禁用的网络（`Network access disabled ... registry.npmmirror.com`），与本轮依赖解析无关；该环境限制需在 CI 或允许网络的复验中解决。

## uni-app 工具链核对

在 12 个 uni-app 目标目录分别执行 `pnpm dlx @dcloudio/uvm@0.3.1 latest --manager manual`，全部 exit 0，manual 模式未改写项目依赖。Vue3/uni-app 正式配套为 `3.0.0-5030420261029002`，Vue2/webpack 目标为 `2.0.2-5030420261028001`。HBuilderX、内置编译器、运行基座和 npm 编译器属于独立工具链，不能由 npm 锁文件推断已升级。

## 安全与 peer 证据

原始根审计为 372 条 advisory；本轮根锁重新审计为 210 条（low 20、moderate 96、high 87、critical 7）。独立模板没有同轮旧 JSON，以下是当前快照，不能与根图相加：Mpx 137、Taro Vite 140、Taro Webpack 200、HBuilderX 0、uni-app 120、uni-app Webpack 163、weapp-vite 3。完整 JSON、stderr 和命令输入保存在 `.tmp/dependency-upgrade-20261107/audit/` 与 `.tmp/dependency-upgrade-20261107/peers/`。

根仍有既有 Tailwind 3/4 peer 矛盾；Taro/uni-app 模板保留框架自身 peer 约束。Mpx、HBuilderX、weapp-vite peer 检查 clean。审计数量下降不代表所有传递依赖漏洞已修复，后续 CI 仍需按项目矩阵处理。

## 验证记录

以下命令在本轮 worktree 已通过：根及 7 模板 `pnpm install --frozen-lockfile --ignore-scripts`；模板冻结安装；两个 Rust crate `cargo test --locked` 和 `cargo clippy --locked --all-targets --all-features -- -D warnings`；网站 typecheck/build、配置和 Lynx 文档契约；Lynx 示例 23 文件/247 测试及 package build；PostCSS 定向快照（71 tests）；`pnpm e2e:templates`、`pnpm e2e:canonical-templates`（4 tests）；根 `pnpm stylelint`、`pnpm typecheck`、`pnpm lint`（0 errors，7 个既有 console warnings）；`pnpm agents:check`；`git diff --check`。

Tailwind 4.3.5 造成的 PostCSS snapshot 已按真实生成结果更新；Lynx static evidence 已重新生成并完成禁止更新复验。未执行版本发布或 npm publish。

## Release 与后续交付

`pnpm release status` exit 0，仓库已有 `.changeset/dynamic-alpha-rgba.md` 和 `.changeset/tame-monkeys-travel.md` 两份待处理 intent。本轮只有依赖、锁、模板和公开事实文档变化，没有新增公共包运行时行为，因此不新增 changeset，也不新增 `create-weapp-vite` 联动。

提交前会再次执行 `pnpm release status`、`pnpm agents:check` 和 `git diff --check`，然后创建 PR。PR 的 CI 失败将逐项在同一 worktree 修复并推送，全部通过后合并；合并后使用准确 merge SHA 跟进仓库规定的 Version PR/Version Package CI。该阶段不执行 npm publish。
