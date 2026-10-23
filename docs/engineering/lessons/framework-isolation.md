---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - packages/weapp-tailwindcss/test/ci/framework-boundaries.test.ts
  - packages/weapp-tailwindcss/test/ci/framework-core-inputs.test.ts
  - packages/weapp-tailwindcss/test/ci/framework-public-entries.test.ts
  - packages/weapp-tailwindcss/test/context/compilation-profile.test.ts
  - packages/weapp-tailwindcss/test/context/style-capability.test.ts
  - packages/weapp-tailwindcss/test/compiler/profile-session-regressions.test.ts
  - packages/weapp-tailwindcss/test/compiler/owner-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/compiler/owner-activity-scope.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-root-store-cleanup.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-transform-retention.test.ts
  - packages/weapp-tailwindcss/test/ci/css-compat-workflow.test.ts
  - e2e/playwright-image-ci.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-operation-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-loader-session.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-extension.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-runtime-facts.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-cache-inputs.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-asset-demand.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-context-lifetime.test.ts
  - packages/weapp-tailwindcss/type-tests/framework-css-context.test.ts
  - e2e/uni-app-vite-vue3-hbuilderx-tailwindcss-v4.test.ts
  - e2e/demo-visual-artifact-root.test.ts
  - e2e/demo-visual-project-root.test.ts
  - e2e/framework-ide-artifact-contract.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-bundle-asset-demand.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-dispatcher.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/style-injector-watch-parity.test.ts
  - scripts/ci/demo-matrix/mpx-static-config.test.mjs
  - benchmark/version-compare/test/watch-output.test.mjs
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

只读能力查询与编译请求快照也必须分开。Taro 真实构建观测到约 20722 次“样式是否嵌入脚本”查询，每次都创建完整 profile，造成约 923ms 累计耗时，其中配置指纹约 705ms；真正编译请求只额外创建 4 次 profile。查询改为只调用已有策略解析，保持参数、配置与实例环境的优先级，不遍历无关来源配置，不推进 revision，也不按可变配置对象身份盲目缓存。回归先证明旧实现的 10 次查询读取 cssEntries 20 次，修复后无读取且既有请求仍有效；正式解析新配置时才推进 revision。

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
- CSS 缓存键原先包含本轮 dirty 集合，使候选与内容不变的下一轮仍重新生成。先尝试当前 HTML/JS 对运行时有影响的稳定哈希；后续真实 HMR 性能验证发现该输入仍过宽，最终修正见下文。部分 bundle 保留既有来源关系，显式删除移除对应来源。保留缓存调用次数断言，并覆盖真实候选变化、配置依赖失效和删除。

最终整合后，Core/重写/Web parity 共 4 文件 48 项、Webpack/源码行数共 4 文件 174 项，以及 Vite 生成、真实 injector、CSS 决策、重复 build 和 watch 对照共 5 文件 44 项通过；主包重新构建通过。Web parity 首次本地运行因 website 依赖缺失失败，补齐锁定依赖后原 3 项全部通过，未修改 lockfile。各修复分支另有定向结果，数量不与上述整合结果相加。

远端 `c6812c05e` 的 Benchmark run `39942216772` 首次 Taro Webpack 构建中位耗时超预算 5.662%；保留同 SHA、同参数和原阈值进行一次复验后通过，第二次构建中位差为 -3.913%、HMR 为 -5.821%，无违规。两轮基线绝对耗时明显不同；证据仅说明未稳定复现回归，不证明环境噪声或性能提升。新提交仍需其自身 CI 结果。

性能预算使用 `pnpm --filter benchmark-performance guard -- --suite core --runs 7 --warmups 2`：24 个场景、每个预热 2 次并采样 7 次，既有耗时、内存、输出稳定性与复杂度预算全部通过，0 违规、0 观察项。三个输入规模为 50、100、200；本机 Apple M4 Max，Node 24.18.0。结果保存在 `.tmp/framework-isolation/performance-core/synthetic.json` 和同目录 Markdown。第一次运行因独立工作树缺少 cn 构建产物未进入测量，构建 runtime/cn/merge 后串行执行成功，没有调整预算。微基准不代替实际 watcher 或设备性能。

真实 watcher 使用 `pnpm --filter benchmark-performance watch:report -- --bundlers vite,webpack --sizes 10,50,100 --runs 7 --warmups 2`，6 个组合全部通过。每个组合保留同一 watcher，测量连续候选新增、作者样式删除、配置修改及逐项恢复的完整 6 次更新循环；恢复后的 CSS 哈希始终一致。100 来源规模的中位耗时为 Vite 1296.79ms、Webpack 1419.27ms，p95 分别为 1925.09ms、1867.14ms，GC 后峰值 heap 分别为 70.46MB、107.70MB。首次启动和 RSS 也保存在 `.tmp/framework-isolation/watch-lifecycle.json`。该结果是当前版本实测；只有 core 场景使用既有预算，不宣称 watcher 相较旧版本提速或有独立预算门禁。

第一阶段报告 `e2e/.artifacts/preflight/6511fe15-087f-45a5-bcfd-610b8fe1efc1/report.md` 曾记录微信服务被另一会话持有、Android 两个目标未明确选择；这份旧报告不用于本轮放行。

第二轮 `pnpm e2e:preflight prepare` 报告为 `e2e/.artifacts/preflight/a7fedcee-29cf-4214-b381-22057f61d5fb/report.md`（同目录 JSON、日志和探针截图）。base、HBuilderX、iOS、Android、Harmony、Web 全部通过，Android 的旧目标歧义已解除。微信被服务 19355 的其他任务租约阻断，登记属于 `tailwind-capability-e2e`、PID 18647；只读核对时该 PID 已退出。本轮未执行 computer use、verify 或全面 E2E。

用户授权通知原任务后，原任务已定向清理该孤儿协调锁，保留清理回执；未改动登录态或启动测试。原任务的预检项目仍在 IDE 打开，因原绑定丢失未自动关闭。当前代码已再次调整，仍须重新 prepare 并核对服务状态，不复用上述报告。公开入口加载回归不代表真实 HBuilderX 构建或设备验收通过。

提交 `d6269d23f` 上的两轮新预检（`91c26f36-c8d2-482e-b476-813b8c17d0e6`、`b7de1a44-c177-40ba-bb7a-dfead581c8a7`）均完成七项探针、当前会话 Chrome 原生输入/点击/截图和 verify，微信租约阻塞解除。两轮均由 `pnpm e2e:demo:workflow:local --quality --preflight-report <本轮报告>` 正式领取，失败后释放会话；本任务创建的两个临时 Chrome 标签页均已关闭。

第一轮根构建因独立工作树的示例未安装锁定的 `tailwindcss-patch` 依赖停止。执行 `pnpm install --frozen-lockfile --ignore-scripts` 补齐 97 个 workspace 项目的依赖，没有修改 lockfile；重新 prepare 后，第二轮根构建通过（71 个任务，8 个命中缓存）。随后全量单测为 1018 文件通过、1 文件失败、5 文件跳过；10955 项通过、1 项失败、1 项预期失败、44 项跳过。唯一失败是 JS-only bundle 中新增 CSS 依赖签名造成两次无用哈希；修复将签名计算限制在实际存在 CSS 且开启样式处理时，保留原有三次哈希断言，整个 bundle 回归与源码行数用例共 211 项通过。生成、injector、CSS 决策、重复 build 与 watch 对照另有 44 项通过。

两轮全面流程均未进入设备验收，失败原始日志与内存报告保存在 `.tmp/framework-isolation/local-acceptance/<run-id>/`。Windows watcher 夹具的父目录初始化修复见 [虚拟 watcher 边界复盘](virtual-watch-fixture-boundary.md)。当前 head 的 Taro Vite 与 uni-app Vite 远端性能任务尚有失败，必须保留原预算完成归因和复验，不能以定向行为通过代替性能验收。

### 性能回归的输入边界修复

`6c5031219` 的质量三个分片、Ubuntu core smoke、四组 platform watch 和九组 repeated watch 全部通过，但 Taro Vite 构建中位耗时仍增加 10.56%（3/3 超阈值，p=0.05），uni-app 稳态 HMR 插件 P95 从 94ms 增至 207ms（2/2 超阈值）。固定基线 `fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417` 的本地 3 次构建 / 3 次 HMR 也复现未修复 Taro +5.753% 和 uni-app P95 109ms → 173ms。远端为 Ubuntu Node 22.23.3，本地性能对照为 macOS Node 22.22.3；不混算两个环境的样本。

Taro 的完整 profile 热点按前述策略查询边界修复；uni-app 的 CSS 任务只消费样式内容、配置、运行时候选与来源标注，任意 HTML/JS 文本不是其输入。移除全局 linked-source 签名及传递链，继续使用已有缓存键中的真实输入，不增加另一份关系图或可变状态。新增七项真实任务回归覆盖无关属性/业务字符串、候选同集重排、候选增删、部分 bundle 恢复、配置失效、来源删除和标注移动；修复前三项确定失败，修复后与原 bundle 全文件及关联回归合计 278 项通过。旧签名 helper 的镜像测试由这些行为回归替代，原 bundle 的 210 项断言保持不变。

配置查询相关五文件 49 项通过。额外发现的旧 incremental issue #33 fixture 在未修改的 `6c5031219` 独立执行时 6/6 失败；显式使用其测试语义所需的 uni-app 组装入口后，保留原断言的六项全部通过。合并生产实现后的主包构建和新增 profile/CSS 15 项组合回归通过，主包类型与生产源码 ESLint 通过。

修复后的本地 uni-app 3+3 采样遇到其他任务并发编译：同轮基线构建耗时升至 24–36 秒，而前轮约 4–6 秒；后半轮负载下降。保留进程与原始采样证据，并将报告 `acceptance.usable` 标为 false，不采信表面的通过结果、不终止其他任务，也不放宽预算。修复后 Taro 本地正式对照尚未执行；性能结论须以当前提交的独立 CI 原预算结果为准。本地功能全面验收仍须在新预检后执行。

提交 `5b889d9436294001ca0552c68e157016f6f48e2b` 的 CI 已验证 uni-app Vite 修复：构建中位耗时 7398.65ms → 7266.61ms，稳态 HMR 插件 P95 150ms → 166ms，原门限无违规。Mpx、Taro Webpack、weapp-vite 和 synthetic 分片同样通过。Taro Vite 构建中位耗时 32822.43ms → 32660.67ms，但 HMR 插件中位耗时 1867ms → 2034ms，构建/HMR 内存仍超原预算。CSS 任务中位耗时增加约 140ms，根样式收尾增加约 29ms；这些是分段观测，不能仅凭相关性认定根因或内存泄漏。完整报告来自 Benchmark run `39954807193`，失败样本继续保留。

同一提交的新预检 `3eaac4fb-8271-4813-8fff-e885916e51bc` 因原生 Chrome computer use 超时而明确阻断。实际有界重试仍失败后，改用当前会话后台应用内浏览器并重新 prepare；`ed279c07-c0b1-4ed0-9468-d06c586478b1` 的全部探针、真实输入/点击/截图与 verify 通过，临时页面已关闭。完整入口通过根构建 71/71（0 缓存）、单测 1021 文件（10968 通过、1 预期失败、44 跳过），以及 lint、类型、架构、文档构建、规则、release status 和 34 项矩阵断言。

该轮 static 阶段在 30/400 文件时，进程身份探针 `ps` 超过 5000ms；清理探针又耗尽 2000ms 预算，自动清理未确认。残留子进程继续运行不能作为有效后续验收。核对本轮 static 根 PID、启动时间、父进程与命令后定向发送 SIGINT，工作流退出 1；随后确认登记进程与根工作树命令无残留、Git 状态干净。原始日志、内存报告和定向清理记录归档在 `.tmp/framework-isolation/local-acceptance/ed279c07-c0b1-4ed0-9468-d06c586478b1/`。static、watch、IDE 和设备完整验收仍未完成，已消费的报告不能复用。

进一步审计发现，静态 CSS 策略判断通过展开带 `assets` getter 的上下文，复制一份完整 bundle 视图后又覆盖它；动态配置入口解析还再次覆盖同一视图。静态决策改为只读取所需能力，动态 hook 存在时才创建当前只读资产视图，保留惰性属性而不触发被覆盖的 getter。真实 wxss/acss 注入回归在旧实现全部失败：两轮静态更新读取脚本 `sourcesContent` 16 次，动态解析每次创建 3 份视图。修复后分别为 0 次和 1 份，连续更新输出、冻结隔离与新鲜性全部通过。九文件 294 项相关回归、类型、主包构建、源码 ESLint 与架构检查通过；没有调整性能门限。此证据证明消除了无用分配，实际耗时和 RSS 收益仍待最终提交的性能门禁确认。

### 当前提交的性能复验与宿主负载边界

提交 `39a424426d5304371f829344d297824fd8aa17ed` 的 Benchmark run `39962985705` 已在原门限下通过全部五个框架分片及聚合检查。Taro Vite 的 HMR 插件中位耗时从 2240ms 降至 1947ms，稳态 P95 从 2489ms 降至 1965ms；构建峰值 RSS 增加 0.55%、HMR 峰值 RSS 增加 2.36%、稳态 RSS 减少 4.27%，违规列表为空。相关原始 artifact 为 `12507065571`，该结论只针对这次固定基线、当前提交和 CI 环境，不混入受本机并发负载污染的采样。当前提交的质量、架构、跨平台 watch、重复 watch、Expo iOS/Android 与 Lynx iOS 也已通过；普通 CI 不替代本地多端验收。

同一提交的新预检 `ecd69b1b-5b6c-4469-ab1b-bf340a722766` 完成全部环境探针、当前会话后台浏览器的真实输入、点击、截图与 verify，临时页面已关闭。`pnpm e2e:demo:workflow:local --quality --preflight-report <本轮报告>` 的根构建 71/71、0 缓存通过，但全量单测阶段再次发生 5000ms 的进程身份探针超时，现场 host load 为 100–118。新清理路径执行本次活句柄及身份复核后的 TERM/KILL，工作流退出 1；随后确认登记进程无残留，将内容与测试写入逻辑一致的中断 HMR fixture 定向归档，工作树干净。不能把中断的单测计为通过，后续 static、watch、IDE 与设备阶段未执行。

该轮原始日志、进程身份、内存报告、清理回执与恢复探针归档在 `.tmp/framework-isolation/local-acceptance/ecd69b1b-5b6c-4469-ab1b-bf340a722766/`。本机并行重任务的错峰协调由用户明确授权；只能请各任务安全完成自己的阶段，不停止他人进程或 IDE。暂停和共同窗口都要有明确结束条件，完整流程开始前仍需重新 prepare、当前会话交互与 verify，不调整现有超时、预算或门禁。

### 运行时框架判断的最小输入

最终只读审查发现，`requiresCssHotReload` 和 `splitGenerateBundlePhases` 仍接收完整 Vite `ResolvedConfig`，而现有实现仅消费插件名称和 mode。构建器现在按实例维护冻结的 `mode`、`pluginNames` 快照；每次判断检查当前必要值，未变化复用快照，配置解析前返回 undefined，后续 mode、插件名称、增删及排序变化产生新快照。用户配置、数组和插件对象不冻结，旧快照保持有效，首次缺少 mode 的兼容输入也不会误命中空快照。

真实产物阶段回归在旧实现先失败，修复后覆盖前置 undefined、mode 往返、配置变化与实例隔离。运行时契约的 AST 门禁同时拒绝完整 Vite 配置与插件输入，包括类型别名、命名空间、通配及经过聚合文件的二次命名转出；持久 TypeScript 负向断言由真实 tsc 执行，不能只依靠 Vitest 转译。独立复核发现的首次缺省 mode 和重导出绕过均保留失败用例。

实现提交 `30e44e8b4496dfee4a186bf1a94f03c16474bb3f` 的五个定向文件共 108 项通过，主任务整合提交 `f16fa74d191fccc74c6c2fa6423cb76c08581cd1` 再次通过全部 108 项与主包构建。命令为 `pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-framework-runtime-facts.unit.test.ts test/bundlers/vite-framework-isolation.unit.test.ts test/bundlers/vite-source-candidates-hmr.unit.test.ts test/ci/framework-core-inputs.test.ts test/ci/framework-boundaries.test.ts --update=none --maxWorkers=1`；严格 `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`、源码及新增测试 ESLint、architecture:check（37 包、1511 源文件）、agents:check 与 diff 检查通过。此前 `39a424426` 的远端结果保留为历史证据，新提交需重新执行自身 CI 与本地完整验收。



提交 `a763888caff3c66d59fe6bcc391c1fbf45093af5` 的 Benchmark run `39972393388` 在原预算下完成五框架分片及汇总门禁，全部 artifact 的 SHA-256 已独立核验。Taro Vite 插件 HMR 中位耗时 -6.88%，HMR peak/steady RSS +0.38%/+0.23%。Mpx 首次 HMR peak/steady RSS 为 +6.15%/+7.50%，既有协议的反向顺序独立复测未复现，confirmedViolations=0；Taro Webpack 插件 HMR 汇总为 +9.27%，steady 原始样本 `[1208,1183] → [1320,1148]` 未满足持续样本门槛。门禁通过不能改写为全部单项百分比都低于 5%。weapp-vite 没有插件分段计时，整体构建、watch 和内存有实际样本；原始证据及精简对账保存在 `.tmp/framework-isolation/ci-evidence/a763888caff3c66d59fe6bcc391c1fbf45093af5/`。

### 错峰完整验收中的快速退出竞态

提交 `a763888caff3c66d59fe6bcc391c1fbf45093af5` 在共同错峰窗口重新执行预检 `7b7d6991-e8b6-4251-80f8-807c5569a11f`，全部七项探针、当前会话后台浏览器真实输入、点击、截图和 verify 通过，临时页面已关闭。完整入口 `pnpm e2e:demo:workflow:local --quality --preflight-report <本轮报告>` 的根构建 71/71、0 缓存通过；全量单测完成，1022 文件通过、1 文件失败、5 文件跳过，10991 项通过、1 项失败、1 项预期失败、44 项跳过。

唯一失败是 `website/scripts/local-worker/command.test.ts` 的真实 CLI 首次失败用例。`lifecycle.ts` 首次采集时根 PID 已退出，抛出“启动身份未确认：根进程已退出或首次采集缺失，不能确认后代归属”，使测试收到清理归属错误而非预期命令退出结果；嵌套 Playwright 的断言失败本来就是该回归构造的输入，不能计为另一项意外失败。这次没有重复出现上一轮的进程探针超时。启动时 host load 为 8.91 / 16.87 / 31.23，失败后为 26.80 / 29.37 / 33.91；负载数据不用于替代代码竞态的分析。

工作流退出 1，后续 lint、类型、架构、static、watch、IDE 与设备阶段未执行。已立即释放共同窗口，核对登记 PID 和任务目录命令均无残留，Git 状态干净。完整日志、内存报告、退出回执与进程快照保存在 `.tmp/framework-isolation/local-acceptance/7b7d6991-e8b6-4251-80f8-807c5569a11f/`。修复需保留后代归属与 PID 复用边界，并通过确定性快速退出回归；不能忽略身份错误或反复重跑以获得偶然通过。

整合提交 `8d8403397b57f28c9ebbd819848a00849da22e72` 的网站 CLI 启动回归 6 文件、60 项全部通过，原真实 Playwright 首错退出和两种配置发现链路均恢复通过。网站 CLI 启动顺序的根因、握手修复与跨平台加载回归见[本地 CLI 启动身份复盘](local-worker-startup-identity.md)。该修复属于验收基础设施，不改变框架能力或扩大进程清理范围。

提交 `69797138eca97db894e798016d23cb6f99fb1d74` 的新预检 `07356e5b-740f-4847-bdb9-a986013869ac` 完成七项探针、当前会话真实后台页面交互及 verify。此时新增的真实 Windows CI 暴露生命周期回归，因此未启动完整验收，立即向七个协作任务释放错峰窗口。按 cwd 和监听端口确认本轮预检进程后定向 SIGTERM，报告转为 blocked，登记进程、端口和临时浏览器页均已释放。决策与清理证据保存在 `.tmp/framework-isolation/local-acceptance/07356e5b-740f-4847-bdb9-a986013869ac/acceptance-decision.json`；后续不能复用该报告。

同一提交的 Benchmark run `39983357531` 中，Mpx HMR peak/steady RSS 首测分别增加 12.01%/11.01%，既有反向顺序复测仍增加 30.37%/16.95%，确认两项违规。采样没有构建错误或缺证，不属于 Windows 测试的连带失败。相较上一通过提交，主包与 benchmark 源码未改变，但这不能抵消当前失败；保留原始 GC、内存与构建日志继续定位，未放宽预算或重跑获取偶然通过。


### 异步活动租约的实例引用释放

配置与会话隔离后，异步活动使用租约识别关闭前已接收的嵌套任务。定向诊断发现：已结束租约仍随异步上下文传播，并强引用编译实例；新任务又复制这些失效租约。6000 次继承回调累计复制 18003000 个租约槽，真实 GC 夹具中 1024 个已完成实例仍无法回收。仅过滤失效租约仍会保留最后一个实例，所以修复同时过滤继承租约，并在结束时清除 owner 引用。

整合提交 `0efd25c84` 与 `57486ba32` 保留关闭期间已接收的跨实例嵌套工作，拒绝外部新工作；GC 夹具验证待处理任务保持 owner 存活，已结束实例全部释放。子进程采用 15 秒内部截止、20 秒测试外层截止和 Vitest 取消信号。主工作树执行 `pnpm --filter weapp-tailwindcss exec vitest run test/compiler/owner-activity-scope.test.ts test/compiler/owner-lifecycle.test.ts test/ci/local-worker-workflow.test.ts --update=none --maxWorkers=1`，三文件 13 项通过。

该缺陷与当前 Mpx/Uni Vite 性能失败分开记录：Mpx 真实 watch 的活动深度最高为 4，未观察到失效租约堆积。带 inspector 的分配采样也会改变分配与 GC 节奏，其 RSS 和耗时不能替代正式预算验收。目前没有证据把本修复认定为上述框架性能失败的根因。主包 ESM/CJS 与声明构建、website 类型检查、architecture:check（37 包 / 1511 个源码文件）、agents:check 和 release status 均通过。
### 只读资产契约的惰性求值

收紧契约后，CSS 框架上下文通过 `assets` getter 投影只读资产。调用方继续使用对象展开来扩展每个请求，导致 getter 提前求值，即使 Uni 的小程序 JS 钩子返回 undefined、完全不访问资产。真实 generateBundle 的确定性计数中，2/4/8 个 JS chunk 分别读取 sourcemap 内容 10/28/88 次，成本随 chunk 数量平方增长。

提交 `d1cdd1d5f` 用统一的属性描述符扩展器保留惰性访问，覆盖生成、finalizer、配置根样式与 serve 路径。实际读取继续取得当前 bundle 的受限投影，未缓存整份旧视图；键集合与 CSS 文本维持读取时快照，chunk.code 保持既有 live getter 语义。另移除 CSS entry 路径附加的原始 bundle 引用。回归涵盖首轮与单 JS 更新、跳过与实际转译、replace/emit/remove 后重新读取和拒绝写入；对应无需求读取降至 0。独立审查无阻断项，作者 10 文件 286 项通过，主工作树新两文件 12 项与 ESM/CJS/声明构建通过；仅内存 bundle fixtures 变化，无 demo/static 基线变更。

主工作树在 macOS arm64 / Node 24.18.0 执行无 inspector、无计数 preload 的基线/当前 Uni 小程序对照，各 3 次构建、3 轮 HMR，既有 5% 与绝对差值/显著性预算通过、0 违规。构建插件中位数 1009→984ms，HMR 插件中位数 105→99ms，HMR peak/steady RSS 1407.22/1323.12→1394.22/1320.38MB。原始 matrix、同一 CI 评估器生成的 summary 和报告保存在 `.tmp/framework-isolation/uni-lazy-assets-comparison/`；这支持本机该工作负载通过，远端 Node 22 仍须验证当前 head，不能证明此前 CI 的全部退化都来自此处。

Mpx 的一组轻量计数对照中，两侧均首构建加 3 次新增/回退，共 7 个完整 processAssets 轮次；每轮 service/pipeline 4 次、compiler 3 次、缓存任务 23 次相同。首轮 23 miss，后续每轮 13 hit/10 miss；配置 revision 的 3 次变化均在首轮，后续稳定为 3。该组未发现额外生成或配置反复失效，但 RSS 仍有差异。后续 Node 22 的异步上下文诊断出现中间重建轮次，空闲时 disable 的反向对照也未确认稳定收益，因此尚不将其作为生产性能修复，继续核对写入、失效与构建完成的因果关系。

Node 22.22.3 在提交 `1c4ed4a2a72d9eec79715cb178a6b4f8668105b1` 上执行无 preload 的同范围对照，Uni 继续通过原预算；Mpx 的 peak/steady RSS 为 1671.91/1659.73→1823.33/1795.95MB，仍有 2 项违规，未作为通过记录。原始结果保存在 `.tmp/framework-isolation/node22-framework-performance/`。

### Mpx 配置硬链接触发的 watch 反馈

因果诊断串联源码写入、invalid/watchRun、processAssets、afterEmit 与 done。新增输入都晚于上一轮 afterDone，但部分构建仅由 `static` 目录失效触发，产物仍是上一份模板。实际依赖 `@mpxjs/vue-cli-plugin-mpx@2.2.30` 的 watch 回调每轮无条件删除输出配置，再将其硬链接到 `static` 源配置；即使两者已是同一 inode，重链仍改变源文件 ctime，触发下一轮监听。不能把这些额外构建归因于编译会话或租约释放。

诊断仅跳过两个常规文件的 dev/非零 inode 都相同的重复重链。相同 3 轮增删中，原行为完成 10 次构建、4 次 static 失效；诊断 guard 完成 8 次构建、1 次 static 失效，保留第一次及真实修改事件。峰值/稳态 RSS 从 2167.56/2130.08 降到 1512.61/1497.84MB。带探针的这些数值只用于因果分析，不代替不带探针的正式预算验收。证据保存在 `.tmp/framework-isolation/mpx-link-causal/`。

截至本次核对，npm 2.2.32 与上游 [固定 next 源码](https://github.com/mpx-ecology/mpx-cli/blob/915e1a862a1a5aeb1d3df0e78d57a25357e7c4d3/packages/vue-cli-plugin-mpx/utils/symlink.js#L36) 仍有相同行为；[配置同步讨论 #93](https://github.com/mpx-ecology/mpx-cli/issues/93) 没有提供重复建链修复。后续移除仓库依赖补丁时，须验证等价的文件身份判断、IDE 同步、原子替换及真实 watch 回归，不能仅凭升级版本移除。

现有仓库依赖补丁加入 bigint 文件身份判断，锁文件只替换六处补丁摘要；不将该 CLI 补丁发布为主包运行时能力。隔离应用后的 Node 22/24 回归各 29 项通过，包括重复调用、IDE 原位写入同步、源码原子替换、独立同内容文件、跨设备/权限失败的复制后备，以及既有致命 watch 错误传播。主工作树执行 `CI=1 pnpm --config.verifyDepsBeforeRun=false install --frozen-lockfile --offline` 成功，锁文件无漂移；实际解析到补丁目录后，在 Node 22.22.3 与 Node 24.18.0 再次运行 `scripts/ci/demo-matrix/mpx-static-config.test.mjs` 和 `mpx-fatal-watch.test.mjs`，各 29 项通过。

对应 static 验收以 `pnpm e2e:demo:matrix --update --build-only mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd style-injector-mpx:wx` 重新生成六目标，再以相同六目标、不传 `--update` 复核，分别 6/6 通过，基线零差异。构建前重新从已提交源码生成主包，确认没有诊断实验残留；原始命令与补丁哈希记录在独立工作树 `.tmp/mpx-static-validation.json`。不带探针的性能预算另行验收。

### 回滚测量判据的适用范围

原测量器将读取失败当空串，因此缺失或空产物可能被当作“已移除 marker”。本轮保留读取状态，ENOENT/EBUSY 继续等待，其他读取错误报告；warmup 要求全部探针非空。成功三轮只提交六次源码变更，不在 watcher 活动期间额外重复写回，失败后仅在源码仍脏时停进程并恢复。

最初尝试用首轮完整字节作为通用回滚基线，真实 Taro Vite React 验证推翻了这个假设：首轮的页面 config 没有 `usingComponents`，后续回滚合法加入 `comp: '../../comp'`，其他页面也有同样差异。源码与 marker 已恢复，逐字节判据却超时。对应失败和实际读取全文保存在 `.tmp/framework-isolation/watch-output-real/` 与 `.tmp/framework-isolation/taro-rollback-output-diagnostic/`。因此不删除框架字段或按长度放宽，而是回到可证明的契约：全部探针读取成功、非空、没有本轮 marker，允许合法元数据演进。

这些检查不提供生产者事务完成、非空截断产物完整性或跨额外编译的精确计时归属保证。相关问题需要明确的构建生命周期协议，不能以文件内容轮询或完成日志字符串代替完整证明。

修正后的测量及 GC 工作量回归共 9 项通过，报告回归 30 项通过。Node 22 的真实当前版本连续三轮增删验证已覆盖 Gulp、Taro Vite Vue、Taro Webpack React/Vue 与 weapp-vite 五个组合，全部成功、源码恢复；结果保存在 `.tmp/framework-isolation/watch-output-corrected/`。这些运行验证产物观察行为，期间存在其他定向构建，因此其耗时不用于性能预算。

主工作树安装正式 Mpx 补丁后，在 `9f7b3a82e` 上执行无 preload 的 Node 22 对照，Mpx、Uni、Taro Vite React 的基线与当前版本各 3 次构建和 3 轮 watch，全部完成且源码恢复。结合前述五组合，本轮八个小程序 watch 组合的连续增删行为均已验证。原预算初测仍失败：Mpx HMR peak/steady RSS 增加 20.91%/24.26%，Uni 增加 7.46%/8.07%，须按既有反向顺序协议确认；Taro 构建内存本机未复现 CI 退化，但中位耗时从 15.45s 增至 46.21s。测试期间宿主 load 从约 17 升至 76.89，已再次协调错峰；该环境变化不把失败改写为通过，也不证明全部退化来自环境。原始 matrix、命令、summary 与报告保存在 `.tmp/framework-isolation/node22-patched-framework-performance/`，继续分别定位。

Taro 随后的单轮阶段诊断中，基线/当前真实 context 为 2/1、engine 与原始生成均为 5 次，配置快照解析仅 4 次，没有观察到重复生成。当前十个释放步骤各执行一次，约 1ms 内 RSS 恒定、heapUsed 增加约 0.15MB；基线原先已有 owner 释放钩子，不能把关闭协调重构描述为首次释放。此次没有复现 CI 末尾内存脉冲。诊断会改变 GC 时机，且只测 macOS 主进程，不能据此否定 Linux 进程树预算失败。

`1c4ed4a2a` 的四平台生命周期、三浏览器语义和 Expo iOS CI 均成功；quality shard 1 的唯一失败在 Linux 容器复现为已终止后代的 zombie 记录，出生身份和端口仍能确认清理结果。测试与 fixture 收尾修复保留运行进程、监听端口和探针错误的失败行为，新增随机退出凭据防止误停复用端口；未改变生产终止器或超时。独立工作树 Node 22/24 各 78 项及 Linux 三次真实场景通过，详见 [Linux zombie 夹具复盘](linux-zombie-fixture-lifecycle.md)。同一 head 的 Lynx iOS 在 `simctl getenv` 超过原 30s 截止时失败，保留证据且不扩大预算；新 head 仍需各自 CI 结果。

### 错峰复验与配置快照分配

Node 22 的原协议反向顺序复测中，Mpx HMR 内存未再次越界，两项由违规转为观察；Uni 的两项仍被确认，不能记为通过。Uni 首测 peak/steady RSS 为 1113.27/1098.41→1196.33/1187.08MB，反向复测为 955.22/905.36→1110.00/1100.97MB。原始失败、反向结果和既有评估器报告保存在 `.tmp/framework-isolation/node22-patched-framework-performance/`。

七个协作任务明确确认错峰后，Taro Vite React 进行一次无探针、原参数的受控对照，基线与当前各三次构建、三轮 HMR；原预算零违规。构建时间与插件中位数变化为 -0.62%/-0.95%，构建 peak/steady RSS 为 -0.85%/+3.18%，HMR peak/steady 为 -0.52%/-0.53%。HMR 中位数仍约增加 9.5%，现有样本显著性规则没有构成违规，因此此结果不表示每项百分比均低于 5%。结果保存在 `.tmp/framework-isolation/node22-controlled-taro-performance/`，不能代替当前 head 的 Linux CI。采样与诊断结束后，已明确向七任务释放窗口。

Uni 的单次带计数诊断中，当前 context/runtime 为 1/2，基线为 2/3；两侧真实引擎均为 9 次，原始生成当前 11 次、基线 12 次，资产视图读取为零。后续各轮重复创建 54 个框架 CSS 上下文，其中 post 阶段 8 个、finalizer 46 个。同一轮生成配置和 escapeMap 没有变化，按文件重复复制属于可消除的分配；这不能单独解释之前的 RSS 违规。两侧 heapUsed 都会在 GC 后回落，第六轮约从 749/737MB 降到 317/312MB；这是未强制 GC 的已用堆，仍可能包含待回收垃圾，不能证明没有保留泄漏。探针影响 GC，不能用诊断 RSS 趋同否定两次无探针失败；日志中的 closeBundle 也只是每轮钩子，不能当作永久关闭释放证据。

`55d18e55f` 将两处 CSS 产物钩子的配置快照限制为本次调用内复用，文件请求只扩展自己的 file。等待任务前捕获配置，后续轮重新捕获；惰性资产仍读取该次 bundle，matcher 保留函数身份和闭包动态行为。持久 CSS handler 缓存未改，也未新增跨输出共享的 currentContext。六项回归在修复前全部失败，修复后作者五文件 48 项通过；主工作树执行 `pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/framework-css-context-lifetime.test.ts test/bundlers/framework-css-asset-demand.test.ts test/bundlers/vite-css-finalizer.unit.test.ts --update=none --maxWorkers=1`，三文件 36 项通过。回归验证局部配置和资产隔离，不声称整个构建状态可并行复用；RSS 仍需独立预算验收。

主工作树重新构建 ESM/CJS 和声明，通过 architecture:check、agents:check、修改文件 ESLint 与 diff check。七方再次明确就绪后，在 Node 22.22.3 对基线与 `55d18e55f` 各执行三次构建、三轮 HMR，不带计数或 inspector；原预算通过、零违规，不需要反向内存确认。构建中位数为 4362.54→4464.73ms（+2.34%），插件中位数为 1203→1221ms（+1.50%）；HMR peak RSS 为 1250.36→1104.86MB（-11.64%），steady 为 1143.66→1094.27MB（-4.32%）。HMR 插件中位数为 92→101ms，仍在原绝对差值/显著性规则内。命令、环境负载、原始矩阵和既有评估器报告保存在 `.tmp/framework-isolation/uni-round-snapshot-performance/`。此轮支持修改后的本地工作负载通过，不把前两次失败删除，也不将改善完全归因于某一种分配；新 head 的远端预算与完整设备验收仍需通过。

### CSS 上下文扩展的单向类型推断

预检 `108a7109-00a7-4b9f-8560-a693d6dc481a` 完成全部环境探针、当前会话真实输入、按钮交互和截图，并由完整 `--quality` 入口消费。根构建 71/71、0 缓存，全量单测 1032 文件 / 11059 项及 lint 通过；类型检查在五个 CSS 扩展调用失败，后续阶段未执行。TypeScript 6.0.3 将完整钩子返回期望通过 `Readonly<Extension>` 反向映射，错误地要求扩展对象重复提供基础上下文字段。

`860f2f89b` 在返回侧使用 `Readonly<NoInfer<Extension>>`，使扩展仅从实参推断；失去外层上下文推断的五处回调显式标注参数类型。属性描述符、getter、冻结、字段覆盖和可选性实现不变，没有增加 `any` 或调用方断言。新增类型用例由原 `tsconfig.typecheck.json` 执行，包含真实钩子调用、字段覆盖、可选字段、只读性和未标注回调的负向约束；在同一真实项目的编译器 host 中仅内存回退旧签名时出现 2345 与未消费期望 2578 两个诊断，修复签名为零，避免仅靠参数注解使回归失效。

主工作树执行根 `pnpm typecheck`（本轮另传 `--config.verifyDepsBeforeRun=false`）、三文件 36 项 CSS 整合回归，以及主包 ESM/CJS 和声明构建全部通过。作者另有五文件 48 项、修改文件 ESLint 与独立只读审查通过。`NoInfer` 只出现在独立内部 helper 声明，标准公开入口声明没有引用；本次没有运行时变化，不将此前性能结果改写为新测量。

### 完整 static 验收的 trace 基线遗漏

新预检 `bb511cbd-38d1-4a98-b3ec-8c10f6531231` 的七项探针、当前会话后台页面真实输入、按钮交互、截图与 verify 全通过，临时标签页已关闭。以 `860f2f89b` 从完整 `--quality` 入口重新执行，根构建 71/71、0 缓存、全量单测 1032 文件 / 11059 项、lint、类型、架构、文档、规则、release status、diff 和矩阵断言全部通过。单测另外保留五文件 / 44 项既有跳过及一项预期失败，不计作已验证。

static 跑完 401 个文件后停止：385 文件通过、15 文件跳过、一个文件失败；4207 项通过、38 项跳过、一项失败。唯一差异是 HBuilderX uni-app demo 的 `main.wxss` 中 72 处 trace 注释由 `/*tokens:` 改为 `/*! tokens:`。该 demo 显式开启 `cssSourceTrace`，保留标记在原基线的 PostCSS 生成实现中已经存在；本 PR 将 injector 资产放在生成与收尾之前后，这个 demo 的诊断基线尚未同步，原因与 [injector 输出顺序复盘](vite-injector-output-order.md) 相同。

限定命令 `E2E_SKIP_OPEN_AUTOMATOR=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-vue3-hbuilderx-tailwindcss-v4.test.ts -u` 重新生成该项目，再将 `-u` 换成 `--update=none` 复验通过；主工作树整合 `f5a469364` 后相同禁更新命令再次通过。环境为 macOS arm64、Node 24.18.0、HBuilderX stable 5.26.2026091802。只有一个基线文件变化，其余六个文件字节不变；机器全文比较与独立二审确认，归一注释后前后完全一致，SHA-256 为 `9814c28aa6b10de6d23d444100bf13b7fd1d6c055a1a1d02b862509ee98aa145`，选择器、声明、preflight 和顺序没有变化。已有真实 injector 产物、trace 幂等与保留注释回归继续保护生产行为，不新增镜像断言。

原始日志、进程身份与退出记录保存在 `.tmp/framework-isolation/local-acceptance/<run-id>/`。完整流程和预检已退出，确认本轮 consumer 与服务端口无残留，工作树干净；后续多平台产物、watch、IDE 和设备阶段未执行。基线修正后必须新建预检并从完整入口重新执行，不消费旧报告，也不将本轮大部分 static 通过写成全面验收成功。

### 视觉 HMR 调用方遗漏产物根目录

新预检 `299a3b42-e899-4c97-82b1-d62e2d642252` 的全部环境探针、当前会话真实输入、按钮交互、截图和 verify 通过，由 `4483ca737f9f0297b11a457ca2c6139a2fe97899` 的完整 `--quality` 入口消费。根构建 71/71（59 缓存）、全量单测 1032 文件 / 11059 项及全部质量检查通过；单测另有五文件 / 44 项既有跳过和一项预期失败。static 386 文件 / 4208 项通过，另有 15 文件 / 38 项条件跳过；矩阵 34 项及真实多平台构建 55 项通过。通用框架 IDE/HMR 的 12 项也通过，但不同用例的 `live`、`compile` 和产物可见性不能统一描述为逐框架视觉验证，Mpx 的 IDE 样式 HMR 仍保留既有跳过。

第 13/23 阶段的微信视觉 HMR 首败为 `TypeError [ERR_INVALID_ARG_TYPE]: The "paths[0]" argument must be of type string. Received undefined`。产物读取器新增必填的 `IdeWatchCase.miniprogramRoot` 后，视觉脚本四个调用仍传入普通 `WatchCase`；通用 IDE 调用方已迁移，而视觉调用方漏改。IDE 项目目录是项目配置所在位置，不必等于配置指定的小程序输出根目录，不能用前者或固定 `dist` 兜底。根 `pnpm typecheck` 不包含这两个脚本目录，其成功没有保护该调用边；独立 E2E 类型配置还存在无关历史错误，不能记为已通过。

保留首败后向本任务工作流发送一次协作 SIGINT，当前阶段沿取消标记恢复源码并退出，后续 14–23 阶段没有执行。consumer 状态为 `finished`，工作树干净，确认没有本任务微信服务租约和活动全面测试进程。原始日志、首败、取消退出和清理摘要保存在 `.tmp/framework-isolation/local-acceptance/299a3b42-e899-4c97-82b1-d62e2d642252/`，不能将已通过的前段写成全面成功；修复后必须新建预检并从完整入口重新执行。

`dc206b55e` 在 watch 输出与 warmup 就绪后，根据真实 `project.config.json` 解析 `{ projectPath, miniprogramRoot }`，四个产物调用共用这一份绑定；候选项目和祖先发现都校验实际运行时根覆盖当前输出，`srcMiniprogramRoot` 和项目目录不再作为兜底。启动路由同样从实际运行时根的 `app.json` 读取。新增回归通过真实 `runMiniProgramCase` 入口复现旧错误，IDE 与会话使用测试替身，但产物及样式依赖读取真实文件；覆盖连续两轮、缺失配置、越界产物、路径差异与失败清理。另用 TypeScript checker 检查三处真实消费者的全部产物调用参数，拒绝普通 `WatchCase`、`any` 和 `unknown`，不冒充整个 E2E 目录的类型检查。

作者定向执行 `e2e/demo-visual-artifact-root.test.ts`、`e2e/demo-visual-project-root.test.ts`、`e2e/framework-ide-artifact-contract.test.ts`、`e2e/demo-visual-theme.test.ts`、`e2e/demo-visual-live-evidence.test.ts`、`e2e/frameworkIdeHotUpdateArtifacts.test.ts` 和 `e2e/hbuilderx-local-styles.test.ts`，七文件 / 53 项通过；修改文件 ESLint、解析模块严格类型检查、diff 与独立二审通过。没有修改 demo 或 static 基线，也没有修改设备预算；主工作树整合后以相同七文件入口再次通过 53 项，修改文件 ESLint、`pnpm agents:check` 和解析模块定向严格类型检查通过（TypeScript 6 命令显式使用 `--ignoreConfig --types node`）。后续仍需新预检完整验收。

### 当前提交的远端性能与截图首败

`4483ca737f9f0297b11a457ca2c6139a2fe97899` 的五框架性能门禁全部在原预算下通过，`blocking=true`、0 违规；四平台生命周期及 CSS 三浏览器语义也通过。旧提交的 apt 安装取消没有在这一 head 复现。Uni 的单次 HMR P95 仍有 +21.04% 样本，但既有确认规则的后续两轮为 98/106ms，相对基线 107/113ms 没有确认退化；weapp-vite 的首测 HMR RSS 超阈值，反向顺序复验未确认。该结论只表示现有门禁通过，不表示每项指标均下降，也不覆盖尚未完成的本地设备验收。

Expo 的 run `40016346808` 首轮保留两个不同失败：iOS 在原 10 秒采集预算内未取得足够连续帧；Android 的第二帧只有 19 字节，原件精确为 `Segmentation fault `，logcat 同时记录 `/system/bin/screencap` 的 SIGSEGV，栈经过 graphics.mapper 与 ScreenshotClient，早于测试收尾和模拟器退出。Android 首帧几何、像素和 control 均通过，但连续帧数为一，不能据此算完整通过。现有截图校验正常阻断，没有证据支持修改产品、吞掉错误、扩大预算或降低连续帧要求；只允许在同 SHA、同参数下各进行一次定向复验，并保留首次产物。最终以最终 PR head 的全部适用检查及 reviewer 审批为准。


### 关闭后的转换服务引用

`f6e8c1e8ef8a569308e3d7b5a3002b426b74d0d2` 的 weapp-vite 性能在初测和反向确认中均违反原 HMR RSS 预算。peak/steady 首测分别增加 11.47%/9.93%（约 166/140MB），反向确认增加 18.55%/15.53%（约 251/209MB）。两轮没有产物错误，增量集中在工作 Node 的第二、三轮，不能以其他四框架通过或历史 head 通过覆盖本次失败。实际 weapp-vite 7.4.0 直接调用公开 Core，默认使用 stateful-experimental，不能用外部 Vite dispatcher 或 classic 诊断代表这条链路。

审计另发现确定的生命周期缺口：已关闭的 Core 如果仍由宿主持有，转换闭包仍引用整个 services 和局部 handler，继而保留 PostCSS 管线与缓存 AST。`a3699a6048c89b0214332f1e24f98555e1a522f5` 将 handler 改为可清空的实例槽位，在拒绝新任务、排空已接受任务及 root store 清理后释放；root 清理失败同样进入 finally。来源删除仍只清模板选项，不清活动 watch 的转换缓存。没有恢复跨实例可变 handler 共享，也没有修改公开 API。

持久回归使用真实 createStyleHandler，在子进程中保留 closed Core 和已完成 Promise 的强引用，跨事件循环显式 GC，验证 handler、services 和缓存 AST 可以释放；同时覆盖同配置双实例、活动缓存命中、在途任务排空、清理失败与重复关闭。修复前三个场景确定失败。整合至 `ba27c6e0ee4f55b43bdf5ce51fe93c92deb51409` 后，core-transform-retention、core-compiler-lifecycle、core-root-store-cleanup、profile-session-regressions 和 css-compat-workflow 五文件 29 项通过。该回归证明关闭引用释放，尚不证明它解释全部 RSS 增量；原性能预算仍须复验，不以诊断采样代替。

### CSS 语义 CI 的系统依赖安装超时

同一 `f6e8c1e8` 的 CSS compatibility semantics job `120658509643` 在 25 分钟截止后取消。Playwright 的在线系统依赖安装单步耗时 24 分 12 秒，APT 下载停在 libflite1；消费者、属性目录、三浏览器语义和 benchmark 均尚未开始，不能记为产品语义失败或通过。

`ba27c6e0ee4f55b43bdf5ce51fe93c92deb51409` 复用仓库已有的官方 Playwright 1.64.1 Noble 镜像及固定 digest，通过现有验证脚本检查 driver、镜像 marker、HOME 和三个浏览器的真实 PNG 渲染。保留原 25 分钟预算、Node 24 显式选择、全部语义/性能步骤和产物上传，只信任当前挂载工作区，进程工具缺失或身份查询失败仍阻断。CSS workflow 契约已包含在前述 29 项中；镜像 CI 与验证脚本另两文件 13 项通过。本机没有运行该固定 digest 容器，最终镜像闭包仍待新 head 的 CI，不以其他 job 的成功替代。

### 微信视觉修复的真实验收与旧轮收尾

预检 `0c50ae63-df18-4890-b962-be63d508cfdf` 的全部探针、当前会话 computer use 和 verify 通过，以 `f6e8c1e8ef8a569308e3d7b5a3002b426b74d0d2` 从完整 `--quality` 入口执行。根构建 71/71（59 缓存）、全量单测 1032 文件 / 11059 项、全部质量检查、矩阵 34 项、static 389 文件 / 4221 项、多平台真实构建 55 项及框架 IDE/HMR 12 项通过；单测另有既有五文件 / 44 项跳过与一项预期失败，static 另有 15 文件 / 38 项条件跳过。通用 IDE 证据仍区分 live、compile 和产物，Mpx IDE 样式 HMR 保留既有跳过。

第 13/23 阶段的真实微信视觉/HMR 报告为 11 组 passed，包括 uni-app-x 两种样式隔离和 HBuilderX 微信项目，已经实际越过旧 miniprogramRoot 首败。报告时间为 2026-10-23T21:58:20.363Z，156 个证据文件及 SHA-256 manifest 归档到 `.tmp/framework-isolation/local-acceptance/0c50ae63-df18-4890-b962-be63d508cfdf/visual-evidence/`。

为整合关闭释放和 CI 修复并让出正式性能对照资源，本任务在核实 workflow PID、启动身份和 cwd 后发送一次 SIGINT，流程恢复 fixture 并正常收尾。第 14 阶段中断，15–23 未执行，不能声称本轮完整设备验收通过。已核对 prepare 退出、consumer finished、工作树干净、无本任务活动测试进程或微信租约；没有终止 IDE/模拟器或改变登录态。原始日志、退出记录、收尾原因和清理摘要在同一归档目录。最终源码必须重新 prepare、真实交互、verify 并从完整入口重跑，不能复用这一报告。

## 适用边界

继续统一发布，包名、公开配置、导入路径和支持组合兼容。Rspack 复用 Webpack，Gulp 保留 native；目录隔离不增加支持组合。env 提供事实，engine 生成 Tailwind，postcss 转换 CSS，这些能力不复制到框架。只有独立依赖、维护负责人或发布周期出现实际需要时再考虑拆 npm 包。

本记录保持 `partial`，直到本轮多端预检与真实设备验收完成。定向单测、真实构建和 watch 通过不能替代完整验收。

## 规则评估

更新已有 compiler、generation 和 framework-policies 目录规则，明确中立输入、快照所有权和终止生命周期；Architecture 工作流显式执行新增门禁回归。优先使用持久反例和唯一归属登记封闭绕过，不新增宽泛目录豁免。
