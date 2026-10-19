---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: da240e7778aa3d88d29bf94da4b3fad573d988ca
regressions:
  - packages/engine/test/v4.source-modules.test.ts
  - packages/react-native/test/tailwind-entries.test.ts
  - packages/postcss/test/native-typography.test.ts
  - packages/postcss/test/native-shadow.test.ts
  - packages/postcss/test/native-selectors.test.ts
  - packages/react-native/test/transform-cascade.test.ts
  - e2e/tailwind-weapp-conversion-oracle.test.ts
  - e2e/tailwind-browser-lifecycle.test.ts
  - e2e/tailwind-hmr-server.test.ts
  - e2e/tailwind-framework-source-server.test.ts
  - e2e/tailwind-framework-source.test.ts
  - e2e/tailwind-web-context.test.ts
  - packages/react-native/test/runtime-isolation.test.ts
  - packages/react-native/test/style-arrays.test.ts
  - packages/react-native/test/relative-line-height.test.ts
  - e2e/react-native-evidence-protocol.test.ts
  - e2e/react-native-control-evidence.test.ts
  - e2e/react-native-encoding-evidence.test.ts
  - e2e/tailwind-hmr.test.ts
  - e2e/tailwind-authoring-generation.test.ts
  - e2e/tailwind-web-variants.test.ts
  - e2e/lynx-source-boundary.test.ts
  - e2e/tailwind-report.test.ts
  - e2e/tailwind-web-layout.test.ts
  - e2e/tailwind-web-lifecycle.test.ts
  - e2e/tailwind-web-lifecycle-runner.test.ts
  - e2e/tailwind-browser-serialization.test.ts
  - e2e/react-native-ios-build.test.ts
  - e2e/react-native-native-wait.test.ts
  - e2e/react-native-artifact-evidence.test.ts
  - e2e/react-native-reporter-session.test.ts
  - e2e/lynx-reports.test.ts
  - e2e/lynx-native-failure.test.ts
  - e2e/lynx-failure-evidence.test.ts
  - e2e/lynx-android-sdk.test.ts
  - e2e/lynx-zip-entry.test.ts
  - e2e/lynx/build-metadata.test.rb
  - e2e/tailwind-scheduler.test.ts
  - e2e/tailwind-css.test.ts
---

# Tailwind 四端能力与证据边界

## 症状

同一套 Tailwind 4.3.3 候选在 Web、微信、React Native、Lynx 中不能仅靠“生成了 CSS”或“节点可见”判定有效。多入口样式、前缀、主题变量和共享扫描目录还会改变实际生成及编码结果。历史原生报告与本轮 static 使用不同的 catalog 身份，不能互相背书。

## 根因与纠正

- engine 拼接多个 CSS 入口时丢失入口目录，导致相对 `@config` / `@plugin` 从错误位置解析；现在在入口边界固定模块身份。
- RN 不能把独立前缀及主题的 CSS 合成一个 design system；现在逐入口生成、解析变量和编码，再按来源顺序合并 manifest。诊断用 raw CSS 的拼接不再参与二次编码。
- 共享 TS 数据包含独立 authoring/parity 资料，而且源码字符串的引号转义不是最终候选原文。应用只扫描 `compatibility-candidates.txt`，真实 Scanner 回归逐项核对文本与 catalog 完全一致。
- 字重的主题变量必须递归解析；未解析和循环变量产生诊断，不能把 `var(...)` 交给原生宿主。相对行高保留倍率元数据，在最终字号层叠后换算，不能输出 1.25px。多层阴影与 spread 必须完整编码，不能近似为首层；规则局部变量也不能污染全局默认值。
- 报告从每条 required assertion 的层级推导证据要求，视觉子断言必须有本例本轮截图。布局案例检查真实子项与几何，避免 preflight 默认值或未被布局消费的 computed property 掩盖失败。
- 扫描不能只检查 classSet：独立参考逐候选检查实际声明、条件、全局依赖和排除结果，产品候选只能来自真实源码。
- 原生负向结果必须有明确的候选诊断；空规则或静默丢失是失败，不能自动变为“不支持”。复杂选择器通过 AST 提取精确候选后明确拒绝；双轴 skew 在最终变量层叠后组合，不能只保留最后一轴。
- Web 状态在触发前、触发后和恢复后验证，具名作用域和组合条件增加中间负控制；源码 HMR 通过真实 Vite 服务连续增、替、删并刷新，保存标识、样式、WebSocket 消息和同页面身份共同验真。
- React/Vue 源码经真实框架编译并执行分支；服务使用真实临时目录身份，保存屏障等待完整 Vite 更新周期，不能在原始 watcher 回调中提前读取旧产物。上下文变体用实际 browser context 和原生表单事件取证；starting 与 details-content 另外采用原生生命周期/像素夹具；剩余 6 类变体继续登记未执行。
- RN 实例分别维护注册表与元数据，工厂 revision 使缓存失效；深层样式数组迭代解析并明确拒绝循环引用。近零非零阴影透明度按宿主可消费的小数保留，不能由格式化舍入为透明。
- RN 五个构建指令重读本轮稳定发布的 Metro manifest 并回放独立编码预期；运行时增加无效果 control，宿主同时忽略 probe/reference 样式时拒绝通过。组合效果不能替代其中每个默认属性的独立证明。
- 目标转换先固定独立参考和已审查转换规则，再执行产品管线。首批 848 个默认补全具备完整 WXSS 关键字兼容 oracle，其余候选不由声明存在推导转换支持。
- 候选规则同时比较选择器、条件和同一属性的声明顺序；另行检查完整官方参考中的全局变量、动画帧与 property 注册，避免只保留 class 声明的误报。

## 验证

定向验证使用 `CI=1` 和 `--update=none`：

- `pnpm e2e:tailwind:contract`：注册表、报告身份、语义、浏览器分组和反误报合同。
- `pnpm --filter @weapp-tailwindcss/engine exec vitest run test/v4.source-modules.test.ts --update=none`：来源模块的 Windows、POSIX 与网络共享路径。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts e2e/lynx-source-boundary.test.ts e2e/lynx-static-evidence.test.ts e2e/wechat-session-boundary.test.ts --update=none`：真实编码、扫描及微信登录态边界。

静态基线由 `pnpm e2e:tailwind:static:update`、`pnpm e2e:react-native:static:update`、`pnpm e2e:lynx:static:update` 分别显式更新，正常运行重新生成后与提交基线比较。基线更新只证明生成与编码产物，不能证明原生设备通过。

2026-10-19 的早期本地定向记录：能力合同 37 文件、368 项通过；React Native 包 70 项、PostCSS 包 25 项、Lynx 编码/扫描与微信会话边界 50 项、Expo 示例 5 项通过。RN 产物及 catalog 定向验证另有 8 项通过，Expo 导出项未被该定向过滤选中，不能算作本次实际导出验收。任务文件 ESLint、`git diff --check` 及 agents 检查通过。完整 e2e 类型图仍有既有依赖、别名和原生 runner 类型诊断，不声明完整类型检查通过。日志保留在 `e2e/.artifacts/tailwind-development/`。

全面验收必须另取本轮 extended 预检、当前会话 computer use 与 verify，再运行 `pnpm e2e:tailwind --preflight-report <本轮报告>`。实际执行记录位于 `e2e/.artifacts/tailwind/<run-id>/index.md`，包含通过、失败、阻塞和未执行范围；没有本轮记录时，本复盘不声明四端通过。

源码 `f4ff45010` 的集成合同为 57 文件、764 项全部通过（`contract-lifecycle-fixed.log`）；Lynx 示例 13 文件、151 项通过。此前受影响的 PostCSS 全包为 142 文件、1,489 项通过、3 项既有跳过；RN 包 19 文件、112 项通过，包类型检查通过；Expo 示例 4 文件、8 项及真实 Web/Android/iOS Metro export 通过。新几何协议的 Android JVM 四组与 iOS Foundation 三组测试通过，不能换算为设备渲染验收。生命周期接线的 100 项定向回归、审查后的 static 只读检查、ESLint 与规则检查通过。新增闭包问题由真实 tsx 跨 realm 回归先红后绿拦截，详见 [递归回调复盘](browser-callback-recursion.md)。

## 本轮完整运行与后续修复

2026-10-19 的完整调度 `7b5aa8bb-888a-4d97-b4f7-f61594a09b34` 已因 RN iOS 环境故障停止。CocoaPods 已完成安装，但 Expo 的 GUI 发现要求本机不存在的 Simulator.app。只读诊断确认 Xcode 路径、simctl 与已启动模拟器可用；没有修改 Xcode、重新登录微信或重置设备。该轮预检 `4cbd59f8-96cd-45ae-b12d-2efc249f3107` 已失效，不能复用。

首轮 Chromium 基础语义 127 项通过，Firefox 126/127、WebKit 126/127、微信 17/18；其它子组及原生未验收范围保留原报告。发现的颜色量化、序列化 `__name`、字体引号比较、Lynx decoder 边界、大报告序列化、独立参考 fallback、自定义 RN 样式及平台规则身份问题，均已补失败回归后修复。这些修复仍需新的实际运行证明，不将旧记录改为通过。

首轮还发现 CLI 将工具环境错误作为普通目标失败捕获并继续启动 Lynx。已保存 `environment-block.json` 和原始索引，将故障后的产物排除出本轮通过率。调度器现以独立环境错误立即停止全部后续 check/execute；纯回归使用真实失败子进程证明这一边界。RN iOS 明确使用 prebuild、CocoaPods、xcodebuild 和 simctl；这属于新的原生 runner 实现，必须重新 extended prepare、当前会话 computer use、verify 后才能实际验收。

转换 oracle 新增 RN 独立映射（默认补全 1,599 项），WXSS 扩至 848 项；两端未审查范围分别为 21,687 和 22,438。修复 place 多关键词展开、RN spacing 函数拆分、非法布局枚举及组合平台变体丢条件，并增加完整四边、四角、双维度和动态阶段比较。缺少独立原生几何回执的 Lynx 案例不能通过，混合案例也不传播为所有子能力通过。

Lynx 的几何采集由双端原生宿主独立量六个节点，写出 probe/control PNG 与身份绑定的坐标 sidecar，JS 只能提交 PNG，不能伪造几何回执。普通 run context、缺 sidecar、旧 run、错误 hash 或无效矩形均不能通过。混合案例采集可保留精确的 pending 候选，但最终基线和统一 v2 验收继续拒绝缺少能力证据；active 不代证 hover。

宿主阻断采用严格白名单结构化信号，支持聚合错误，避免从普通几何错误文本推断环境。主树的结构化阻断、真实子进程调度及 adapter 共 73 项通过；Lynx 示例最终 14 文件、160 项通过，static/扫描只读 21 项通过。更新后的 static 差异仅为生成时间，样式与 catalog 身份不变；原生桥已在双端实际 SDK 编译，但设备执行仍待新的预检与运行。

Expo 示例的 Babel preset 现按实际 Expo 包身份解析，避免 monorepo 的旧 preset 被 Metro 选中。修复后 Web、Android、iOS 三种真实 Metro export 已通过；这是构建证据，不能替代设备运行。

## 本轮重新预检的阻塞记录

源码 `015f2b33f2fed2ecb36c1aa894cbb0e79f3c8051` 于 2026-10-19 重新执行 `pnpm e2e:preflight prepare --extended`。run ID 为 `46e01584-5bff-438c-9323-2cc761613619`，最终状态 blocked：

- 通过：基础环境、HBuilderX、iOS 系统与截图、Harmony、五个浏览器探针、RN/Lynx Android 和 iOS 工具链。工具链通过不代表产品实际渲染通过。
- 阻塞：微信报“微信 IDE 已有服务不可用或超时（isLogin）；保留登录态，不启动或重启 IDE”；Android 报“Android 未取得有效 UI 结构”。没有尝试重启微信、恢复票据、切换账号或重置设备。
- 未执行：当前会话 computer use、verify 和全面产品运行。失败报告没有复用，也没有降级为单端运行。

预检原始报告保留在 `e2e/.artifacts/preflight/46e01584-5bff-438c-9323-2cc761613619/`。通过 `recordPreflightRejection` 仅整理阻断索引 `e2e/.artifacts/tailwind/8b115b9c-1e7f-4a73-83d7-f93c3915fb06/`，15 个目标全部 blocked、attempted=false；没有调用全面入口或测试 runner，不计为一次已执行验收。prepare 已以退出码 1 结束。本轮没有创建新的 computer use 标签页，已核对 IAB 标签页为空，原有 Chrome 页面未修改。

恢复需要用户确认已打开的微信 IDE 登录状态与服务端口正常，以及 Android 能显示并读取有效 UI。之后在稳定源码上重新 prepare --extended、完成当前会话 computer use 和 verify，再调用统一入口。剩余六类 Web variant、转换 oracle 与原生 runtime 夹具缺口继续保留；本轮不能得出“全部 Tailwind 写法有效”或“四端验收全部通过”。

## 适用边界

PR #1311 的首轮 CI（head `8275b8888`）暴露生命周期观测边界：Firefox 在同步插入时尚未提交 starting 样式，事件秒数带有 float32 误差；WebKit 对同一 transition 回拨到零再恢复会额外派发 start。修复保留同步插入的原始记录并显式标注阶段，要求真实渲染帧单调递增；原生事件仍要求正确顺序、来源、持续时间及恢复，只接受取证阶段的 start 回拨事件。两条失败回归先红后绿，四文件 43 项合同通过，Firefox/WebKit 的 `runtime/lifecycle-starting` 分别在真实后台浏览器单例中通过。

同轮 Firefox contrast 协议只更新 matchMedia，等待一秒仍未刷新既有原生 CSS。独立 CSS 最小复现证明真实 viewport resize 会触发重算；媒体适配器现在原生调整一像素并在 finally 恢复尺寸，继续检查候选、独立 CSS、媒体查询及两帧渲染。`runtime/controlled-contrast-more` 的触发和恢复单例通过，没有注入替代样式或刷新页面。相关 static 由 `pnpm e2e:tailwind:static:update` 重新生成，内容不变。以上是针对 CI 失败的有界复现，不能代替仍被预检阻塞的本地全面验收。

注册 utility 的首轮失败另按合法语法见证、参考上下文和浏览器能力分别定位。修正七个见证、伪元素及可观察布局，并登记固定浏览器版本的规范限制；负向合同同时要求原始产品声明完整保留、CSS.supports 与 CSSOM 拒绝证据、参考无效果，不能从样式失败直接改判。Firefox 的 headless Juggler 会用 UA important 隐藏滚动条，三条 scrollbar 案例因此改用同版 Firefox BiDi；仍验证原始生成 CSS、独立参考、对照和截图。首轮涉及的两组共 40 个定向案例已在 Chromium、Firefox、WebKit 分别通过，所有任务浏览器均在 finally 关闭。registry static 已显式更新并只读核对。

第二轮 CI 的 Linux Firefox 157.0 仅剩字体平滑两条 registry 断言失败：`-moz-osx-font-smoothing` 是 macOS 专属属性，Linux 的 CSS.supports 返回 false，CSSOM 和 computed 均为空，不能按“语法接受但 computed 不可用”建模。已保留原始 batch-004/040 证据，加入两条先红后绿回归并将该已登记限制改为明确语法拒绝；macOS 继续执行正向合同，未来引擎开始接受声明时旧负向合同仍失败。12 项 registry 回归通过；重新生成 static 内容不变。

第二轮 WebKit 的 HMR 删除阶段没有任何 Vite change 日志或 WebSocket 更新，页面仍保留 replaced 标识与 147px。真实 Node 文件监听器最小回归确认：紧接一次已观察保存的最终写入会被 Chokidar 的 50ms change 去重吞掉；macOS 默认 polling 不复现，因此回归明确选择 Node fs.watch。受控夹具使用 Vite 的 awaitWriteFinish 稳定写入边界，未修改普通项目 watcher 或增加浏览器超时。相同真实文件回归先红后绿，5 项 HMR 合同及后台 WebKit 的新增、替换、删除、刷新单例通过；static 再生成内容不变，浏览器和服务均在 finally 清理。

RN Web 像素失败来自探针与对照的渲染容器位置不同。三者改为同父级竖排，保留 160 像素宽度使 self-end 仍有可观察位移；未修改像素阈值。真实 `CI=1 pnpm e2e:react-native:web` 完成 baseline、TSX HMR 和 CSS HMR，118 个已登记案例中 31 个支持、87 个限制，独立像素、编码及产物校验通过（run `4c9df421-8003-4070-a2d9-a44989d81527`）。`pnpm e2e:react-native:static:update` 重生成后仅时间戳变化，相关合同以 `--update=none` 核对。此结果仅证明 Expo Web 的这些案例。

RN iOS 的首轮编译日志已包含 BUILD SUCCEEDED；真正失败是 simctl 对首次安装且未启动的目标返回 ESRCH。现在只接受 exit 3、NSPOSIXErrorDomain 和绑定目标应用的完整 nothing-to-terminate 诊断，其余终止错误继续阻断；同时避免把 deviceYear 等编译符号的 warning 误判为设备不可用。修复经原始日志回归验证，实际 iOS 结果仍待新 head 的 CI。运行时架构合同则用严格纯 JS 值解释闭包及浏览器打包替代旧单文件数量假设，继续拒绝 CSS 编译器、PostCSS root AST、Node、生成器及构建器，公开入口和源码均要求零 external imports。

第二轮 RN iOS 的原始 failure.png 显示 SpringBoard 的 Open in 应用确认弹窗，Metro 没有 Bundled。示例没有 expo-dev-client，却构造开发客户端深链；openurl 的成功回执不能证明应用启动。首次与恢复改为 simctl launch --terminate-running-process 直接启动已核对的 bundle ID，通过 RN 0.81.5 实际消费的 NSArgumentDomain 两键传入明确 Metro host:port 与 scheme；HTTP/HTTPS 标准端口也显式保留。入口检查实际 Expo AppDelegate 和 factory 消费链，保存源码及 hash，严格核对唯一正整数 PID，继续等待本轮 run/token/revision 的完整语义报告。84 项定向回归、Foundation Swift 实际编译执行、ESLint 与类型检查通过，真实设备效果等待新 head CI。新增 build/runtime 回归已加入 iOS workflow 和统一入口。

Lynx 首轮双端已采集运行时报告，但与历史提交的 catalog 身份不一致，且 hover/group-hover 缺独立输入证据。保留原始报告和严格最终基线更新拒绝，不手工刷新历史 hash，也不以 active 代证 hover；这两项仍阻塞最终完整性验收。

后续为固定 Lynx 4.0.1 预先登记独立媒体必要条件合同：原生宿主实际读取 SDK 版本、12 个矩形、6 张 PNG 与保留名侧车，要求无条件和 min-width 正向对照生效，hover:hover 与 hover:none 两组保持基线；缺证或任一结果不符均失败。验收端重新读取原始 PNG、侧车和本轮 CSS/TASM 的全部候选规则，不能仅信报告 metadata。只有完整原生证据符合时，原候选才在 runtime/media 必要门禁处拒绝，hover 输入和伪状态明确保持 not-tested，不向 v2 原子状态能力传播覆盖。主树整合后 152 项证据/报告/adapter 定向回归和 178 项示例测试通过；双端 SDK 纯编译通过，实际六帧仍等待 CI，不手工更新最终历史报告。新增三份媒体回归已纳入统一合同和 Lynx 显式入口。

独立审查随后发现，字面 selector 匹配会漏掉十六进制等价转义的无 guard 替代规则。离线静态层现复用 CSS AST 的 class 语义匹配所有分支，runtime 仅接受两条已审查的完整规范 selector，不引入解析器；CSS/TASM 等价转义、属性字面量和原始产物重读新增 12 项回归，其中 8 项先红后绿。整合后 CI=1 pnpm e2e:tailwind:contract 为 61 文件、868 项通过；Lynx 真实构建/编码/扫描另 45 项通过。第二轮旧 head 6d1f54587 的 Benchmark 全部分片首次通过，Windows 启动、三平台 watch、Chromium、RN Android/Web 通过；这些旧 head 结果不能代替后续提交的 CI。

head `2633f77a8` 的 RN Android 和 Expo Web CI 已通过，iOS 已收到基线报告；TSX HMR 也已生效，37 项宿主采集和 118 项结果无失败，但采集约 134 秒，超过原 120 秒等待，完整报告在失败收尾时才到达。现在累计计算客户端原 120 秒预算，只扣除本轮认证 revision、预登记唯一 case 的实际宿主采集区间；单例仍有 10 秒硬截止、登记数量总上限和子进程取消，旧身份、重复或重叠采集不能续命，构建启动继续按墙钟。审查同时发现循环退出后可能只有一个通过帧，已补回归并严格拒绝缺两连续帧、首帧迟到和第二帧迟到。9 文件 117 项、Expo 示例 8 项和核心类型检查通过；主树整合相关 8 文件 123 项通过。诊断 run `39228158639` 绑定 `8258978c3ca6a28361c952d64b19f05f5382db0d`，Web、Android、iOS 三个作业均已通过。独立核验双端 artifact 大小与 SHA、ZIP 安全边界及三阶段各 37 份 receipt/PNG，首尾完整报告均保留 118 个唯一案例，revision 连续变化；这次没有调整像素阈值、减少案例或更新 CSS/static。该诊断成功仍不能代替最终 PR head 的 CI。

Benchmark run `39223188622` 首轮 Taro Vite steady 插件 P95 从 1980ms 增至 2555ms，两个样本均越界，是真实门禁失败，原始 artifact `12173201020` 保留。同一 SHA/base、三轮构建与 HMR、同一阈值下只定向复测一次，attempt 2 的插件样本从 `[1773,1647]` 至 `[1699,1634]`，门禁 -4.17%、无 violations；聚合只选择新 artifact `12174092954`，其余四项目继续用首轮成功证据。复测与聚合均通过，仅说明本次未复现，不证明首轮样本无效或环境噪声；未改生产优化或阈值，复测预算已耗尽。head `2633f77a8` 的三浏览器、quality 三组、Windows 默认 utility、三系统 startup/watch 和 macOS 微信 watch 也已通过，portable 矩阵当时仍未完成，旧 head 结果不能代替后续提交。

Lynx run `39223188341`（head `2633f77a8`）双端在 `validateMediaGateEvidence` 拒绝后提前退出，旧失败路径没有导出六张原图和原生侧车，PrimJS 的 stack 又未包含 Error.message；这些产物不足以判定具体媒体行为。失败取证现使用本轮独占目录、固定八文件白名单和诊断专用目录，分别记录缺失和导出错误，并保留原异常；诊断不能作为通过证据或 crops，也不修改预先媒体合同。真实失败子进程和 stack-only 回归先红后绿，整合后相关六文件 61 项通过；新回归已接入双端 workflow 与统一合同。独立诊断分支 `codex/tailwind-lynx-ci` 的 run `39226463939` 绑定源码 `a52da250608531731ce4600b92f3e4bd37f459ec`，用于收取新证据，不能代替 PR 最新提交的正式检查。

该诊断的 Android artifact `12173413807` 经大小及 SHA-256 核对后，确认原生 getter 实际返回 `0.0.1`；无条件正向探针是绿色 32×16，但 `min-width` 仍是红色 16×16。六帧与侧车完整落盘，结果不符合运行前合同，仍记失败。官方 `org.lynxsdk.lynx:lynx:4.0.1` AAR 的 SHA-256 为 `e04d7b62a8ecb9255b7993cbbae93abca3196949a1c7c23477618ec07cc557e2`，其 Java getter 字节码直接返回常量 `0.0.1`；不能把配置版本覆写为原生读数，也不能仅凭该 getter 判定实际安装版本。

Android 身份修复从 Gradle 实际解析的 component、AAR 和各 ABI 的 `liblynx.so` 生成受构建图管理的 asset；原生宿主另外读取实际安装 APK、所选 ABI 库、加载 bundle 和本轮 context。runner 保存构建与已安装 APK，离线验收重新比较字节及预先固定的官方指纹，保留错误 getter 原值。Android 强制完整工件身份；iOS 拒绝夹带该 Android 证明。ZIP 只解析必要条目，不向文件系统展开，拒绝重复、损坏、越界和不支持的布局，支持真实 APK 的 zipalign 零填充。整合后的身份、ZIP、媒体、全分支 guard、报告及失败取证 8 文件 173 项通过，Android 六组 Java harness、工作流 20 项和 ESLint 通过。真实 Gradle 构建及 APK 离线验真属于构建证据，不能代替设备运行。

编码侧另确认，生产 TASM 0.0.49 在未启用页面配置 `enableCSSRule` 时会静默忽略媒体规则。独立分支 `codex/lynx-cssrule-probe`（源码 `faddad5af9edc014e2a005247e5207134572c394`）只通过官方 `pluginLynxConfig` 启用该页面开关，保留原 encoder、engine 3.9、SDK 和六帧预期。纯构建通过，真实 bundle 包含开关；Lynx run `39230554994` 用于核对原生效果，尚不能算修复通过。该模式还暴露独立 Greedy decoder 的读取边界，静态定向解码失败；serializer 输入或 bundle 中出现开关均不能代替编码及运行时通过证据，诊断配置暂不进入主修复分支。

该开关诊断的 Android artifact `12177540185` 经 SHA-256 `5a9a33e1649d2701b0d687299a26342ea16ae22ca3d46fd942f2b95625bbb462` 核对，原生 `min-width` 已变为绿色 32×16，四个负向探针仍为红色 16×16，无条件正向探针为绿色 32×16。原始 PNG 与侧车支持配置根因，但该分支尚无新 APK 身份协议，旧 getter 门禁仍拒绝发布报告，不能刷新最终基线。前一诊断的 iOS artifact `12175519603` 经完整摘要校验后确认 getter 为 `1.4.0`、`min-width` 仍未生效；其来源须独立修复，不能接受错误读数来放行。

iOS 版本异常来自官方 source Pod 的构建元数据缺失：原始 `LynxVersion.m` 在没有 `Lynx_POD_VERSION` 时回退到 `9999_1.4.0`。现有 post_install 按实际解析的 root_spec 核对 4.0.1、CocoaPods checksum、官方 release URL 和源码 SHA，仅给 Lynx target 补齐官方宏，保留其它配置并拒绝冲突。原 getter 及 JS 均不改写。三组 Ruby 回归、原始源码的 clang/Foundation getter 与真实 Xcode 构建设置均通过；未加宏为 1.4.0、受管构建为 4.0.1。该修复仍需新原生运行验证，不能把构建证明计作设备验收。

能力清单覆盖固定版本的注册项和有限补全，任意值按语法分支取样。runtime 夹具缺口、缺少独立转换 oracle、不可触发状态及设备阻塞均须保留，不能自动变成“不支持”，也不能用同属性的其他案例填充。第三方插件任意实现需另行登记。

## 本轮 CI 后续与实际 bundle 证据

旧 head `2633f77a8ab31f73bad29a373fc86213559caee1` 的 PR Gate run `39223188607` 已完成，198 个任务成功；该结论不覆盖后续提交。组合 Lynx 诊断 run `39233837439` 进一步确认 Android 的 PrimJS 没有 `Object.hasOwn`，iOS 的真实 `Pod::PodTarget` 没有 `native_target`。前者改为宿主支持的原型方法并有先红后绿回归；后者经正式 installation results 映射到唯一 PBXNativeTarget，真实 CocoaPods 1.16.2、1.17.0 的原异常与修复均已验证，保留官方 Podspec、源码及版本宏校验。

官方 `pluginLynxConfig({ enableCSSRule: true })` 已整合，仍使用生产 TASM 0.0.49。独立 decoder 固定 0.0.53 对应源码及两份只影响解码的补丁，分别修 CONFIG/CSS 读取顺序和 class/id 文本转义；不修改 encoder、原生匹配或 bundle。portable WASM gzip、源码归档、工具链、补丁和许可均登记 SHA-256；在不同临时路径从固定归档完整重建后，raw 与 gzip 逐字节一致。实际 17 条选择器二进制 fixture、生产 bundle 媒体条件及篡改负控已通过。普通 CI 读取同一固定便携产物，失败不得回退系统 NAPI 或 serializer 输入。

static 与媒体 guard 验收现从 `main.lynx.bundle` 实际解码；`tasm.json.cssMap` 只作生成溯源和诊断归属。声明比较只接受已审查的有限等价表示，并返回实际声明；四边、四角、gap、flex、grid span、ratio、渐变、origin 与 animation 的缺项和错值负控保留。一个预期可以对应多个实际声明，不能依声明数量判失败，也不能跨 selector 补齐缺失边。已重新运行 `pnpm e2e:lynx:static:update` 并审查差异；最终 static 与双端历史报告仍需在本轮修复稳定后正常更新和只读重跑。

启用 CSSRule 后，固定 encoder 的 group/peer 参数化 `:is/:where` 被逐候选拒绝，不能再归为运行时媒体拒绝；普通 hover 的媒体门禁继续独立验证。`columns`、`min-content`、`justify-self:flex-end` 与 `white-space:pre-wrap` 的静默丢弃需要从实际二进制证明，空诊断不能证明保留。`!important` 在真实 bundle 中保留，原生支持状态尚待本轮同身份设备证据审查。没有把本轮失败自动改为 unsupported。

采集与像素算法单测使用独立协议夹具，保证 encoder 先行拒绝时仍能验证丢帧、错回执、状态恢复、白空格及像素负控；这些夹具不参与生产门禁。真实构建与 bundle 的 24 条定向回归、示例 181 条及像素协议 39 条已通过。后续最终 CI 和设备运行结果会继续绑定准确源码及 catalog，不能据此宣称完整四端验收完成。

## 规则评估

继续采用独立 worktree、精确候选、生成器单一归属、预检强门禁和微信登录态保护。无需放宽上级安全规则；新增共享目录和能力 runner 的领域规则已登记到规则索引。
