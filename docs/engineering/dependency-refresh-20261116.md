# 2026-11-16 全仓依赖评估与升级

本轮从基线 `e145bd867cd63e4b072921495a11e065eb7acb9a` 开始，在独立 worktree `codex/dependency-upgrade-20261116` 执行。评估范围包括根项目、tracked workspace、demo（含 Web、issue 复现与 style-injector）、examples/apps、website、7 个独立模板、根及模板 pnpm 锁文件。tracked npm manifest 共 109 份；Rust `Cargo.lock` 未改动，Rust 依赖不计为已升级或已验证。未纳入 `node_modules`、构建输出及 `submodules/tailwindcss-mangle`。

本报告按依赖消费者和兼容边界归纳结果。版本为声明目标；实际解析以本轮冻结锁文件为准。未列为升级的依赖不因此等同于安全无漏洞，也不代表所有平台均已验收。

## 结果

### 已升级

| 项目或消费者 | 依赖 | 本轮变化 |
| --- | --- | --- |
| 根工具链及独立模板 | pnpm | `12.18.0` → `12.21.0`；同步 7 个模板的 `packageManager` 字段及各自锁文件 |
| 根、workspace 与消费者 catalog | PostCSS | `8.5.32` → `8.5.33`；`packages/postcss-calc` 与两个 PostCSS catalog 跟进 |
| 根 Oxc catalog 与类型 | `oxc-parser`、`@oxc-project/types` | `0.157.0` → `0.158.0` |
| 根 Vite 工具链 | Vite 7 | 升至 `7.3.7`；保留旧代 Vite 消费者的独立版本线 |
| 根 lint 工具链 | ESLint 10、Stylelint | ESLint `10.14.0` → `10.15.0`；Stylelint `17.16.0` → `18.0.0`；同步根配置包到 `@icebreakers/stylelint-config@6.0.4` |
| 根 Storybook catalog | Storybook 全套 | `10.6.6` → `10.6.7` |
| 根与 website 浏览器测试 | Playwright | `1.65.0` → `1.65.1` |
| 根及 Cloudflare 工具消费者 | Wrangler | `4.158.0` → `4.162.0` |
| 根工程工具 | repoctl、Turbo、tar、miniprogram automator | repoctl `6.4.0` → `6.6.2`；Turbo `2.11.10` → `2.11.11`；tar `7.5.22` → `7.5.23`；automator `1.5.1` → `1.5.4` |
| Lynx package、examples、apps 与公开文档 | Rspeedy、ReactLynx、ReactLynx 插件 | `0.18.5` → `0.18.6`、`0.129.2` → `0.129.3`、`0.22.2` → `0.22.3`；同步中英文版本说明 |
| Remotion 两个 promo app | Remotion 全套 | `4.0.541` → `4.0.543`，保持同一套件版本 |
| 共享 workspace catalog | 浏览器映射、Iconify、Inquirer、Prettier、Rsbuild、Wrangler 等 | `baseline-browser-mapping@2.11.37`、Iconify logos `1.2.20` / lucide `1.2.155`、Inquirer `8.8.0`、Prettier 声明 `3.10.1`、Rsbuild `2.3.2` 等正式版更新；清单以 `pnpm-workspace.yaml` 与锁文件为准 |
| weapp-vite 消费者 | weapp-vite、weapp-ide-cli | `weapp-vite` catalog `7.8.0` → `7.11.0`，模板固定 `7.8.0` → `7.11.0`；`weapp-ide-cli` catalog `6.4.1` → `6.4.4`，并同步 `@devframes/agentic` 扩展解析 |
| 7 个独立 Tailwind v4 模板 | `weapp-tailwindcss` | `^5.7.3` → `^5.7.4`；同步模板锁、workspace minimum-release-age 例外及 PostCSS patch 版本 |
| Mpx / Gulp demo 及模板 | Babel、ESLint、PostCSS 插件 | Babel runtime/preset 更新到 `7.29.14`；Mpx demo 将 ESLint 从共享 ESLint 10 catalog 调整为 `9.39.5`；`postcss-pxtransform` `4.3.2` → `4.3.3` |
| `tailwindcss-config` | lilconfig | `3.1.4` → `3.1.5` |
| 工具与配置依赖 | commitlint、eslint config、tsconfig、CI metadata | 分别更新到 `@icebreakers/commitlint-config@4.1.6`、`@icebreakers/eslint-config@8.0.19`、`@tsconfig/recommended@1.0.14`、`ci-info@4.5.0` |

普通依赖通过仓库 `pnpm` 工作流与共享 catalog 更新；模板锁由 pnpm 在模板工作区生成，并逐个刷新。没有手工改写生成锁文件。模板范围覆盖 Mpx、Taro Vite/Webpack、HBuilderX uni-app、uni-app、uni-app Webpack 与 weapp-vite 七个目录。

本轮将可共享的升级声明迁入 catalog：根 workspace 使用 `tooling`、`compilerUtilities`、`browserTesting`、`remotionPromo`、`lynxFixture`、`weappAutomation` 等分组；website 的 `postcss@8.5.32` 使用独立 `docusaurusPostcss` catalog；7 个独立模板分别加入 `tailwindcss4`、`weappTailwindcss` 及其 Babel/runtime、weapp-vite 专用 catalog。`packageManager`、patch、overrides 和 `minimumReleaseAgeExclude` 仍是工具元数据或兼容边界，保持原字段，不强行转换成依赖 catalog。

### 已是最新或无须改动

- 本轮核对的声明和锁身份中，未变更项维持原版本范围；只有确认已在目标正式版范围内、属于当前兼容矩阵，或不是本轮候选时，才保留原声明。仓库 Tailwind CSS 4 使用 `4.3.5`，本轮未改变其版本线。
- 本类别不表示逐个包完成安全审计，也不将 registry 中存在更高版本等同于应当升级。框架、peer、历史样例及工具链的保留和阻塞边界见下表。

### 保留

| 依赖或消费者 | 保留依据 | 复查/退出条件 |
| --- | --- | --- |
| website `postcss` | 固定 `8.5.32`。将 Docusaurus 消费者一并升到 `8.5.33` 会在 peer 图中形成重复的 `theme-common` 实例，DocSearch provider 上下文不一致；其他 workspace 仍使用 `8.5.33`。 | Docusaurus 依赖图不再重复实例后再统一版本，并复验中英文网站构建与 DocSearch provider。 |
| Sass / sass-embedded | 保留已验证的 `1.107.1`，不采用未经 Windows 分包复验的更新版本。 | 在 Windows Node 22/24 上完成 weapp-vite 分包编译并确认不进入失败的 pure-JS fallback。 |
| Taro 框架及相关 ESLint / React Refresh | Taro 4.3.1 patch、旧 peer 范围与 Webpack/Harmony 调整绑定当前版本；React Refresh `0.18` 与旧 Taro peer 有边界。 | 迁移 patch 后在 Taro Vite/Webpack、Harmony、HMR 和模板生产构建中验证，再调整配套版本。 |
| Mpx 工具链 | ESLint 采用消费者兼容的 `9.39.5`；Webpack 插件的精确兼容 patch 限制框架升级。 | 将 patch 移植到上游兼容版本，复验 WXS、HMR 与生产构建。 |
| 多代 Vite 声明 | uni-app、Taro、历史 demo 和当前 weapp-vite 使用不同主版本；按各自 plugin/peer 合约保留多个 catalog，不统一机械升到最新主版。 | 每条工具链分别完成构建与运行回归后再合并版本线。 |
| 历史兼容 fixture | Vue2/360、Tailwind v3、旧 Taro 与 React Refresh 样例保留其回归目的；`weapp-tailwindcss-children` 仍声明 Tailwind v3 peer。 | 仅在删除或替换对应旧版本回归目标，并保留等价覆盖后升级。 |
| Rust Cargo 锁 | 两份 `Cargo.lock` 本轮未变更。 | 需要单独评估 Rust crate 更新，并在对应原生目标运行 locked test、clippy 与 ABI 验证；本轮不宣称 Rust 依赖已是最新。 |

### 阻塞或待验收

- Peer 检查仍报告既有兼容边界：Taro/Vite 4 与当前包 peer 范围、Mpx ESLint 代际、React Refresh `0.18` 与旧 Taro peer、uni-app-x 的 `@nuxt/kit` / Vue server renderer 组合、`weapp-tailwindcss-children` 的 Tailwind v3 peer，以及 `packages-runtime/ui` 的 `@tarojs/helper` 缺项。它们需要按真实消费者确定由哪个项目声明/升级，不能用全局 override 隐藏。
- uni-app npm 编译器的当轮 UVM 逐项目清单、HBuilderX 内置编译器、IDE 与运行基座未在本轮升级验证；这些不能由 npm 锁文件推定已通过。退出条件是按仓库流程逐项目运行官方 UVM manual 查询，核对 IDE/内置编译器版本，并完成对应构建入口验证。
- 本轮没有执行微信 IDE、HBuilderX、iOS/Android/Harmony 模拟器和当前会话 computer-use 的全端环境预检与完整多端验收。用户授权范围仅要求包级与可用 demo 验收，因此以下本地结果不代表全端通过。
- 安全 advisory 数、Rust 安全状态和发布产物没有在本报告中声称已清零或已发布；依赖版本更新不自动消除传递风险。

## 验证

| 命令或检查 | 结果 |
| --- | --- |
| `pnpm build:pkgs` | 36 个实际构建任务通过；`build-all` 元任务无输出提示已记录，未计作失败 |
| 定向 Vitest | 230 个测试文件通过，2793 个用例通过，6 个既有 skip |
| `pnpm --filter @weapp-tailwindcss/website typecheck` | 通过 |
| `pnpm --filter @weapp-tailwindcss/website build` | 中英文 Docusaurus SSG 通过；包含 Lynx catalog 解析和 peer 契约检查 |
| `pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/check-lynx-contract.test.mjs` | 19/19 通过，覆盖 catalog 解析和 peer 不匹配 |
| `pnpm e2e:canonical-templates` | 4/4 通过；同时验证三个 canonical 模板独立安装与构建 |
| `pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/template-dependency-contract.test.ts e2e/template-contract.test.ts` | 28/28 通过，覆盖独立模板 catalog、稳定版与锁文件身份 |
| `pnpm release status` | 通过，中文 changeset 已识别；不代表执行发布 |
| `pnpm agents:check` | 通过，0 errors |
| `git diff --check` | 通过 |
| 完整 IDE / 设备矩阵、UVM 全消费者核对、Rust test/clippy/ABI | 未执行 |

本轮没有改动 demo 源码或样式输出用例，因此没有重新生成 demo static 产物基线。没有运行 Prettier、创建 PR 或发布；依赖变更已按请求提交并推送到 `codex/dependency-upgrade-20261116`。

## Release 与规则检查

已新增中文 changeset `.changeset/dependency-update-1cc37594-b21a-468a-b2c1-74ccee8f3d2e.md`。`pnpm release status` 识别了变更包范围；未改动 `create-weapp-vite` 的脚手架生成行为，因此本轮不增加脚手架联动。规则文件未修改；按仓库要求执行 `pnpm agents:check` 和 `git diff --check`。
