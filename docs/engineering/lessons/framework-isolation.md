---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - packages/weapp-tailwindcss/test/ci/framework-boundaries.test.ts
  - packages/weapp-tailwindcss/test/ci/framework-core-inputs.test.ts
  - packages/weapp-tailwindcss/test/ci/framework-public-entries.test.ts
  - packages/weapp-tailwindcss/test/context/compilation-profile.test.ts
  - packages/weapp-tailwindcss/test/compiler/profile-session-regressions.test.ts
  - packages/weapp-tailwindcss/test/compiler/owner-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-root-store-cleanup.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-operation-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-loader-session.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-extension.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-dispatcher.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/style-injector-watch-parity.test.ts
---

# 框架目录不能替代配置、状态与生命周期边界

## 症状

主包已有框架目录，但共享 Vite 资源处理、样式收尾与 HMR 仍直接操作 uni-app-x 实现，Webpack loader 流程仍包含 Mpx 处理。旧边界用例只检查外层文件的字符串，无法发现子模块、类型引用和聚合导出形成的依赖。

最初交叉复核发现：显式指定同一 `tailwindcssBasedir`，先以 `MPX_CLI_MODE=web` 创建 context，再切换为 `wx`，会得到同一 context，平台仍为 `web`。第一阶段把环境加入缓存键，修复了这个现象，但仍把“相同配置”当成“同一个编译实例”。相同项目、相同框架和相同选项的两个构建仍可能共享可变 runtime、候选和 revision，不能作为长期设计。

## 根因与纠正

公开兼容入口解析用户配置、框架身份和环境事实；核心接收独立的 `ResolvedCompilationProfile` 与窄操作。框架策略只返回配置，不持有会话。配置深复制并冻结内部数据，保留用户对象可变；函数按身份参与缓存键，不能以相同函数源码代表相同闭包。配置更新产生新 revision，异步请求使用开始时的快照，旧结果不覆盖新配置。

每个 Core 和构建器实例拥有自己的可变会话，相同配置也创建独立实例。同一 watch 会话跨轮复用，后续独立 build 重新建立会话。原 context 缓存入口仅保留兼容调用，停止缓存可变 context；共享准备缓存继续按内容和依赖失效。实例显式保存环境事实，内部不能在参数缺失时回读全局环境。隐藏 Symbol 与旧运行时回溯限定在兼容桥。

会话状态为 `active → closing → closed`，关闭后拒绝新任务，重复关闭复用同一 Promise。构建器协调者先排空完整任务，再释放框架扩展、构建图关系和核心资源。Webpack loader 的租约覆盖读取、生成、变换和回调，processAssets 包含并行子任务与产物提交；registry 按实际 compiler 身份绑定，不使用“最近注册实例”兜底。watch 可恢复失败结束当前轮次，致命初始化失败和永久关闭完整清理。部分清理失败仍释放剩余资源并聚合报告，后台 LRU 淘汰异常也必须收集到最终关闭。生成后端在入口明确选择，删除根据 TypeError 文案切换后端的行为。

Vite 策略分为来源、生成阶段、样式组织和产物处理四组。框架得到只读配置、候选副本以及生成、转换和诊断操作，不取得完整 opts、原始 handler、可写候选集合或外部资源的 dispose。只读资产视图与替换、生成、删除操作由构建器落实，Taro 专属资产同样遵守这一接口。单位转换阶段、样式是否嵌入脚本等解析为能力，UNI/TARO/MPX 识别留在兼容入口。

框架维护静态插件描述，在现有 `configResolved` 时机创建活动实例。配置前置行为不创建编译会话，禁用插件也不建立 runtime。dispatcher 与内置 injector 使用同一逐插件代理，保留 hook 元数据、上下文、返回值、sourcemap、异常和每轮 buildStart；实际 hook 与声明不一致时明确失败。injector 继续使用独立包的公开工厂。Webpack 保留自己的 compiler/loader 契约。

框架身份、别名、支持组合和模块归属成为声明数据，各构建器维护类型化注册表。AST 图覆盖主包及独立 injector 的实现、子目录、类型、动态导入和重导出。未知或冲突归属失败；核心输入类型检查包含别名、命名空间和聚合导出。兼容例外只登记具体依赖边、原因和替代入口，不豁免整个文件。测试框架通过新增实现、注册及 fixture 完成生成与更新，共享流程无需增加分支。

## 验证

本轮在独立工作树、macOS、Node 24、pnpm 12 上验证，设置 `CI=1` 和 Vitest `--update=none`。第一阶段曾通过 41 个文件、616 项定向测试；这是历史证据，不能代替本轮配置、会话和调度调整后的复验。

本轮定向覆盖以下行为：

- profile 与环境快照：不同框架、不同项目、同项目同配置的独立实例；交错候选、配置、环境更新和独立关闭；同源码不同捕获值的回调。
- 生命周期：任务排空、重复关闭、清理失败、watch 错误恢复、来源删除、配置失效及旧任务结果隔离。
- Vite 与 injector：真实重复 build、Vite 4–8 watch/HMR、模板删除、uni-app-x 局部样式与样式哈希、内置与独立 injector 连续更新和删除对照。
- Webpack/Rspack/Gulp：真实来源生成契约、Mpx loader、compiler registry、重复 apply、完整任务关闭与流处理。
- 架构：直接、类型、别名、命名空间、聚合导出、跨框架引用及未登记 injector 模块反例；测试框架扩展。
- 发布：公开类型、ESM/CJS、loader 路径和受支持 Node 的 HBuilderX 同步加载链路，拦截官方 Tailwind ESM 生成插件防止意外引入。

首批定向结果（2026-10-23，生产源码提交 `95b3ef2ba`）：

| 范围 | 结果与复验入口 |
| --- | --- |
| Vite 最终整合 | 21 文件、445 项通过，包含 framework-services、framework-assets、uni-app-x-postprocess、vite-runtime-refresh、vite-css-finalizer、vite-auto-rpx-calc、vite-plugin-hooks、vite-plugin.bundle、vite-plugin.uni-app-x、vite-framework-isolation、framework-plugins、vite-framework-extension、vite-framework-universal、vite-build-reuse、style-injector-watch-parity、source-generation-contract、uni-app-x/vite、vite-plugin.hmr-version-matrix、vite-plugin.template-delete-watch、vite-uni-app-x-css-watch、vite-uni-app-x-css-hash 对应测试 |
| Webpack/Gulp | 9 文件、224 项通过，包含 webpack.v5.unit、webpack-framework-isolation、webpack-operation-lifecycle、webpack-session-lifecycle、webpack-loader-session、webpack.v5-loader-preparation、webpack-style-injector-integration、webpack.v5-runtime-metadata、gulp 对应测试 |
| 独立 injector | `pnpm --filter weapp-style-injector exec vitest run test/index.test.ts test/shared-resolution.test.ts --update=none`，94 项通过 |
| 核心/profile | 21 文件 122 项通过；最后新增后台淘汰清理回归与 owner-lifecycle 合计 10 项通过。两处旧 mock/文案断言失败修正后单独复验，不计为跳过 |
| 架构门禁 | framework-boundaries、framework-core-inputs、architecture-contract、architecture-graph、generation-ownership 合计 111 项通过。原 diagnostics 路径断言随实现归属迁移后复验 |
| 公开入口 | framework-public-entries、package-module-exports、exports-alias、vitest/dts、build/dts-module-specifiers 合计 22 项通过 |
| 构建与类型 | `pnpm --filter weapp-tailwindcss build`、`pnpm --filter weapp-style-injector build`、主包严格源码 tsc、tsconfig.typecheck 和 `pnpm --filter weapp-tailwindcss tsd` 通过；tsd 发现并推动恢复 Gulp watchChange 可选参数 |
| 工程门禁 | `pnpm architecture:check`（37 包、1509 源文件、53 组装边、13 兼容边）、`pnpm agents:check`、生产源码 ESLint、`git diff --check`、`pnpm release status` 通过 |

包内单测统一使用 `pnpm --filter weapp-tailwindcss exec vitest run <上述对应测试路径> --update=none`，运行日志与 JSON 报告保存在忽略目录 `.tmp/framework-isolation/reports/`。上表按范围列出，不把重跑与交叠用例累加成全仓测试数量。

首批实现没有修改 demo 或已有 CSS/JS static 快照；后续 CI 复验发现 injector 输出阶段顺序问题，修复并重新生成 uni-app 独立分包 static 基线。五个 CSS 文件的差异仅为 21 处 token trace 注释保留标记，选择器、声明、preflight 与顺序不变。命令与首次失败证据见 [injector 输出顺序复盘](vite-injector-output-order.md)。

### CI 失败修复后的定向复验

提交 `3098337`、`1ce19bef5`、`2f11d0de5` 修复 CI 暴露的问题：

- 将旧 context、Webpack testkit 和 Vite 配置解析 fixture 迁移到已收紧的契约，保留原有行为断言；提取 Webpack 已配置 CSS 来源收集，满足源码行数门禁。
- 保留 injector 的 hook 元数据，并明确资产生产者先于 post 阶段生成与收尾消费者；新增真实 Vite wxss/acss 回归，修复前两项均失败，修复后通过。微信、支付宝、抖音各 isolated/single 六组实际构建输出通过。
- CSS 缓存键原先包含本轮 dirty 集合，使候选与内容不变的下一轮仍重新生成。改为当前 HTML/JS 对运行时有影响的稳定哈希；部分 bundle 保留既有来源关系，显式删除移除对应来源。保留缓存调用次数断言，并覆盖真实候选变化、配置依赖失效和删除。

最终整合后，Core/重写/Web parity 共 4 文件 48 项、Webpack/源码行数共 4 文件 174 项，以及 Vite 生成、真实 injector、CSS 决策、重复 build 和 watch 对照共 5 文件 44 项通过；主包重新构建通过。Web parity 首次本地运行因 website 依赖缺失失败，补齐锁定依赖后原 3 项全部通过，未修改 lockfile。各修复分支另有定向结果，数量不与上述整合结果相加。

远端 `c6812c05e` 的 Benchmark run `39942216772` 首次 Taro Webpack 构建中位耗时超预算 5.662%；保留同 SHA、同参数和原阈值进行一次复验后通过，第二次构建中位差为 -3.913%、HMR 为 -5.821%，无违规。两轮基线绝对耗时明显不同；证据仅说明未稳定复现回归，不证明环境噪声或性能提升。新提交仍需其自身 CI 结果。

性能预算使用 `pnpm --filter benchmark-performance guard -- --suite core --runs 7 --warmups 2`：24 个场景、每个预热 2 次并采样 7 次，既有耗时、内存、输出稳定性与复杂度预算全部通过，0 违规、0 观察项。三个输入规模为 50、100、200；本机 Apple M4 Max，Node 24.18.0。结果保存在 `.tmp/framework-isolation/performance-core/synthetic.json` 和同目录 Markdown。第一次运行因独立工作树缺少 cn 构建产物未进入测量，构建 runtime/cn/merge 后串行执行成功，没有调整预算。微基准不代替实际 watcher 或设备性能。

真实 watcher 使用 `pnpm --filter benchmark-performance watch:report -- --bundlers vite,webpack --sizes 10,50,100 --runs 7 --warmups 2`，6 个组合全部通过。每个组合保留同一 watcher，测量连续候选新增、作者样式删除、配置修改及逐项恢复的完整 6 次更新循环；恢复后的 CSS 哈希始终一致。100 来源规模的中位耗时为 Vite 1296.79ms、Webpack 1419.27ms，p95 分别为 1925.09ms、1867.14ms，GC 后峰值 heap 分别为 70.46MB、107.70MB。首次启动和 RSS 也保存在 `.tmp/framework-isolation/watch-lifecycle.json`。该结果是当前版本实测；只有 core 场景使用既有预算，不宣称 watcher 相较旧版本提速或有独立预算门禁。

第一阶段报告 `e2e/.artifacts/preflight/6511fe15-087f-45a5-bcfd-610b8fe1efc1/report.md` 曾记录微信服务被另一会话持有、Android 两个目标未明确选择；这份旧报告不用于本轮放行。

第二轮 `pnpm e2e:preflight prepare` 报告为 `e2e/.artifacts/preflight/a7fedcee-29cf-4214-b381-22057f61d5fb/report.md`（同目录 JSON、日志和探针截图）。base、HBuilderX、iOS、Android、Harmony、Web 全部通过，Android 的旧目标歧义已解除。微信被服务 19355 的其他任务租约阻断，登记属于 `tailwind-capability-e2e`、PID 18647；只读核对时该 PID 已退出。本轮未执行 computer use、verify 或全面 E2E。

用户授权通知原任务后，原任务已定向清理该孤儿协调锁，保留清理回执；未改动登录态或启动测试。原任务的预检项目仍在 IDE 打开，因原绑定丢失未自动关闭。当前代码已再次调整，仍须重新 prepare 并核对服务状态，不复用上述报告。公开入口加载回归不代表真实 HBuilderX 构建或设备验收通过。

## 适用边界

继续统一发布，包名、公开配置、导入路径和支持组合兼容。Rspack 复用 Webpack，Gulp 保留 native；目录隔离不增加支持组合。env 提供事实，engine 生成 Tailwind，postcss 转换 CSS，这些能力不复制到框架。只有独立依赖、维护负责人或发布周期出现实际需要时再考虑拆 npm 包。

本记录保持 `partial`，直到本轮多端预检与真实设备验收完成。定向单测、真实构建和 watch 通过不能替代完整验收。

## 规则评估

更新已有 compiler、generation 和 framework-policies 目录规则，明确中立输入、快照所有权和终止生命周期；Architecture 工作流显式执行新增门禁回归。优先使用持久反例和唯一归属登记封闭绕过，不新增宽泛目录豁免。
