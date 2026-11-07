# 2026-11-07 全仓依赖评估与升级报告

本轮从 `origin/main` 的准确基线 `a73127455` 开始，在独立 worktree `codex/dependency-upgrade-20261107` 完成依赖盘点和可安全落地的正式版升级。覆盖根 workspace、全部 tracked workspace、demo（含 Web、issue 复现和 style-injector）、7 个本地模板、e2e 历史 fixture、根与模板锁文件，以及两个 Rust `Cargo.lock`。Git 中共有 109 个 tracked manifest，其中 108 个非空，另 1 个为空解析 fixture；另有 9 份 pnpm 锁和 2 份 Cargo 锁。`submodules/tailwindcss-mangle`、生成目录和 `generic-vite` 忽略目录不在范围内。

逐项证据以[本轮清单与证据边界](dependency-upgrade-20261107.inventory.md)及其 TSV/JSON 为准：当前 2010 条直接声明中，135 条已升级、725 条已是最新、599 条保留、551 条阻塞，另记录 2 条已删除声明。以下分组概述说明已发生的工作，不能替代逐消费者结论，也不能据此宣称所有主版本、安全或多端验收已完成。

## 结果清单

### 已升级

- 根 package manager 与显式声明同步从 `pnpm@12.15.0` 升至 `pnpm@12.18.0`。
- Tailwind CSS 4 全套从 `4.3.4` 升至 `4.3.5`；同步刷新根、demo、Lynx 示例和 7 个模板的锁文件与模板 workspace 配置。
- Sass/`sass-embedded` 评估过 `1.108.0`，但 Windows `weapp-vite` 分包 smoke 在该版本进入 pure-JS fallback 并出现 `Dispatcher closed before compilation completed`，因此保留已验证的 `1.107.1`；退出条件是上游修复并通过 Windows Node 22/24 的独立分包编译。Playwright 升至 `1.65.0`，`tsdown` 升至 `0.23.7`，`tslib`、`undici`、Wrangler、repoctl、rimraf、semver、图标包、miniprogram API typings、es-toolkit、uview-plus、Storybook、SWC 等按正式版更新。
- 可验证的主版本工具升级：`boxen 9`、`del 9`、`chokidar 6`、`pixelmatch 8`、网站 `css-minimizer-webpack-plugin 8`、`dotenv 18`，并完成受影响调用方构建/测试验证。
- 移除废弃且未使用的 `@types/get-value` 以及未使用的根 `minimatch` 直接声明；benchmark 的两个 `cn` 声明统一到 `0.5.2`。
- Lynx 运行时/构建工具：`@lynx-js/react 0.129.2`、`@lynx-js/react-rsbuild-plugin 0.22.2`、`@lynx-js/types 4.4.2`、`@lynx-js/rspeedy 0.18.5`，Remotion 全套升至 `4.0.541`；公开中英文文档和静态证据同步重生成。
- 两个 Rust crate 的锁文件更新包含兼容的 patch、minor 与新增传递包：PostCSS native 为 33 → 33 包，主 native 为 106 → 107 包。`either`、ICU 与 `utf8_iter` 等含 minor 更新，新增 `utf_types@1.0.0`；准确逐包差异见锁附件。声明未改变公开 ABI 或 Rust 最低版本，实际 ABI 验证仍须独立记录。
- 7 个本地模板分别执行模板升级脚本并保留独立锁文件；旧的 Tailwind 4.3.4 与 `@weapp-tailwindcss/postcss@3.4.3` patch 在正式 `postcss@4.0.0` 已替代后删除，未手工编辑生成锁文件。

### 已是最新或按当前矩阵已对齐

- 原执行报告记录 Tailwind、Sass、Playwright、Lynx、Wrangler、repoctl、图标、类型包及 Rust 锁的冻结安装或身份核对；这不等于它们在本次 registry 查询时点全部为最新。尤其 Sass 当前保留 `1.107.1`，新正式目标 `1.108.1` 尚需 Windows 分包复验。
- Vue/React/TypeScript/Vite、Webpack/Rollup、Expo/RN、Babel、ESLint、Stylelint、Tailwind Variants 等逐消费者结果已补入清单。现存 pin/catalog 或通用更新成功不足以证明新代际不兼容；缺少本轮迁移证据的项目标为阻塞，未沿用分组概述作为全部完成结论。
- `templates.jsonc` 只列 5 个外部模板 URL；tracked 本地模板实际有 7 个，其中额外 2 个是仓库维护的本地变体，不是漏项。

### 保留

- Taro `4.3.1`：当前根和模板 patch 精确绑定该版本，直接改为 `4.3.2` 会丢失 Taro Webpack/Harmony 兼容补丁。退出条件是将补丁迁移到 4.3.2 并完成 Webpack、Harmony、HMR 及模板矩阵验证。
- Mpx `2.11.1` 的 Webpack 插件：`2.11.1` 有精确的兼容 patch；退出条件是把 patch 安全移植到 `2.11.2`，再通过 WXS、HMR 和模板生产构建。
- Taro 消费者的 ESLint `8.57.1`、`eslint-plugin-react-hooks@4.6.2`、`eslint-plugin-vue@8.7.1`：由 Taro 4.3.1 peer 约束决定。
- Taro RN transformer 使用 Stylelint 16，脚本断言 `16.10.0`；根 Stylelint 保持 catalog `17.16.0`。尝试 18 后现有配置规则被移除，已回退并记录退出条件。
- 有明确精确 patch、公开 peer 契约或历史兼容目标的消费者按各自理由保留；其余主版本缺少当前兼容证据时列为阻塞，待逐消费者整体迁移，不能机械执行 latest。
- Vue2/360、历史 Tailwind `3.2.2` fixture、Taro `4.2.1` fixture 保留专项兼容测试目的。

### 阻塞

- 最新本轮 extended 预检报告为 `e2e/.artifacts/preflight/b5256653-a668-4c2c-9702-cc1235f6a735/report.json`，绑定准确 head `113fc820e7b3d57d7d7d20352d65ac80fdedad33`。Node `v24.22.1` / pnpm `12.18.0` 已通过，Android 已明确绑定 `emulator-5554` 并通过；微信、HBuilderX、iOS、Harmony 与 runtime-ios 也通过。Web 探针在缺少 Firefox `1572` 时阻断，WebKit `2388` 另经只读核对也未安装；runtime-android 因默认 PATH 无 `gradle` 阻断，computer-use 为 `not-run`。本机已有 Gradle `8.9` 与完整 SDK，可通过任务级 `LYNX_GRADLE`、`ANDROID_HOME` 绑定后重新预检；本次未安装或运行 Gradle，也未启动全面验收。
- 旧 `c1ae5c8c-02df-4f62-b1d9-dc68ac77465d` 报告中的 Node 版本及 Android 目标歧义已在上述新报告恢复，不继续作为当前阻塞原因。新门禁仍未通过，禁止复用旧报告、跳过平台或据此声称全量多端 E2E、设备 static 与 computer-use 已验收。
- `pnpm test:core` 的 5 个 `test/ci/auto-prepare-plan.test.ts` 失败来自 fixture 内部 pnpm 子进程访问被环境禁用的网络（`Network access disabled ... registry.npmmirror.com`），与本轮依赖解析无关；该环境限制需在 CI 或允许网络的复验中解决。

## uni-app 工具链核对

现存归档只有 11 个 npm uni-app 目标的 `pnpm dlx @dcloudio/uvm@0.3.1 latest --manager manual` 输出，另 1 个 HBuilderX 模板是 IDE 目标，没有 DCloud npm 编译器声明及 UVM 日志，不能写成“12 次全部 exit 0”。日志自身也没有结构化退出码或准确 head/cwd/采样时间元数据。

UVM 对已覆盖包建议的 Vue3/uni-app 正式配套为 `3.0.0-5030420261029002`，Vue2/webpack 为 `2.0.2-5030420261028001`，但当前 125 条编译器声明仍未升级：95 条仍为 `3.0.0-5030320261023001`，30 条仍为 `2.0.2-5020620260917001`。其中 118 条建议未落实、7 条未被相应 UVM 输出覆盖，均逐项目标为阻塞。HBuilderX、内置编译器、运行基座与 npm 编译器属于独立工具链，不能由 npm 锁推断 IDE 链路已升级或通过。

## 安全与 peer 证据

历史摘要记录根审计为 372 条 advisory，但未找到对应基线 JSON，不能重建逐 advisory 的前后机器差异。现存本轮根 audit JSON 为 210 条（low 20、moderate 96、high 87、critical 7）。独立模板没有同轮旧 JSON，以下是现存快照，不能与根图相加：Mpx 137、Taro Vite 140、Taro Webpack 200、HBuilderX 0、uni-app 120、uni-app Webpack 163、weapp-vite 3。现存来源位于原本轮 worktree 的 `.tmp/dependency-upgrade-20261107/audit/` 与 `peers/`；路径、字节数、SHA-256 与完整残余归档见风险附件。原 JSON 没有 cwd、准确 head 或采样时间元数据，未补写这些身份。

根 peer JSON 的 97 个项目中，残余有 21 条 bad、21 条 missing、3 条 conflict；按“项目 + 包”去重为 15 个 bad 身份与 14 个 missing 身份，问题不限于 Tailwind 3/4。Taro/uni-app 模板另有框架 peer 残余；Mpx、HBuilderX、weapp-vite 的现存 peer 输出为空。全部项目、wanted/found、parents 与 optional 身份均归档，审计数量变化不代表传递漏洞或 peer 已全部修复。

## 验证记录

以下命令在本轮 worktree 已通过：根及 7 模板 `pnpm install --frozen-lockfile --ignore-scripts`；模板冻结安装；两个 Rust crate `cargo test --locked` 和 `cargo clippy --locked --all-targets --all-features -- -D warnings`；网站 typecheck/build、配置和 Lynx 文档契约；Lynx 示例 23 文件/247 测试及 package build；PostCSS 定向快照（71 tests）；`pnpm e2e:templates`、`pnpm e2e:canonical-templates`（4 tests）；根 `pnpm stylelint`、`pnpm typecheck`、`pnpm lint`（0 errors，7 个既有 console warnings）；`pnpm agents:check`；`git diff --check`。

以上为原执行报告记录；本次逐项补充只读核对准确 Git 对象和现存日志，没有重新执行安装、构建或全端验收。锁解析不冒充物理安装；缺少命令 provenance 的附件也不认证准确 head 的验收通过。

Tailwind 4.3.5 造成的 PostCSS snapshot 已按真实生成结果更新；Lynx static evidence 已重新生成并完成禁止更新复验。未执行版本发布或 npm publish。

## Release 与后续交付

复核发现，上轮“不新增 changeset”的判断遗漏了 catalog 对发布 manifest 的影响：`@weapp-tailwindcss/engine` 的生产依赖 `@tailwindcss/node`、`@tailwindcss/oxide`，以及 `tailwindcss-injector` 的生产依赖 `tailwindcss`，实际发布范围均从 `^4.3.4` 变为 `^4.3.5`。逐包解析升级前后的 catalog，并用真实 `pnpm pack` 核对后，确认只有这两个公开包需要直接 patch intent；已补中文记录 `.changeset/sharp-boxes-raise.md`。其他消费者由 repoctl 的依赖传播和 fixed group 生成版本计划，脚手架输出未改变，不新增 `create-weapp-vite` 联动。

Tailwind banner 的版本号不属于样式语义。后续 CSS 快照和能力 static 基线统一通过 PostCSS AST 仅移除 Tailwind banner 注释，保留其他注释、声明字符串、选择器和声明值；原始构建产物及运行时版本证据继续保留。小程序的 banner 产物约束直接检查原始 CSS，避免快照规范化掩盖产物回归。

原始 API 输出快照承担 banner 保留合同，因此单独在断言边界将真实注释中的版本号替换为 `<version>`，保留 banner 的存在、位置、许可证、URL 和全部样式。这覆盖 `style.test.ts` 与 `v4-package-css.test.ts` 中另外 5 处随安装版本变化的注释；不改生产 API、历史 fixture 或原始输出。通过对应 Vitest 入口更新后，以 `CI=1 --update=none` 复验辅助工具、API 输出与 banner finalization，共 90 项测试；新增回归确认其他注释、声明字符串和真实样式差异仍然可见。

本次修正通过 `pnpm e2e:tailwind:static:update` 重生成能力基线，并通过 apps-generator 原入口限定 5 个项目的 12 个 Web、web-compact、Android/iOS App 样式构建更新快照；同范围以 `CI=1 --update=none` 复验通过。快照工具与能力 static 回归共 56 项通过，apps-generator 的 12 项测试通过，包构建 36 个任务通过。逐文件核对 73 份 CSS 的差异均仅移除 banner，12 条聚合报告仅改变注释字节数和 banner 标记，49 个 static 文件哈希全部正确。ESLint、`pnpm agents:check`、`git diff --check` 与 `pnpm release status` 通过；这些定向验证不代替本地全端环境预检与设备运行证据。

提交前会再次执行 `pnpm release status`、`pnpm agents:check` 和 `git diff --check`，然后创建 PR。PR 的 CI 失败将逐项在同一 worktree 修复并推送，全部通过后合并；合并后使用准确 merge SHA 跟进仓库规定的 Version PR/Version Package CI。该阶段不执行 npm publish。
