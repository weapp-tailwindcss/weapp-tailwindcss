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
  - packages/weapp-tailwindcss/test/bundlers/webpack-operation-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-loader-session.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-extension.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-runtime-facts.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-cache-inputs.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-asset-demand.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-bundle-asset-demand.test.ts
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

## 适用边界

继续统一发布，包名、公开配置、导入路径和支持组合兼容。Rspack 复用 Webpack，Gulp 保留 native；目录隔离不增加支持组合。env 提供事实，engine 生成 Tailwind，postcss 转换 CSS，这些能力不复制到框架。只有独立依赖、维护负责人或发布周期出现实际需要时再考虑拆 npm 包。

本记录保持 `partial`，直到本轮多端预检与真实设备验收完成。定向单测、真实构建和 watch 通过不能替代完整验收。

## 规则评估

更新已有 compiler、generation 和 framework-policies 目录规则，明确中立输入、快照所有权和终止生命周期；Architecture 工作流显式执行新增门禁回归。优先使用持久反例和唯一归属登记封闭绕过，不新增宽泛目录豁免。
