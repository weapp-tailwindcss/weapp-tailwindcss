---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1271
baseline: cb407cab3d3633d13d1d2de1ac660464bb6e0752
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/web-preflight-reset.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/border-preflight.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-css-emission.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-watch-css-output.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-auto-rpx-calc.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-refresh.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-invalidation.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-import-shell-rebuild.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-root-style-ownership.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-source-output-relations.unit.test.ts
  - e2e/issue-1214-rpx-calc.test.ts
  - e2e/issue-1214-rpx-calc-watch.test.ts
  - e2e/issue-1214-author-css-watch.test.ts
  - e2e/issue-1214-layout-static.test.ts
  - e2e/issue-1144-alpha.test.ts
---

# 四个 Issue 的根因修复验证（2026-10-09）

本轮不能认定四项均已根本修复。npm 5.6.0 与固定主线的生产边框及缓存升级、rpx 构建适配、当前 HBuilderX Web 更新、模块刷新热点都有正面证据；生产 watch 另发现失败，微信原生验收阻塞，19 页工程 Android 编译阻塞，#1208 的历史失败对照未在当前编译器重现。

| 问题 | npm 5.6.0 | 主线 cb407cab3 | 本轮结论边界 |
| --- | --- | --- | --- |
| [#1271](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1271) 生产边框 | 部分修复 | 部分修复 | 原始生产边框及旧缓存升级已验证修复；连续生产 watch 的 manifest／作者样式引用失败 |
| [#1214](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1214) rpx calc | 部分修复 | 部分修复 | 默认静态计算、显式配置、覆盖与 watch 通过；微信原生矩形采集环境阻塞 |
| [#1208](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1208) Web HMR | 部分修复 | 部分修复 | Alpha 5.31 两模式连续更新通过；旧 5.5.2 同样通过，缺少本轮原始失败对照 |
| [#1245](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1245) 性能 | 部分修复 | 部分修复 | 108／216 模块热点显著改善；业务工程的微信／Android 整体耗时未取得有效样本 |
| #1245 微信导入循环 | 环境阻塞 | 环境阻塞 | 主线源码序列回归通过；真实微信 12 轮 watch 及 5.5.10 失败对照未执行 |

## 症状

历史缺陷版本分别固定为 #1271 的 5.5.11／5.5.12、#1214 的 5.5.6、#1208 的 5.5.2、#1245 性能的 5.5.7，以及导入循环的 5.5.10。四个 Issue 的最新正文和评论已只读保存，仍为开放状态；本轮没有评论或关闭操作。

主线 SHA 为 `cb407cab3d3633d13d1d2de1ac660464bb6e0752`，独立分支为 `codex/four-issues-verification`。5.5.7 源码基准为 tag 对应的 `02ed18b4549a3514e8956f086cf360bcdb3bf3ff`，位于另一个独立 worktree。源码构建成功后，主插件及 workspace 间接依赖全部打包成 tarball，通过临时项目 overrides 消费；包自身版本仍为 5.6.0，所以不能仅看 package.json 的版本区分 npm 与主线。

npm 项目直接安装固定版本。锁文件、真实解析路径、registry integrity、本地 tarball 和其 SHA-256 均保留。5.6.0 registry integrity 为 `sha512-gipwb9STTl875N0Lz7YCEPXC02bDNm9gTMSueE3oyFaAvsctkIIbpPHs3jiQv3XSETPFQpw7RKIhvoCadebjww==`。#1214／#1208 的发布包验证临时覆盖 fixture 的插件链接，日志核对实际 npm 路径；结束后恢复源码及依赖链接。

| 链路 | 固定环境 |
| --- | --- |
| 通用 | macOS 27.0.1 arm64、Node 24.18.0、pnpm 12.9.1、Tailwind CSS 4.3.3、Vitest 5.0.3 |
| #1271 npm 消费项目 | uni 编译器 5.22 VDOM；`@dcloudio/vite-plugin-uni@3.0.0-alpha-5020220260725001`、Vite 5.4.21、Vue 3.5.43 |
| #1214 static／watch | `@dcloudio/vite-plugin-uni@3.0.0-5020620260917001`、Vite 5.2.8、Vue 3.5.43；生成真实 WXSS |
| #1208 实际 Web | HBuilderX Alpha `5.31.2026093020-alpha`；Options／setup，默认及显式局部样式配置 |
| Web 计量 | headless Chromium 153.0.8010.12；同一缓存升级 context；原生 Chrome 另有本轮交互截图 |
| Android 尝试 | HBuilderX Alpha 5.31、Pixel 5／API 30／arm64、emulator-5554；原工程 Vapor／bytecode 配置 |
| 微信 | 已有 IDE 服务的 `isLogin` 探针不可用或超时；不启动、重启或改动登录态 |

原生 Chrome 已安装版本为 155.0.8059.39；这项文件版本读取不等同于对运行中浏览器内核的单独测量。设备、编译器及消费路径详情以证据 JSON／日志为准。

## 根因与纠正

**#1271。** 框架的 `border-width: medium` 在生产合并后排到 reset 后面；5.5.12 修正了最终顺序，但仍出现“同 URL、不同 CSS 内容”，immutable 缓存用户继续使用旧内容。修复涉及 `24c107d88` 的 reset 顺序及 `1eec6f3b3` 的资源身份修正。

[framework-css-emission.ts](../../../packages/weapp-tailwindcss/src/bundlers/vite/shared/framework-css-emission.ts) 在 Vite `css-post`／`uni:h5-css` 的 `emitFile` 前最终化 CSS，让 bundler 生成引用；最终阶段还对框架资产的最终内容重新计算身份，并同步 HTML、chunk、CSS metadata 等 bundle 引用。不能把修复简化为追加一条 border 规则。

本轮生产 watch 的新增失败另行保留：Options 第二轮 manifest 指向不存在的 `uni-app.es.*.js`；setup 第三轮在 `adaptor:post` 报 `Can't resolve '../../main.css' in '<project-root>'`。后者说明相对 reference 被按工程根解析，而它原属于 `pages/index/index.uvue`。普通 style transform 已有 [相对 reference 规范化](../../../packages/weapp-tailwindcss/src/uni-app-x/vite/style-request.ts)，下一步责任边界是生成器 source base、作者样式与增量缓存／回放；本轮尚未证实究竟哪个阶段丢失了来源身份，未据此修改产品。

**#1214。** 旧版把小单位保留为 `calc(var(--spacing) * N)`，微信原生计算的中间量化会使结果与直接最终 rpx 不同。当前 [auto-calc.ts](../../../packages/postcss/src/plugins/auto-calc.ts) 和 [css-calc.ts](../../../packages/weapp-tailwindcss/src/bundlers/vite/css-finalizer/css-calc.ts) 在静态上下文里计算最终长度；来源图中的作者覆盖参与判断，动态变量和显式退出不应被静态折叠。它修正构建输出，没有改变微信原生 calc 算法。

**#1208。** 原修复针对 SFC 原描述符、追加生成 style 块、style 子请求及缓存事务不一致。[web-sfc-hmr.ts](../../../packages/weapp-tailwindcss/src/uni-app-x/vite/web-sfc-hmr.ts) 在完整 SFC transform 阶段保持同一来源事务，[style-source.ts](../../../packages/weapp-tailwindcss/src/uni-app-x/vite/style-source.ts) 管理实际生成块索引及删除后的空 CSS。部分 important 更新会触发 full reload，不能把样式正确解读为每轮页面状态均由纯 HMR 保持。

**#1245 性能。** 旧实现每个模块强制刷新 runtime，重复扫描及提取；当前 [runtime-class-set](../../../packages/weapp-tailwindcss/src/bundlers/vite/runtime-class-set/cache.ts) 将失效登记与求值分离，同 revision 合并刷新，串行准备，过期任务不回写。真实 Tailwind 回归覆盖主题、候选删除恢复及异步失效；模块基准验证减少重复工作后的输出一致性。

**#1245 导入循环。** 增量 bundle 省略根资产后，其他资产抢占同一入口；纯导入壳被当成目标内容回放，或旧删除通知清除已重新登记的归属，可能形成 `uvue.wxss → main.wxss → uvue.wxss`。当前归属及导入壳序列回归验证了这些责任边界。本轮真实微信未就绪，不以旧复盘中的 IDE 截图替代新一轮验收。

## 验证

### #1271：生产、缓存与 watch

共完成 8 个基本生产构建和 12 个拆分／压缩变体构建，均在独立消费项目以 pnpm 执行其 `build:h5` 脚本，实际命令和 cwd 记录在 `commands.jsonl`。浏览器覆盖首载、普通分包、独立分包、返回与刷新。5.6.0／主线的新产物默认边框为 0px，显式边框分别为 1px、2px、0px，无页面错误或失败资源请求。该临时 CLI 工程有非阻断的 UTS 类型及 tsconfig 诊断，构建退出码为 0；不把产物运行通过解读为 UTS 类型检查无错误。

| 部署 | Options／setup 首载 | 同 context 从旧版升级 |
| --- | --- | --- |
| 5.5.11 | 默认 3px，重现原始缺陷 | 3px |
| 5.5.12 | 新 context 为 0px | 仍为 3px，重现内容 hash 缺陷 |
| 5.6.0 | 0px | 0px，请求新的 CSS URL |
| 主线本地包 | 0px | 0px；与 5.6.0 内容一致的资源正常复用 |

服务器为 HTML `no-store`、资源一年 `immutable`。Options 主 CSS 从旧 `index-KJPpqkfZ.css` 变为 `index-e480815e.css`，setup 从 `index-BoDQg1IW.css` 变为 `index-bf63cd5c.css`。全 assets 对账发现 5.5.11 → 5.5.12 各有一个同名异内容 CSS；5.5.12 → 5.6.0 及 5.6.0 → 主线均无同名异内容资源。所有变体的生产 manifest file/css/assets 引用存在。

reset 数量以 AST 中只有 `border-width:0` 的框架节点规则计数，区分全局和 scoped；不能只数注释 marker。

| 5.6.0／主线配置，两模式相同 | 单个 CSS 入口 | 全生产包全局／scoped／合计 |
| --- | --- | --- |
| 默认拆分、压缩 | 根入口全局 1；两分包各全局 1 + scoped 1 | 3／2／5 |
| 不拆分、压缩 | 合并入口全局 1 + scoped 2 | 1／2／3 |
| 不拆分、不压缩 | 合并入口全局 1 + scoped 2 | 1／2／3 |
| 拆分、不压缩 | 根入口全局 1；两分包各 scoped 1 | 1／2／3 |

不拆分压缩的注释 marker 数为 0，语义 reset 为 3 条，运行时通过。不同 scoped 选择器与全局规则分开报告，不能将整包计数冒充单入口重复数量。

连续生产 watch 使用 `build.watch: {}`，每模式同一 pnpm 服务进程，计划五轮背景新增／替换／删除／恢复，刷新检查本轮 marker、0／1／2／0 边框、背景、hash 和 manifest。用 `writeBundle` 只打印完成回执，未改写输出目录。

| 版本／模式 | 已完整记录轮数 | 首次未通过位置 |
| --- | ---: | --- |
| 主线 Options | 1 | 第二轮 marker／计算样式已更新，但 manifest 引用 `uni-app.es.Cao3jqGI.js` 不存在 |
| 5.6.0 Options | 1 | 第二轮 marker／计算样式已更新，但 manifest 引用 `uni-app.es.DuSIhOAu.js` 不存在 |
| 主线 setup | 2 | 第三轮作者 `../../main.css` reference 按工程根解析失败 |
| 5.6.0 setup | 2 | 同上 |

另把 npm 5.6.0 的 reference 失败缩减到单页、App、main.uts、main.css 和标准 Vite 配置；Options 两轮完整记录后，第三轮同样失败，保留源码、锁、日志和截图。未通过轮次不计为通过，也未继续修改断言跑完余下轮次。

诊断记录分开保留：最初误用 `dist/build/h5` 检查 CLI `--watch`；实际 CLI 会强制 development 并输出 `dist/dev/h5`。开发态 Options 也有 reference 失败，setup 首载空白未取得探针。第一次生产 watch 错等 CLI 完成日志导致假超时，产物其实已更新；采用 bundler 完成回执后的结果才用于上表。最小工程首次缺 main.uts，补齐后 Options 得到有效失败对照；空 setup 最小工程未通过初始化，不作为完整 setup 的结论证据。

原生 Chrome 使用现有浏览器新建的本任务标签，访问发布版 Options、独立分包、主线 setup 并刷新，保存本轮截图及 HTTP 请求记录。精确计算样式来自 headless 测量；截图提供真实交互证据，不能代替数值断言。

### #1214：真实 WXSS 与增量

主线 5 文件 37 项通过，其中 16 项为布局判定逻辑测试；npm 5.6.0 的 4 文件 21 项通过，包含 18 个 static case、主题 watch、作者覆盖 watch 和尺寸页 static。全部正常运行使用 `CI=1`、`--update=none`。

覆盖默认 1／2／3／8rpx、小数和负值、inline、显式顶层及嵌套 cssCalc、alias、动态值、关闭选项和作者覆盖。尺寸页在 8rpx 主题下输出 `.w-32/.h-32:256rpx`、`.p-4/.gap-4:32rpx`、`.-mt-4:-32rpx`；watch 主题变化、候选删除恢复及覆盖新增移除通过。

5.5.6 定向运行默认 case 失败，`.w-32` 仍为 `calc(var(--spacing)*32)`，不满足最终静态 rpx；其余 17 项因 `-t` 过滤而跳过，不能解读为新版跳过。微信中的工具类／直接 rpx 原生矩形未采集，IDE 用例未执行；动态 calc 的原生限制仍保留。

### #1208：HBuilderX 实际 Web

分别运行主线、npm 5.6.0、npm 5.5.2；再分别以 `componentLocalStyles.enabled=true`、`onlyWhenStyleIsolationVersion2=false`、`cssSourceTrace=true` 重复对应配置核对。各版本每配置均执行 Options／setup，每模式同一服务进程 16 轮保存和两次刷新，marker、class、生成 CSS 与计算样式通过，无页面、样式请求或编译错误，无需 touch CSS／重启服务。

显式局部样式配置的 server.log 记录编译进程真实加载的包路径与版本，全部会话保存逐轮 PNG／JSON／CSS、identity、请求与 server.log。当前 Alpha 链路未出现前轮评论中的连接超时。

**历史对照没有重现。** 5.5.2 在本轮 Alpha 5.31 上也全部通过；原 Issue 评论的失败环境为 HBuilderX 5.24／VDOM／样式隔离 2.0，原最小仓库未提供。本轮证明当前环境行为正常，尚未区分编译器变化、fixture 差异或旧包间接依赖的影响，因此不能宣称原场景根因验证已闭环。

### #1245：热点与业务工程分别评价

发布包／本地 tarball 基准通过 public Vite hooks、真实 Tailwind 4.3.3 转换人工 108／216 模块，固定 `UNI_PLATFORM=mp-weixin`，关闭局部样式和来源追踪以隔离 runtime 热点。顺序运行，每规模预热 1 次、采样 3 次取中位数，完整样本包含预热并标 run 0。

| 版本 | 108 模块中位数 ms | 216 模块中位数 ms | 累计进程峰值 RSS KiB |
| --- | ---: | ---: | ---: |
| npm 5.5.7 | 2759.24 | 9104.86 | 538240 |
| npm 5.6.0 | 139.33 | 274.66 | 339760 |
| 主线本地包 | 134.81 | 256.71 | 339696 |

5.6.0 对照降幅分别约 95.0% 和 97.0%；这是模块转换热点，不是 HBuilderX 全工程 ready 或插件完整生命周期耗时。三版本所有有效样本的输出 hash 一致：108 为 `1cd8de249c2af7021c93e26617daf4fdd46af0a339d23319bb2ecb1a509d0179`，216 为 `5595b48101b927251706ac99024eefa18f207455ae3d8a82797e0d03dc01d945`。

独立源码 manager 基准另外测得 5.5.7 → 主线：108 模块 `3688.19 → 105.08ms`、refresh／extract `109 → 1`；216 模块 `9345.91 → 221.00ms`、`217 → 1`，各规模输出 hash 一致。该基准默认还运行 12／54 模块，累计进程峰值 RSS 为 `645040 → 388384KiB`。两种基准输入／计量边界不同，不混表同比；先前并行样本和未指定平台的诊断样本保留但不用于最终比较。

业务工程独立复制自 unibestX SHA `4dd420d69a08e7026becf92fc0cd19c6aacda6b2`，968 个 tracked 文件、5 个主包及 14 个分包页面，保留原插件顺序、样式隔离 2.0 和 Vapor 配置，仅固定插件版本及 Tailwind 4.3.3。没有改原工程的凭据、依赖配置或样式选项来绕过失败。

5.5.7、5.6.0、主线的 Android 第一次编译均在 `[plugin:uts] Could not resolve "@vue/devtools-api"`、`node_modules/pinia/dist/pinia.mjs:1:0` 失败，未到 ready；每版记录一次失败，耗时为 null。首次无效 `--runtimeLog` CLI 参数诊断另存，后续使用支持的 compile 入口。未重复执行无法成立的三组 first／second，未取得有效整体或插件耗时样本。

微信没有已开启且可安全连接的 IDE，未执行三组编译、同一 watch 进程 12 轮 WXSS 图及原生运行，也未运行 5.5.10 的真实失败对照。导入循环仅有主线持久序列回归，不能标为发布包真实微信通过。**原始 108 页业务工程尚未验证。**

### 源码回归及命令记录

规划阶段 38 项 reset／border／hash 通过只作前置记录。本轮最初主线 11 文件 111 项通过；交付前补齐完整命令回执，明确运行 CSS emission、watch output、runtime refresh／invalidation、导入壳／归属、来源关系、两个 style-request 文件及 auto-rpx，共 11 文件 119 项通过。两组有大量重叠，不相加计数。

主线构建日志为 `build-main.log`，完整定向单测 argv 和结果为 `commands.jsonl`、`main-targeted-command-receipt.log`。主要持久 E2E 复验入口为：

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-rpx-calc.test.ts e2e/issue-1214-rpx-calc-watch.test.ts e2e/issue-1214-author-css-watch.test.ts e2e/issue-1214-layout-static.test.ts --update=none
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-alpha.test.ts --update=none
TSX_TSCONFIG_PATH=packages/weapp-tailwindcss/tsconfig.json pnpm exec node --import tsx packages/weapp-tailwindcss/benchmark/uni-app-x-runtime.mts
```

发布包替换步骤、平台环境、consumer 安装及本地包 overrides 由本轮 harness 和锁文件记录，不能把上述普通 workspace 命令单独当作发布包验证。没有新增持久 demo／输出回归用例，也没有更新 static 基线；已有 #1214 static 基线不更新通过，临时生产变体和失败产物独立归档。

## 适用边界

本轮是四 Issue 的定向验证，没有运行全面测试或宣称全端预检通过。Windows、真机、Skyline、iOS、Harmony、原始 108 页工程及旧 HBuilderX 5.24 均不在已验证范围。

原始证据位于原 checkout 的忽略目录 `e2e/.artifacts/four-issues-20261009-CTgVwf/`，中文 `index.md` 是导航，`summary.json` 是机器可读结论，`artifact-sha256.json` 是文件校验清单；12 个本轮 HBuilderX 会话已归档到 `1208-runtime/`。保留 npm／主线身份、锁、tarball、production hash、请求、逐轮样式及截图、失败最小工程和所有诊断日志。报告中的本地路径由 `metadata.json`、`final-environment-identity.json` 提供；核心命令和关键错误已在本文保留，避免结论只依赖本机大日志。

证据索引重点文件：`1271-cache-report.json`、`1271-immutable-identities.json`、`1271-reset-semantic-counts.json`、`1271-watch-production-receipt-report.json`、`1271-watch-minimal-ready-report.json`、`1214-published-5.6.0.log`、`1214-published-5.5.6.log`、`1208-evidence-map.json`、`1245-dist-benchmark-*.json`、`1245-android-results-*.json`。

## 规则评估

不新增 AGENTS 规则。现有构建图身份、来源缓存、真实运行证据、失败对照及会话保护规则足以约束本轮；后续应先把新增生产 watch 失败转成持久回归，再决定负责模块的根因修复。

本轮只新增中文报告及忽略目录中的证据，不改产品代码、公开 API、发布版本、Issue 或 static 基线，不提交或推送。结束关闭本任务创建的原生 Chrome 标签、headless context／browser、HTTP 服务、watch／编译进程及 Android 模拟器／本任务 Studio；用户原浏览器页面和 HBuilderX 保留。独立 worktree 与临时失败工程保留供复验。工作树状态、进程核对及 `pnpm agents:check`／`git diff --check` 结果见证据索引。
