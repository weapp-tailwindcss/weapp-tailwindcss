---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1194
baseline: 190cda97f100120833a383496db41bbc9980f031
regressions:
  - packages/postcss/test/calc.test.ts
  - packages/postcss-calc/test/index.test.ts
  - packages/postcss/test/pluginHelpers.test.ts
  - packages/postcss/test/calc-context.test.ts
  - packages/postcss/test/applyConfiguredCssCalc.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-style-context.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-engine-css-calc.test.ts
  - packages/weapp-tailwindcss/test/bundlers/shared/generator-css/user-css.test.ts
  - scripts/ci/demo-matrix/version-contract.test.mjs
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-calc.test.ts
  - e2e/issue-1194-css-calc.test.ts
  - packages/weapp-tailwindcss/test/source-line-limit.test.ts
---

# Issue #1194：跨 CSS 资产预计算自定义属性

## 症状

Tailwind CSS v4 会把主题变量和 utility CSS 分阶段生成。`cssCalc: ['--spacing']` 在单个 PostCSS 输入中可以生效，但在 Vite/uni-app 构建中，处理 utility CSS 时可能看不到变量声明，最终产物仍保留 `calc(var(--spacing) * 2)`。

`5.5.5` 修好了 weapp 生成路径的变量映射透传，但 issue 原文的 uni-app Vite H5 仍失败：`generator.target: 'web'` 不跑 style handler，收集到的 `customPropertyValues` 被丢掉。

## 根因与纠正

PostCSS 的 `postcss-preset-env` 只能解析当前 AST 中可见的自定义属性。Tailwind v4 生成器已经收集了 CSS 自定义属性值，但非增量生成路径没有把这份映射传给 calc 处理器；同时 calc 变量替换使用正则，无法安全处理 fallback、嵌套函数和变量链。

web/H5 不能复用完整 `createStyleHandler()`，否则会把 `:root` 换成 `page` 并清理 hover/focus。web 路径改为调用 `applyConfiguredCssCalc()`，只预计算配置过的 `calc()` / `var()`，再交给现有 webCompat。

2026-09-17 在 `190cda97` 上复查发现，已有修复覆盖了生成器输出，但独立导入的普通 CSS 仍走 Web 保留分支，未进入 calc 计算。真实 `uni build` 中 `.gap-2` 已得到 `0.5rem`，而 `.raw-btn` 和 `.raw-btn:hover` 仍保留 `calc(var(--spacing) * 2)`。

补充修复在 Vite CSS finalizer 完成资产组装后调用已有 PostCSS calc API，覆盖通用 Web 与框架 finalizer，包括已处理资产分支。变量来自当前 CSS 资产；只有生成记录唯一时才用于跨资产补充，当前资产的声明优先。多个不同生成上下文不会按遍历顺序合并。不读取源码文件，不直接写构建目录，也不引入小程序选择器或单位转换。

## 修复约束

- `cssCalc` 数组或正则是允许静态化的变量集合，不得硬编码 `--spacing`。
- 变量映射必须来自 Tailwind 生成结果或构建图数据，不能通过固定目录、文件名或后置读取源码获得。
- 使用 value AST 解析 `var()`，递归解析变量链；fallback 可作为解析失败时的候选值。
- 检测循环引用，无法安全静态化时保留原始运行时表达式。
- 对象形式的 `cssCalc.includeCustomProperties` 必须与数组形式保持同等透传，不能在附带变量映射时被丢弃。
- 保留变量声明和 CSS 级联顺序，未匹配变量不得被静态化。

## 验证

1. 先用真实 `cssEntries` 运行 uni-app + Vite + Tailwind v4 **H5** 构建，检查最终 CSS 资产，而不是只调用单个 PostCSS handler 或只测 weapp 目标。
2. 用最小 CSS 单测覆盖 `var(--foo)`、`var(--foo, fallback)`、变量链、循环引用和正则匹配。
3. 同时验证 weapp/web、增量和非增量 Tailwind v4 生成路径，确认自定义属性映射一致。
4. 运行 `pnpm --filter @weapp-tailwindcss/postcss-calc test`、`pnpm --filter @weapp-tailwindcss/postcss test`、`v4-engine-css-calc` 及相关 bundler 用例。
5. 修改公开包时，change intent 必须覆盖每个实际变更的包，并用中文描述用户可见行为。
6. 不要把完整小程序 style handler 接到 web 目标；H5 验收时临时打开 `cssCalc`，不要改 demo 默认配置以免抖动 e2e 基线。

### 2026-09-17 本地复查证据

- 环境：Node `24.18.0`、pnpm `12.4.1`、Tailwind CSS `4.3.3`、Vite `5.2.8`、uni-app `3.0.0-5010520260709002`。uni-app 版本较 Issue 原环境新，因此不是旧版 uni-app 的完整环境复刻。
- 新增 E2E 在临时目录创建真实 uni-app 工程，复用 demo 的冻结依赖，配置 `cssEntries`、`rem2rpx: true`、`cssCalc: ['--spacing']`，执行 `pnpm exec uni build` 并读取最终 CSS。uni-app 的解析钩子会将 `@vue/shared` 指向旧版本；测试在父进程解析 demo 的 Vue 依赖后显式对齐，避免运行时版本混用，不替换样式生成插件。
- 将同一工程的插件入口临时切换为独立安装的 `weapp-tailwindcss@5.5.4` 后，构建成功、间距静态化断言失败。当前基线源码也在普通 `.raw-btn` 的断言失败。补充修复后，工具类与手写 CSS 均为 `0.5rem`，保留 `:root`、`:hover` 和未选中的 `--other`。
- 构建：`pnpm --filter weapp-tailwindcss... run build`；修改后再执行 `pnpm --filter weapp-tailwindcss run build`，均通过。
- 回归：`CI=1 pnpm exec vitest run --project=weapp-tailwindcss --project=@weapp-tailwindcss/postcss --project=@weapp-tailwindcss/postcss-calc v4-engine-css-calc v4-style-context calc-context applyConfiguredCssCalc user-css.test.ts vite-web-css-calc vite-css-finalizer architecture-contract --update=none`，8 文件、70 项通过。
- static 基线：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1194-css-calc.test.ts -u`，仅生成 `e2e/__snapshots__/issue-1194/h5-css.json`；随后用相同命令的 `--update=none` 替换 `-u`，复验通过。默认 demo 配置和既有基线没有变动。
- 类型：`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false` 通过。
- 质量检查：修改的 TypeScript 文件经 `pnpm exec eslint --no-ignore` 定向检查通过；`git diff --check` 和 `pnpm agents:check` 通过（47 份规则、29 份文档，0 错误）。
- 发布计划：`pnpm release status` 确认已有 `.changeset/web-css-calc.md`，主包计划从 `5.5.5` 升至 `5.5.6`。本次仅扩充该中文 intent，没有发布 npm。

## CI 版本契约与性能复查

- PR #1211 将 `e2e/issue-1194-css-calc.test.ts` 纳入 PR Gate 的 core smoke；全量 static 工作流在 PR 上默认跳过，不能依赖它验收新增用例。
- 首次远端全量单测发现 `css-finalizer/plugin.ts` 增至 504 行。通过抽出重复的最终资产收尾逻辑到 `css-finalizer/final-assets.ts` 修复，保留原有小程序处理和 Web calc 的目标分支，不通过压缩排版规避限制。本地 `CI=1 pnpm exec vitest run --project=weapp-tailwindcss source-line-limit vite-css-finalizer vite-web-css-calc final-css-assets --update=none` 共 36 项通过，重建后的 H5 static 回归和类型检查也通过。
- 首次 Taro Vite 小程序 Benchmark 报告插件构建中位数 `6094ms → 6610ms`（`+8.47%`），运行链接为 [Benchmark attempt 1](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35204715795/attempts/1)。这条小程序路径不执行 Web calc，保留原始样本后只复测失败分片，不降低 5% 阈值。
- 相同提交 `1d43e986c64184b9a0caf79d431954fe27c12dec`、相同配置的 [Benchmark attempt 2](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35204715795/attempts/2) 通过，性能汇总门禁也通过。本次有限复测未重复观察到该回退，保留首轮失败作为边界记录，不以改阈值或连续重试替代定位。
- 含收尾重构的本地工作树执行 `CI=1 pnpm perf:guard -- --baseline-ref 190cda97f100120833a383496db41bbc9980f031 --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30 --only demo-taro-vite-react-tailwindcss-v4__mp-weixin --result-dir e2e/.artifacts/issue-1194/local-benchmark`，插件构建中位数 `2912ms → 2713ms`，门禁通过、违规项 0。本机 macOS/Node 24 的结果不替代远端 Ubuntu/Node 22 验收。

- 根 `package.json#packageManager` 是 CI 的 pnpm 版本来源，模板同步与报告 gate 复用 `scripts/ci/version-contract.mjs`。完整性后缀不参与 CLI 版本比较。
- 依赖断言使用 fixture manifest 的 semver 范围；精确版本自然要求完全一致。候选包版本使用当前 workspace manifest，发布版由冻结 lockfile 保持复现条件。
- 切换发布版与候选包后，不能用同一个 Node 进程的 `require()` 缓存报告已安装版本。本地曾读到旧版 `5.5.1`，实际候选 tarball 为 `5.5.4`；现在直接读取安装目录元数据，并用切换符号链接的测试覆盖。
- 数组与正则入口曾只透传匹配规则而遗漏变量值；`calc-context.test.ts` 修复前 2 项失败，修复后两种配置入口都得到 `6rpx`，未匹配变量保留。
- 完整生成不需要 calc 变量时不得为此额外创建 PostCSS AST；增量路径已有颜色兼容变量消费者，不能直接删除其上下文。
- `pnpm test:demo:matrix` 覆盖版本解析、临时升级 manifest、报告版本一致性与安装切换；定向 ESLint、`pnpm agents:check` 以及 PostCSS 两个包测试均需要在推送前运行。
- 远端 Benchmark 曾报告 Taro Webpack RSS 增加约 8%–10%；按配置跳过额外解析后，仍须在新提交上运行真实 Benchmark 确认，不能降低阈值替代修复。

## 适用边界

本流程适用于 Tailwind v4 主题变量、跨 CSS 资产生成和 `cssCalc` 配置，覆盖 weapp 与 web/H5 生成目标；无法确认变量作用域时不做静态替换。未配置 `cssCalc` 时 webCompat 仍保留运行时间距变量。

初次本地验收针对 H5 生产构建，没有执行浏览器交互、设备验证或开发服务器 HMR；后续远端验证见 [PR #1211](https://github.com/sonofmagic/weapp-tailwindcss/pull/1211) 的最新提交检查，旧提交的通过不能替代最终提交。多个主题入口的跨资产歧义保持原表达式，后续若扩展必须依赖资产归属关系。

## 规则评估

本次复盘确认变量映射必须来自构建图，变量匹配必须由用户配置控制，且单资产测试不能替代真实 bundler 构建验证。

本次不新增 AGENTS 规则：现有构建图边界和 static 基线要求足够，通过持久构建回归补齐证据。
