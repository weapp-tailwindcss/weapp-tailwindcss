---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1340
baseline: f276d5805990e0734e62147ab1eebf5a54b3ea40
regressions:
  - packages/weapp-tailwindcss/test/compiler/compilation-session-pool.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-stage.test.ts
  - e2e/issue-1340-static.test.ts
  - e2e/project-build-hbuilderx-cleanup.test.ts
verification:
  - claim: 正式版 5.7.3 在 302 个独立并发 scope 下仍有 46 项意外未提交
    kind: integration
    status: failed
    sha: f276d5805990e0734e62147ab1eebf5a54b3ea40
    environment: macOS arm64、Node 24.22.1、pnpm 12.18.0；独立安装官方 npm 包，无 workspace alias
    command: node e2e/.artifacts/issue-1340/pool-stress.mjs release main negative
    reason: 302 项中只有 256 项提交；满池重入在释放无关 scope 之前不能完成
  - claim: 固定 main 的独立打包消费者通过并发、重入、LRU、失效和 dispose 压力检查
    kind: integration
    status: passed
    sha: f276d5805990e0734e62147ab1eebf5a54b3ea40
    environment: macOS arm64、Node 24.22.1、pnpm 12.18.0；主包和仓库内传递依赖共 21 个包由本基线 tarball 安装
    command: node e2e/.artifacts/issue-1340/pool-stress.mjs release main negative
  - claim: HBuilderX 静态日志支持单独 CR 进度与紧邻的成功或失败终态
    kind: unit
    status: passed
    sha: f276d5805990e0734e62147ab1eebf5a54b3ea40
    environment: macOS arm64、Node 24.22.1、pnpm 12.18.0；基线上包含本任务日志解析修改
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/project-build-hbuilderx-cleanup.test.ts --update=none
  - claim: 正式版与 main 的完整跨端、两种样式隔离和四步 HMR 验收
    kind: native
    status: pending
    sha: f276d5805990e0734e62147ab1eebf5a54b3ea40
    environment: HBuilderX stable 5.34.2026102909、Android API 35、iOS 26.5、Harmony 6.1.1.125
    reason: 完整矩阵尚未完成；本轮原生结果、环境阻塞与证据限制见正文，不以静态或编译结果代替页面验收
---

# Issue #1340 正式版与 main 跨端验收

## 症状

2026-11-11 的独立消费者压力对照证明，官方 npm **5.7.3 尚未彻底修复**：302 个并发 scope 中 46 项没有提交；满池重入也需要无关 scope 先释放。固定 main `f276d5805990e0734e62147ab1eebf5a54b3ea40` 通过同一压力场景，完成后池回到 128。

不能宣称“其他平台都没有问题”。独立安装的 uni 消费者另有可复现的传递依赖解析失败；原生页面、两种隔离配置和四步 HMR 尚缺完整证据。以下严格区分池生命周期、构建产物、IDE 页面和设备运行。

## 根因与纠正

5.7.3 的满池等待机制仅在较小压力下避免旧版淘汰活跃 scope 的问题，302 项和重入场景仍失败。固定 main 改为保护活跃 execution、允许临时超限，在结算后回收空闲条目；原生 @apply 缺少有效生成结果的失败保护也已在基线中。本轮验证这些边界，不额外修改产品实现。另一项 uni 传递依赖解析问题独立记录，尚未实施修复。

工作树为 `codex/issue-1340-cross-platform`，产品源码固定在上述提交。本任务仅修改规则、验收手册和 HBuilderX 测试适配器，不修改会话池、公开 API、demo 或快照。桌面 Chaser 只作为复制来源；原工作区两项 submodule 改动未动。

消费者根目录记录于 `e2e/.artifacts/issue-1340/consumer-roots.json`，其物理目录在系统临时目录的 `wt-issue-1340-consumers-kys__f69`。release、negative、main、chaser-release、chaser-main、frameworks-release、frameworks-main 各自冻结安装依赖，没有借用其他 worktree 的可写 node_modules。main 的 21 个本地 tarball 覆盖传递包；正式版不使用 workspace alias。每项记录实际包路径和 compiler bundle hash。

| 对象 | 版本 / SHA-256 |
| --- | --- |
| npm 正式包 | 5.7.3；tarball `cce75acf1a1a1f3d6e95f509aa4dd61f4be7f3506e4050ac44f9057f6751e3db` |
| main 打包主包 | manifest 也为 5.7.3；tarball `41bfb52bc81641e05a8dcea8ba9d9b7be9335fd8a4679773b4c0784e90c52a30` |
| 正式版实际 compiler | `compiler-DkmTo-fs.js`；`6a4f9676d2bbffdd55be285ef94968f650b2772417a971c3270bd8add027223b` |
| main 实际 compiler | `compiler-B8I0DeyP.js`；`2b9a6d54e678d66d443a23a2e2b087a68b29cd725f4ac1812468e469da19f3cc` |
| Node / pnpm | 24.22.1 / 12.18.0 |
| HBuilderX / uni CLI | stable 5.34.2026102909 / 5.34.2026102910.4125 |
| 微信 IDE | 2.02.2609250；原 HTTP 服务 19355 |
| Xcode / iOS 目标 | 27.2 / iPhone 17 Pro、iOS 26.5 |
| Android / Harmony | API 35 google_apis arm64-v8a / OpenHarmony 6.1.1.125 |
| 浏览器 | Chrome 157.0.8103.39；Playwright Chromium 158.0.8127.18 |
| 普通 uni CLI / Vite | 3.0.0-5030320261023001 / 5.2.8 |
| Taro / Vite / Webpack | 4.3.1 / 4.5.14 / 5.91.0 |
| Mpx / Webpack | 2.11.1 / 5.112.2 |
| Weapp Vite / Gulp | 7.8.0 / 5.0.1 |
| Tailwind | 池消费者及 Chaser 日志 4.3.3；独立框架消费者实际 4.3.5 |

原始摘要见 `official-tarball-audit.json`、`official-5.7.3-dist.json`、`chaser-package-identities.json`、`release-frameworks-preparation.json`、`main-frameworks-preparation.json`；main 全部包摘要在消费者 `main-tarballs/sha256.json`。同名 5.7.3 不能当作同一实现。

## 验证

脚本直接加载真实包内已导出的 pool，不替换实现。为不同 scope 提交同样的有效生成结果，在等待全部任务结算前统一释放生成器；没有调用显式失效或 dispose 撤销正常提交。

| 场景 | 5.7.2 负对照 | npm 5.7.3 | 固定 main |
| --- | --- | --- | --- |
| 129 个并发 scope | 128 提交，丢失 1 | 129 全部提交，峰值 128 | 129 全部提交，峰值 129 |
| 151 page + 151 component | 128 提交，丢失 174 | 256 提交，丢失 46 | 302 全部提交，峰值 302 |
| 128 活跃 scope 内重入 | 嵌套完成，外层仅 127 提交 | 1500ms 内不完成；释放无关 scope 后才完成 | 嵌套和外层 128 项均完成 |
| 空闲 LRU | 通过 | 通过 | 通过 |
| 显式失效 / dispose | 按预期撤销提交 | 按预期撤销提交 | 按预期撤销提交 |
| 任务排空后的池大小 | 128 | 128 | 128 |

证据：`e2e/.artifacts/issue-1340/{release,main,negative}-pool-stress.json` 和 `pool-stress.log`。302 项属于 pool 生命周期压力，并不是 302 个真实 Android 字节码模板。`e2e/issue-1340-static.test.ts` 使用真实 Tailwind CSS 生成，但其 Vapor 模板边界是模拟的，同样不能当作设备证据。

可携带的最小复现在 `e2e/.artifacts/issue-1340/minimal-repro/`，附 lockfile、源码和 README：

```sh
pnpm install --frozen-lockfile
pnpm exec node reproduce.mjs
```

官方 5.7.3 的该复现实际返回非零，输出 `committed: 256`、`unexpectedUncommitted: 46`。完整对照入口为 `node e2e/.artifacts/issue-1340/pool-stress.mjs release main negative`，需要保留 consumer-roots.json 指向的消费者。

## 版本 × 框架 × 平台 × 模式

表中的“构建通过”只表示所述命令及样式断言成功；“观测通过”保留真实执行结果，但对应工作流有 computer-use 元数据缺陷，不能升级为形式完整的全面验收。设备运行必须另有本轮截图、结构和更新证据。

| 版本 / 来源 | 框架 | 平台 | 渲染模式 / 范围 | 结果与限制 |
| --- | --- | --- | --- | --- |
| npm 5.7.3 | Gulp | 微信、抖音 | 原生小程序构建 | 构建与选定样式声明通过；无设备页面验收 |
| npm 5.7.3 | Mpx | 微信、支付宝、百度、抖音、钉钉 | 框架默认模式 | 构建与样式冒烟通过 |
| npm 5.7.3 | Weapp Vite | 微信 | 原生小程序 | 构建与样式冒烟通过 |
| npm 5.7.3 | Taro Vite React | 微信、支付宝、百度、抖音、QQ、京东 | 框架默认模式 | 构建与样式冒烟通过 |
| npm 5.7.3 | Taro Webpack React | 微信、支付宝、百度、抖音、QQ、京东 | 框架默认模式 | 构建与样式冒烟通过 |
| npm 5.7.3 | Taro Vite / Webpack React | H5 | Web | 真实 H5 命令构建通过，有 CSS 输出；未做本轮页面/HMR |
| npm 5.7.3 | 普通 uni Vite | 微信、支付宝、百度、京东、快手、飞书、QQ、抖音、小红书 | 小程序默认模式 | 独立安装构建失败，escape 传递依赖解析错误 |
| npm 5.7.3 | 普通 uni Vite | H5、SSR | Web | 对齐 Vue Router 4.6.4/cross-env 10.1.0 后仍失败；escape / runtime 解析错误 |
| npm 5.7.3 | 普通 uni Vite | quickapp-webview、Huawei、Union | 快应用 | 构建遇到传递依赖解析失败 |
| npm 5.7.3 | 普通 uni HBuilderX demo | 微信 | CLI 静态构建 | 构建及样式冒烟通过；不是 HBuilderX 设备运行 |
| main workspace | 全部现有 static 用例 | 静态 | 含 151+151 模拟 scope | 449 文件 / 4940 测试通过，18 文件 / 47 测试按配置跳过；不是设备验收 |
| main workspace | 默认多端构建矩阵 | 小程序、H5、SSR、快应用 | 55 项既有输出测试 | 55/55 观测通过；不等于独立 tarball 消费者通过 |
| main workspace | Gulp、Taro Vite React/Vue3、Taro Webpack Vue3、普通 uni Vite | 微信 IDE | 框架默认模式 | 页面模板和脚本更新观测通过；样式更新有产物检查，未覆盖本计划完整四步 |
| main workspace | Mpx | 微信 IDE | 自定义 tab bar | 观测通过；case 配置跳过 IDE 样式 HMR，不能记为完整通过 |
| main workspace | Taro Webpack React、普通 uni HBuilderX、uni-app x | 微信 IDE | x 为 VDOM | case 使用宽松可见性 / 产物更新，不能记为真实页面 HMR 通过 |
| main workspace | Weapp Vite | 微信 IDE | 原生小程序 | DevTools App.getCurrentPage readiness 超时；不是 CSS 断言失败；剩余工作流停止 |
| main 独立包 | uni 依赖解析最小对照 | Vite / Web | preserveSymlinks true/false | true 失败、false 通过；main 也存在此消费边界问题 |
| main 独立包 | 其他框架完整矩阵 | Web、小程序 | 框架默认模式 | 21 个 tarball 覆盖并冻结安装成功；尚未重新执行全部构建 |
| npm 5.7.3 / main | uni-app x 151+151 复现 | Android | Vapor | 本轮没有完成 302 真实模板与样式逐项审计，不使用历史三轮记录替代 |
| npm 5.7.3 / main | 普通 uni-app | Android、iOS、Harmony | 工具链支持的模式 | 本轮安装、页面、结构、截图、更新缺证 |
| npm 5.7.3 / main | uni-app x | Web、微信、Android、iOS、Harmony | 支持的 VDOM / Vapor，两种隔离配置 | 完整交叉组合未验收；未支持的组合未擅自认定为支持 |
| npm 5.7.3 / main | Taro RN / harmony-hybrid 占位脚本 | RN、Harmony hybrid | 无实际构建 | 不支持本轮验收；process.exit(0) 不能计为构建成功 |

正式版框架命令与实际包身份逐项记录在 `release-frameworks-initial-results.json`、`release-frameworks-taro-gulp-results.json`、`release-frameworks-uni-h5-parity-results.json`。首次 Gulp 微信误用不存在的 build:weapp，已改用 pnpm build 复验；初选的 Taro H5/RN/Harmony hybrid 中存在空脚本，已剔除其结果，并用真实 Taro H5 命令单独构建。两份真实 H5 日志为 `taro-{vite,webpack}-react-tailwindcss-v4-release-h5.log`。

main 默认矩阵包含普通 uni 多小程序/H5/SSR/快应用、Mpx 五端、Gulp 抖音、Taro 部分非微信目标、分包及 style-injector。完整 55 项名称和命令见 `main-remaining-workflow.log`，不据此扩展到未选平台。

## 独立 uni 消费者解析问题

现有 uni 编译器默认 `resolve.preserveSymlinks: true`。同一 pnpm 消费者、同一入口下，仅切换该项：true 无法从 `weapp-tailwindcss/dist/escape.js` 解析 `@weapp-tailwindcss/escape`，false 可构建。正式版与 main 各自独立安装均复现。包的依赖声明、虚拟 store 内容及 Node createRequire 解析正常，问题位于保留 importer 软链接路径后的 bundler 解析边界；本轮没有注册 alias、hoist 或复制传递依赖来掩盖结果。

证据为 `release-consumer-diagnostics.json` 和 `main-release-symlink-diagnostic.json`。最小复现目录 `minimal-repro-symlink/` 附独立 lockfile：

```sh
pnpm install --frozen-lockfile
pnpm exec node reproduce.mjs
```

此脚本整体退出零只表示已记录 A/B 两个结果；true 的构建仍失败。这与 #1340 的池提交丢失分别记录，尚未认定为本次 main 引入的回归。

## 环境恢复、门禁和证据边界

已根据用户授权修改根 AGENTS.md、预检领域规则和多端手册：AI 自主处理可核实归属的常规恢复、用已有官方镜像创建专用设备、选择明确 iOS 目标，并记录归属、恢复依据和清理方式。认证、许可、破坏性重置、归属冲突和全面门禁保持原边界；机器路径、设备 ID 不写入通用规则。

HBuilderX 历史 session `ccc21830-33da-4c5e-9426-63b795cff8d2` 经 host/plugin 生命周期、旧进程和 alias 状态核实后归档解除，见 `environment-recovery/hbuilderx-recovery.json`、registration.json、blocked.json、原生状态和截图。未将“PID 不存在”单独作为停止证明。

Android 专用 AVD `WeappIssue1340Api35` 来自已有 API 35 google_apis arm64-v8a 镜像，在线 serial 为 emulator-5556；iOS 选择已有 iPhone 17 Pro / iOS 26.5，UDID `8FF8E968-BB02-4039-A25C-7C7EBCBDA402`，保持历史可比性及数据。Harmony 借用 `127.0.0.1:5555`，不停止用户设备。

main static 日志显示 matrix 34/34、static 4940/4987 通过，剩余为配置跳过。其后 source 指纹变化导致门禁停止，已保留并精确恢复本任务 HMR 残留。续跑只跳过已执行的前两个阶段，复用原工作流门禁、取消和清理逻辑，provenance 记录于 `main-remaining-workflow-provenance.json`；第 4/14 阶段 Weapp Vite readiness 超时后停止。issue-1214 的真实尺寸 1/1 通过，证据在 `e2e/.artifacts/issue-1214-ide/run-Jc9q0S`。IDE 框架 11 通过 / 1 失败包含 2 项元测试，不能说 11 个框架设备通过。

证据整理发现部分早轮 computer-use.json 将调用标题或自行命名字符串写入 toolCallId，`538d5ebe` 轮还使用了非原始摘要。它们不满足真实原始输出要求，不能作为合格的全面验收证书；CLI 曾接受也不改变此结论。已保存完整性审计 `preflight-evidence-integrity-audit.json` 和能追溯的 actual-session-calls-audit.json；不重写旧记录来伪装当时正确。5babec52 轮调用 ID 可追溯；早轮构建/IDE 的实际输出仍保留为观测结果。

后续原生 Chrome 控制连续超时且用户正在切换页面，按手册改用同一工具的后台 IAB。`36fe1264` 轮保存真实截图、原始工具结果和实际调用 ID，computer use 完成，但 verify 微信 auto 请求超时，仍 blocked。其本任务探针经原生“项目 → 关闭当前项目”确认关闭，原 owner 进程结束后仅归档其服务锁，未修改账号配置，详见 `environment-recovery/wechat-36fe-recovery.json`。d52db77b 轮因该租约未解除而阻断，不算成功重试。

`f133d8ae-d476-42f4-9b80-b5f78e706ac3` 轮重新 prepare、真实后台交互、截图、原始记录、verify 全部通过；Chaser 冷编译由其领取。prepare、verify、领取均重放相同配置，未额外添加 PATH。先前 `538d5ebe` 的启动器曾因多加 Node bin PATH 被门禁拒绝，未启动编译，该错误已正式 block。

本轮保留的主要命令：`pnpm e2e:preflight prepare`、`pnpm e2e:preflight verify --report <本轮报告>`、`pnpm e2e:demo:workflow:local --preflight-report <本轮报告>`、`pnpm e2e:multiplatform-build`、`pnpm e2e:mp:ide`。独立消费者框架选择脚本为 `framework-release.test.ts` / `framework-release.config.mts`；原生专项为 `chaser-native-compile.ts`。本机一致环境入口 `run-bound-env.py` 仅保存于忽略目录；所有 shell 命令由 rtk 调用。

## 测试适配器变更

HBuilderX 实际进度日志使用单独 CR 刷新，成功终态可能直接接在最后一条进度之后。原静态适配器只按 LF/CRLF 分行，误把成功判为失败。本任务改为同时拆分 CR、CRLF、LF，保持失败优先和产物检查；新增成功、失败两项回归。25/25 测试通过，真实 VDOM 静态重验也通过。没有降低退出码、错误日志或输出存在性的门槛。

正常验证没有更新任何快照，没有新增 demo/static 场景；新增的两个适配器测试是 mock 日志终态回归，不需要生成 demo 基线。最终报告、规则与命令入口由 pnpm agents:check 复核，两个修改的 TypeScript 文件另经 ESLint 检查。

## 本轮原生结果与收尾

正式版 Chaser Android Vapor 首次冷编译由有效门禁 f133d8ae 领取，命令参数为 `launch app-android --deviceId emulator-5556 --compile true --cleanCache true --vaporRenderTarget bytecode`，`UNI_APP_X_DOM2=true`，使用独立发行包消费者。日志明确是 HBuilderX 5.34、蒸汽模式和字节码，实际工程 67 个页面；不能将其写成 151+151 原生复现。

该轮在 600000ms 上限内持续编译大量页面/组件，但没有成功或失败终态，最终超时并触发 NativeCleanupBlockedError。未生成可审计的完整样式产物，没有开始安装和页面检查。仅据超时不能归因于 #1340，也不能声称构建成功；没有继续三轮冷编译、增量或 main 原生对照。该计划的原生通过标准未满足。

证据在 `e2e/.artifacts/issue-1340/chaser-native/release-cold-1/`：invocation.json、hbuilderx.log、native-session-ce40988c-3d50-445b-ad09-ad32177f66ad/blocked.json、recovery-complete.json。原 primaryError 与停止未知记录保持原样。恢复时核对本轮 CLI、uni 编译器和 esbuild 退出，按准确 alias 关闭项目并核对列表移除；确认无活动编译和未保存编辑后受控重启所选 HBuilderX，验证旧 host/plugin 生命周期结束、新实例空闲、项目 alias 不再存在，再将准确 session 登记原子归档到活动注册目录外。未以删除登记伪造正常清理，也没有恢复后重新调度全面测试。

资源收尾记录为 `environment-recovery/resources.json`：Android 仅停止本任务创建的 emulator-5556 运行进程，保留 WeappIssue1340Api35 AVD 配置供复用；iOS 仅关闭本任务启动的指定 simulator，保留数据和明确目标；借用的 Harmony、微信登录/实例及恢复后的 HBuilderX 保留。后台 IAB 临时页关闭并核对列表为空；误导航的用户 Chrome 标签通过两次后退恢复原页面，未关闭用户标签。消费者、锁文件、tarball 和原始证据保留供复现；预检服务及本任务编译/开发进程均已结束。

没有本轮最终展示页。需要继续原生验收时，应先依据同一账本启动专属设备并重新 prepare、computer use、verify，不复用本轮已消费/失败的报告。

## 适用边界

只有补齐两版本 Android Vapor 三次冷编译、增量、逐模板有效声明、空包审计、安装后 flex-1/flex-row/图片/swiper 结构及截图，才可认定该原生组合验收通过。其余支持的 uni/uni-app x 平台、VDOM/Vapor、两种隔离配置和类新增/替换/删除/恢复仍需逐项本轮证据。配置跳过、缺证、环境失败和工具链未支持分别记录，不能合并为通过。

本记录提供可重现的正式版失败和 main 根因边界通过，不支持“#1340 已彻底修复且其他平台没有问题”的发布结论。

## 规则评估

根据用户明确要求，新增常规环境自主准备与恢复规则，并同步根 AGENTS.md、scripts/e2e-preflight/AGENTS.md 和多端手册。设备目标、镜像、归属、恢复证据和收尾方式保存在任务账本；通用规则不固定本机路径、端口或设备 ID。全面测试仍要求本轮全部探针、真实 computer use、verify 和一次性门禁，不放宽缺证、超时、登录保护及共享会话边界。
