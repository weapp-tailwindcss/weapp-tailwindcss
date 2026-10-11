---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1144
baseline: "034e4ea12d950d974ed6904e818a5fa762a2e941"
regressions:
  - packages/postcss/test/uni-app-x.test.ts
  - e2e/issue-1144-runner.test.ts
  - e2e/issue-1144-static.test.ts
  - e2e/issue-1144-web.test.ts
  - e2e/hbuilderx-local.test.ts
---

# Issue #1144：SCSS important 与可靠 HMR 验收

2026-09-08 补充：[5.25 alpha 与 Harmony 更新证据](uni-app-x-alpha-hmr.md) 已验证原始 setup，并用无插件原生对照区分符号链接失败、增量重启和纯 HMR。以下保留本次历史修复证据；未验证边界以后续记录为准。

## 症状

[用户最新评论](https://github.com/sonofmagic/weapp-tailwindcss/issues/1144#issuecomment-5551182026)（2026-09-05 更新）包含两类 Web 症状：多次切换 `:pt="{ root: 'p-0!' }"` / `p-10!` 后不再更新，刷新也无效；新增 `mt-24!` 后报错。截图中使用 HBuilderX 5.25 alpha，错误是 `[plugin:vite:css] [sass] expected ";"`，位置为生成的 `@apply mt-24!`。

本次从上述 origin/main SHA 创建仓库外 worktree `../weapp-tailwindcss-codex/issue-1144-root-fix`，分支 `codex/issue-1144-root-fix`，保留原 checkout、旧验证 worktree 与用户已有 IDE/浏览器服务。复现 demo 保留原主题与配置，增加真正把 `pt.root` 绑定到 class 的小组件，使用 `padding: 31px` 作为必须被 important utility 覆盖的竞争样式。

## 根因与纠正

首次确认偏离发生在 **SCSS 送入 Sass 之前的 important 预处理**，不是浏览器，也没有证据要求修改 HMR 版本过滤或全局缓存。

`normalizeUniAppXImportantApplyForSass` 调用 `postcss.parse(css, { syntax: scssSyntax })`，但 `postcss.parse` 不消费这个 `syntax` 选项。规则内部的 SCSS `//` 注释会使 CSS parser 抛错；既有 catch 返回原始输入，导致生成的 `@apply mt-24!` 未转换成中间标记就进入 Sass。Sass 拒绝该语法，style request 返回 500，增量样式链路中断。

修复直接调用 `scssSyntax.parse`，并用 `scssSyntax.stringify` 保留 SCSS 语法。公开 API、Tailwind 单一生成器、模块图与缓存边界均不变；没有新增吞错、重启、清空全局缓存或官方 Tailwind 插件兜底。既有非法输入处理策略未扩大。

回归先确认失败再修改：含行内注释、Sass 变量、嵌套选择器、前置与后置 important 的输入，修复前不能产生中间标记；修复后进入真实 `sass.compileString` 并成功还原 important，重复预处理保持幂等。真实 HBuilderX 修复前首轮保存同样出现截图中的 Sass 错误。

以下旧结论由本记录明确纠正，不再作为产品回归证据：

- `--spacing: 1px` 下 `mt-24!` 应为 **24px**，不是默认 spacing 推出的 96px；旧的 96px 断言无效。
- 普通 `view` 的无效 `pt` 属性不能证明组件消费链已通过；现在检查组件展示的属性值确实存在于自身 classList，并验证实际 padding。
- `localhost:5173` 曾命中用户已有的 IPv6 服务。现在 demo 绑定 IPv4，检查 identity endpoint 返回的真实项目根目录；仅凭相同页面标题或 URL 不够。
- 滚动日志只保留 160 个片段会丢失启动版本和早期错误。现在另存完整服务日志（上限 32 MiB，超过即验收失败），不将日志截断误判为产品错误。
- Vitest 5 的 `--update=false` 会触发更新，不是禁用。误生成的无关快照已撤回；使用 `--update=none`。非 CI 的既有 JS 快照名称 `common` / `'common'` 不一致单独记录，不修改它来掩盖失败。

## 验证

日期：2026-09-06，macOS。冻结安装 `pnpm install --frozen-lockfile` 成功，锁文件未改。实际 Node 24.18.0、pnpm 11.25.0、weapp-tailwindcss 5.5.1（本地新构建）、postcss 包 3.3.2、Tailwind 4.3.3。

| 链路 | 实际编译器与解析位置 | 结果 |
| --- | --- | --- |
| CLI Web | uni 编译器 5.22；`@dcloudio/vite-plugin-uni` 3.0.0-alpha-5020220260725001；demo 解析 Vite 5.4.21 | 16 轮与刷新通过 |
| HBuilderX Web | stable 5.24.2026081301；IDE 自带 `plugins/uniapp-cli-vite/node_modules/vite` 5.2.8 | 修复前 Sass 失败；修复后 16 轮与刷新通过 |
| 插件产物 | worktree 内 `packages/weapp-tailwindcss/dist/vite.cjs`，依赖本地 `packages/postcss` 构建 | 未消费旧 worktree 或 registry 的插件产物 |

每条 Web 链路均在同一服务进程完成 12 次 `p-0! → p-10! → p-4! → p-0!` 切换；每次有独立 marker 和此前不存在的宽度类。交错新增、修改、删除 `mt-24!` 探针，检查 24px / 12px。随后 4 次在组件 scoped、非 scoped、无 style、恢复 style 之间切换，并保存页面 marker。第 12 与第 16 步后刷新浏览器，不重启服务。每轮等待 DOM、属性消费、生成 CSS 和计算样式一致，并拒绝 `Unknown word`、Sass 和 `reading 'scoped'` 错误。

实际验证入口（从根目录运行）：

```sh
pnpm build
pnpm --filter @weapp-tailwindcss/postcss build
pnpm --filter weapp-tailwindcss build
pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none
pnpm exec cross-env CI=1 pnpm --filter weapp-tailwindcss exec vitest run --update=none
pnpm exec cross-env CI=1 E2E_ISSUE_1144_WEB=1 E2E_HBUILDERX_WEB_TIMEOUT_MS=45000 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-web.test.ts e2e/issue-1144-static.test.ts e2e/issue-1144-runner.test.ts --update=none
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=stable E2E_HBUILDERX_CASE=issue-1144-uni-app-x-web E2E_HBUILDERX_WEB_TIMEOUT_MS=45000 pnpm e2e:hbuilderx:h5
pnpm agents:test
pnpm agents:check
```

通过：聚合构建 65/65（均为 Turbo cache hit，不能单独作为新构建证据），随后直接重建 postcss 与 core；postcss 678 通过 / 3 跳过；core CI 模式 3326 通过 / 35 跳过；Web 矩阵 13 通过；运行器及默认快照策略 4 通过；规则检查器 6 通过。核心定向 uni-app x / 编译集成另有 103 项通过，包含共享兼容逻辑和非 Web 输入。

static 基线仅更新本 demo：`pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-static.test.ts -u`，审查 [important.json](../../../e2e/__snapshots__/issue-1144-web/important.json) 后以 `CI=1`、`--update=none` 重跑通过。断言来自实际生产 JS 中的 class 与 CSS selector 对应关系，不绑定产物哈希；压缩后的 padding 为 `0 !important`，浏览器计算值为 `0px`。

失败与限制：`pnpm typecheck` 和 `pnpm --filter @weapp-tailwindcss/postcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false` 均有类型错误，涉及未修改的 gulp、样式类型、选择器等模块；不宣称全仓类型检查通过。`pnpm --filter weapp-tailwindcss exec vitest run test/js.test.ts --update=none` 为 61 通过 / 1 名称快照失败，此例在 CI 模式被既有 `skipIf(isCI)` 跳过。CLI 生产编译虽退出成功，仍输出已有 UTS 配置/类型诊断，不能称为无警告编译。

可定位的本地原始产物（忽略目录，不作为版本化依赖）：

- 修复前：`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788671497963/`，`server.log` 的 `@apply mt-24!` / `expected ";"`、失败请求、截图。
- 修复后 IDE：`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788673310062/`，完整 `server.log`、`identity.json`、`initial.css/png`、16 份保存 CSS/JSON/截图、最终 HTML/截图及诊断。
- 修复后 CLI：`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788673358049/`，16 轮 CSS、截图和运行时记录；重复运行自动创建新时间戳目录。
- 全仓类型失败：`e2e/.artifacts/issue-1144-typecheck.log`；完整本机路径与版本以服务日志和 identity 文件为准。

## 适用边界

已确认并修复 Sass 解析根因，修复后本机 CLI 与 HBuilderX 5.24 两类验收均通过。但不能据此断言所有用户环境“彻底解决”：未单独复现一个排除 Sass 错误后仍存在的 pt 缓存冻结，也未用用户完整第三方组件包替代此最小真实消费组件。

用户截图的 HBuilderX 5.25 alpha 与当前稳定版会话存在启动冲突；为不终止用户 IDE，会话保持原样，该版本记为阻塞。Windows/POSIX 的路径身份已有单测，但 Windows/Linux 实机、Android/iOS/Harmony 和小程序设备未在本轮运行，不扩大为跨平台运行验收。新增 PR 检查只完成本地验证，未推送或等待远端 CI。

## 规则评估

全量盘点 45 份受版本控制的 AGENTS，保留现有单一生成器、精确 classNameSet、跨平台路径、构建图和会话归属边界。根规则改用 manifest 作为 Node/pnpm 版本来源，补 tools/examples/starter 路由，修正就近规则不得放宽安全边界的优先级表述；领域验证命令补 `pnpm exec`。多端细节仍只维护在已有 E2E 手册，不复制设备操作。

新增 [单一任务流程](../agent-workflow.md)、[全量规则索引](../agent-index.md) 与只读 `pnpm agents:check`。检查器验证显式路由、本地引用、可解析的明确命令、复盘必填项和回归路径；有效/无效样例覆盖缺路由、断链、错误命令、Windows 路径与错误 YAML。独立 PR workflow 不走 docs-only 跳过分支，也不运行产品构建或多端测试。

本次提炼的是已实际纠正的 oracle、真实消费方、服务身份、完整取证与快照写入规则。不增加“所有 HMR 问题清缓存”之类无证据规则；静态检查不声称能判断全部自然语言矛盾，不创建后台 AI 修改规则任务。后续复现 5.25 alpha 或独立 pt 冻结时，应增加新证据并明确替代本记录的边界，而不是删除本次纠正历史。
