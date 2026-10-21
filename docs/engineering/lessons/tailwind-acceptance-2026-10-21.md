---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 4ea2684361a8080362eb796c7eae5c8a117fa804
regressions:
  - e2e/taro-vite-react-tailwindcss-v4.test.ts
  - e2e/taro-vite-vue3-tailwindcss-v4.test.ts
  - e2e/taro-webpack-react-tailwindcss-v4.test.ts
  - e2e/taro-webpack-vue3-tailwindcss-v4.test.ts
verification:
  - claim: 固定源码完成一次十五目标调度，存在失败、阻塞和未执行范围
    kind: integration
    status: failed
    sha: 4ea2684361a8080362eb796c7eae5c8a117fa804
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Tailwind CSS 4.3.3，CI=1，本轮 extended 预检、原生 Chrome computer use 和 verify 全部通过
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/1b9d3cfc-b0ea-4a3a-8713-090df74430a1/report.json
  - claim: 四个 Taro demo 按真实输出定向更新并审查十五份 static 基线
    kind: integration
    status: passed
    sha: 085715cf953a85054350a7b177f98aa61f2a015c
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交基线，CI=1、E2E_SKIP_OPEN_AUTOMATOR=1；只更新这四个项目
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts --update=all
  - claim: 审查后的四个 Taro static 回归以禁止更新模式全部通过
    kind: integration
    status: passed
    sha: 085715cf953a85054350a7b177f98aa61f2a015c
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交基线，CI=1、E2E_SKIP_OPEN_AUTOMATOR=1
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts --update=none
---

# 2026-10-21 Tailwind 十五目标验收记录

## 症状

运行 `6d596b2e-fe30-4294-b14f-f1fabfdf5126` 固定于上述完整 SHA，十五个目标全部尝试。原始 v2 索引保留三 passed、一 failed、八 not-run、三 blocked，不能称为全面通过。报告根为 `e2e/.artifacts/tailwind/6d596b2e-fe30-4294-b14f-f1fabfdf5126/`，完整调度日志为 `.tmp/tailwind-full-4ea.log`。

本轮先完成 prepare `--extended`，真实原生 Chrome 交互时间为 `2026-10-21T11:38:46.660Z`，再完成 verify，预检报告只消费一次。微信登录态、HBuilderX 和模拟器未重置。结束后 prepare 服务退出；本任务创建的 Chrome 挑战标签已关闭，报告记载 `ownChallengeStillOpen: false`。

## 根因与纠正

WebKit 的真实 visited 点击、HTTP 200、导航返回、身份、几何和资源清理均通过，但 probe 与独立手写参考的四边仍为 RGB(1,2,3)，预期 RGB(18,52,86)，共二十四条颜色分量不符。不能只归因 Tailwind，也不能自动改判不支持。后续有界观察修复及原图重放见 [visited 复盘](tailwind-visited-observation-trace.md)，尚须新鲜端侧运行。

framework 的真实失败为四个 Taro demo 的 static 快照。`a7b1118` 的来源注释保护及根颜色保留已更新 generator 基线，遗漏旧 static 基线。按四项目真实重建，审查十五份 CSS 的全部 diff：只有 `/*! tokens: ... */` 来源注释，以及 Vite React/Vue 根中分别十/九条颜色声明；issue909 的转换基线新增七条保护来源注释，其它声明和选择器没有变化。不修改归一化器，不删除颜色掩盖差异。

framework 最终索引的 blocked 是另一个控制边界缺陷：已通过的 scheduler 负向测试打印模拟 Lynx/iOS 故障，父入口扫描整个聚合 stdout，把稍后的真实快照失败升级成环境阻断。保留原始索引，不回写历史为成功；后续修复必须按本次调用和生产者核验专属终态回执。

## 验证

表内数字来自本轮独立报告，P/F/B/N 分别表示通过、失败、阻塞和未执行；数量不能跨验证层级相加为平台支持数。

| 目标 | P | F | B | N | 证据范围 |
| --- | ---: | ---: | ---: | ---: | --- |
| static | 47,483 | 0 | 0 | 118,473 | 34,505 个样本实际生成/转换/编码；大量候选仍缺独立转换 oracle |
| authoring | 29 | 0 | 0 | 0 | 本轮作者指令与配置合同 |
| 普通 Web Chromium | 1,354 | 0 | 0 | 0 | 基础127、注册1205、history1、真实源码18、生命周期2、HMR1 |
| 普通 Web Firefox | 1,354 | 0 | 0 | 0 | 同上，独立引擎报告 |
| 普通 Web WebKit | 1,353 | 1 | 0 | 0 | 唯一失败为真实 visited 像素 |
| Expo 三浏览器，各自 | 118 | 0 | 0 | 1,260 | 各自26正向运行时、5编码、87负向；注册能力未执行 |
| 微信 | 18 | 0 | 0 | 1,282 | 已有夹具实际执行；未登记能力不以构建代证 |
| RN Android、iOS，各自 | 118 | 0 | 0 | 1,260 | 各自26正向运行时、5编码、87负向；servedBundle 仍未捕获 |
| Lynx Android、iOS，各自 | 17 | 0 | 101 | 1,496 | 10运行时、7像素；101缺独立判定器，205原子与1291注册夹具缺失 |
| mini-builds | 40 | 0 | 0 | 20 | 四十个真实构建及即时归档；十九Taro与一个uni-app x入口缺失 |
| framework-regressions | 3,662 | 4 | — | 49跳过 | 360文件：335通过、4失败、21跳过；21分48秒 |

Lynx 两端的原始宿主均输出 `completion: complete`、118案例、无 pending candidate；这只是宿主采集协议完成。Android 原始54支持/64拒绝、iOS 53支持/65拒绝，均不能替代适配报告的独立语义判定。最终101阻塞细分为55编码、18运行时、19像素、9生成层缺判定器；1496未执行仍保留。

RN/Expo 原始31支持、87预声明拒绝，不能写成118项正向运行时支持。mini-builds 的 Vitest 六十项测试体表面 passed，但 afterAll 正确拒绝二十项 not-run；不能用测试体通过数绕过总门禁。

四个 static 更新后，`CI=1`、`--update=none` 为四文件二十三项通过。更新日志 `.tmp/taro-static-085-update.log`，审查后复验 `.tmp/taro-static-085-verify.log`。这次定向成功不覆盖原十五目标或旧五十七阶段的失败。

## 适用边界

本轮验收仍为 partial。后续源码须重新 prepare `--extended`、当前会话真实 computer use 和 verify，再开始新的全面调度；不能复用旧预检 lease。新登记 Taro/HBuilderX 构建、RN 实际 HTTP/WS served bundle、设备安装/HMR回执、Image/ScrollView 语义、原生注册能力、独立转换 oracle、动态颜色限制的微信负向运行时及其余 Web 媒体场景仍须补齐。

此前五十七阶段流程与性能门禁的首次失败继续保留，不能以本轮部分运行或 CI 通过撤销。#1307/#1308/#1309 的根因修复仍在 PR，未合并到起始 main；详见 [根因复验](lynx-main-root-verification.md)，本记录不关闭 Issue。

## 规则评估

不新增 AGENTS。使用现有逐端证据、禁止旧报告放行、资源收尾及基线审查规则，新增回归约束报告归属，不降低阈值或支持预期。

## bb55 第二轮记录

运行 `f197e131-2dee-4e80-9193-3c2bf41f7b78` 固定源码 `bb55fbaffaabc5480ae6babba6f968d0afd2ea60`。本轮先通过 extended 脚本探针、IAB 真实输入/点击和 verify；原生 Chrome 被用户接管后保留其页面，后台 IAB 自有标签 6 已关闭。原 CU 回执先记录的是本地定位符，随后从当前对话 rollout 补全真实平台调用 ID 及原始结果，单独保存在 `computer-use-platform-provenance.json`；不重写原回执或把事后补证当作重新放行。

| 目标 | P | F | B | N | 范围 |
| --- | ---: | ---: | ---: | ---: | --- |
| static | 47,483 | 0 | 0 | 118,473 | 生成/转换执行，缺独立 oracle 仍未执行 |
| authoring | 29 | 0 | 0 | 0 | 指令与配置 |
| Web Chromium | 1,391 | 0 | 0 | 0 | 九份报告，含新增作者/上下文及 Chromium 媒体夹具 |
| Web Firefox | 1,390 | 0 | 0 | 0 | 八份报告；未执行的其它媒体能力不包含在此计数 |
| Web WebKit | 1,389 | 1 | 0 | 0 | 唯一失败仍为 visited |
| Expo 三浏览器，各自 | 118 | 0 | 0 | 1,260 | 各引擎独立完成旧夹具，注册能力仍缺 |
| 微信 | 18 | 0 | 0 | 1,282 | 旧运行时夹具，不代表注册能力全覆盖 |
| RN Android | 118 | 0 | 0 | 1,260 | 26运行时、5编码、87负向；served bundle 未捕获 |
| RN iOS | 0 | 0 | 118 | 1,260 | CocoaPods 启动前失败，无本轮运行时报告 |
| Lynx Android、iOS，各自 | 17 | 0 | 101 | 1,496 | 原始采集 complete 不等于语义完整 |
| mini-builds | — | — | — | — | 收集64场景，启动后人工中止，未产出最终能力报告 |
| framework-regressions | — | — | — | — | 未启动 |

RN iOS 最终定位为旧 runner 的 derivedData 进入 CocoaPods 源码扫描树。人工查到原始日志后立即阻断本轮 lease，向本任务 mini-builds Vitest 发送一次 SIGINT，等待其收尾；预检服务退出，未继续 framework。索引中的 mini-builds blocked 与原有输出保留，不把部分构建归档算作六十四场景通过。门禁关闭期间下一次请求报 ECONNREFUSED，仍非成功。全过程未重置微信或设备。

后续已修复原生输出隔离、启动前诊断归档和历史失败重放，并补定向回归；详见[隔离边界复盘](tailwind-runtime-evidence-isolation.md)。旧 RN iOS 结果保持阻塞，旧 WebKit 结果保持失败。此次只调整 runner/证据，没有修改 demo 或样式，无需生成新的 static 基线。新源码还未完成新一轮全面验收。

同一 head 的 Windows repeated-watch 任务失败在前置 demo matrix 的 Rollup 叶子订阅等待，实际 Gulp repeated-watch 未执行；修复及确定性红例见[订阅复盘](rollup-invalidation-subscription.md)。整合后本地 demo matrix 为五十二文件、三百九十九项通过，Windows hosted 尚须新 head 证据。性能新增原始采样记录，不调整计时范围或预算；旧 head 的 P95 超限失败继续保留，不能由后续成功认定根因消除。

## fb95537 的 iOS 定向运行

固定 `fb9553723f7e83e3b6744b8a498c98c99e40b991`，扩展预检 `6ec35c46-fc9b-40e1-9ef2-1b610c5b7a5f` 首先被 Android 缺有效 UI 结构阻断，没有启动验收。原生 Android Studio 截图确认设备仍显示本任务旧 Lynx 夹具，通过 Home 返回桌面，未重置设备。随后全新预检 `5a194fea-b86d-4186-852b-83908b836a91` 的全部探针、后台 IAB 真实输入/点击及 verify 通过；computer use 回执在放行前即绑定当前对话的真实平台调用 ID 和原始结果。IAB 临时标签 7 已关闭并核对为空，用户原有 Chrome 页面未操作。

统一入口使用 `--target react-native-ios`、`RN_IOS_HOST=127.0.0.1` 和本轮报告，运行 ID 为 `358b637f-05f6-498d-9690-77361b1c7240`，日志 `.tmp/tailwind-ios-fb95537.log`。CocoaPods 与 Xcode 构建成功，但安装前的路径合同误拒 Xcode 返回的目录别名；没有运行时报告，最终能力报告为一百一十八阻塞、一千二百六十未执行，不能计为本轮 iOS 渲染成功。其他十四目标未选择、未执行。本次无 report 的启动日志与 build settings 已按本次 invocation 自动归档到该运行 `react-native-ios/native/`，不再需要从共享目录手工抢救。

路径根因与后续双向物理身份回归见[隔离边界复盘](tailwind-runtime-evidence-isolation.md)。原索引、原始 Xcode 设置和失败结论保留；新源码须再次 fresh 预检后运行。本次 prepare 与验收进程均正常结束，scratch 回执为 removed，未把历史路径当作现存 bundle。

## 824cdba 的 iOS 定向运行

固定 `824cdba6e74d48f2047b2f91bbb6e250acb64917`，扩展预检 `4e197963-ecf2-4854-9007-b709ab9e13ca` 的全部脚本、后台 IAB 真实输入/点击/截图及 verify 通过。平台调用原始结果在放行前保存；自有 IAB 标签 8 已关闭，用户接管的 Chrome 页面保持原状。

统一入口只选择 `react-native-ios`，运行 `5478f81d-db50-46e4-bb51-53a7aeca5ab1`、invocation `9169e88f-4732-4518-8197-12a66aa92eb0`。CocoaPods、Xcode、安装和启动通过，安装 app 路径、二进制摘要及 simctl PID 均归档。baseline、TSX HMR、CSS HMR 各自完成一百一十八例、四十份截图回执；三十一项预声明支持仍分为二十六运行时、五编码，另八十七项是预声明拒绝。三阶段共一百二十份语义 PNG 回执及三份总览 PNG，在该版本原生产 validator 离线重放通过，日志 `.tmp/ios-824-archive-verify.log`。

最终能力报告仍为一百一十八 passed、一千二百六十 not-run，统一入口以 exit 1 正确拒绝全面通过；其他十四目标未选择。日志 `.tmp/tailwind-ios-physical-both.log`，原始报告、阶段索引、构建设置及 HMR 记录均在该运行 `react-native-ios/native/`。预检服务已 finished，scratch 已 removed。servedBundle 仍是 not-captured，后续安装协议升级不能把该历史产物补写成新协议成功。

同一 head 的 hosted CI iOS run `39620497421`、job `119293511133` 在 baseline 首例第二帧采集超时。第一帧约五千八百六十五毫秒，几何、像素和 control 全通过；第二帧在约六千三百二十二毫秒开始，到总预算一万零十一毫秒仍在途。没有逐条 simctl 退出回执或 CPU 时间线，不能认定第二条命令卡死，也不能由本地成功消除 CI 失败。精确 merge checkout `9851c046` 的 parents 已核对为 main `7d80eb1b` 和本 head；未重跑。

## 实际安装证据协议升级

新增设备侧同步读取实际 runtime 的 publication 与 manifest 快照，快照前后必须稳定；JS realm 身份跨模块 HMR 保持，整包刷新会变更。每个 case、截图回执、最终报告及三阶段索引相互对账，索引升级 v2 并更新 fixture hash。宿主分别核对 manifest 原始字节摘要、实际 publication 和设备 JSON 内容，允许合法新发布保持相同内容摘要。该证据不冒称设备接收过完整 bundle 字节。

缺安装快照、错 realm、错 publication、错 manifest 的四个持久反例先红；补充拒绝数组摘要、零随机值身份、失败报告二次拒绝仍发送原始错误的边界。定向七文件一百三十五项、示例七文件二十三项及示例类型检查通过；较宽 RN compatibility 十九文件二百四十八项通过。static 通过 `pnpm e2e:react-native:static:update` 定向生成并审查，仅两处 fixture hash 和验证时间变化；之后 compatibility 和定向回归均以 `CI=1`、`--update=none` 验证。新协议的真实端侧运行另行记录，不能由这些合同通过替代。

## e1bb76d 的安装生命周期失败与阶段门禁

全新扩展预检 `54cee250-9825-4ef7-9c37-033635ae9bef` 的全部脚本、后台 IAB 输入/点击/截图及 verify 通过；真实平台调用 ID 与原始输出在放行前保存，自有标签 9 已关闭并核对为空。统一运行 `c40d3e75-e0b1-4afa-84e6-cb4a1f1ca6c0` 选择 Expo 三浏览器和 RN iOS。三浏览器均完成 baseline 四十份回执，但 TSX HMR 首例前实际安装断言失败，updated 阶段没有截图 pair。日志 `.tmp/tailwind-installation-e1bb76.log` 保留原始错误；适配报告的 stale runtime revision 是后续总门禁错误，不能掩盖首次安装错误。

发现同类代码失败后人工关闭该有效 lease，reason 明确记录“人工结束本轮有效 lease”，没有把它写成环境探针失败。RN iOS 未调度；最终索引保留三浏览器失败和后续调度阻断。prepare、验收及本任务服务均已结束，不能复用此预检。hosted 同 head 三浏览器及 Android 也在首次 TSX HMR 安装推进时失败；这轮 iOS 则在 baseline 截图预算失败，不能混为同一故障。

根因是阶段 marker 与虚拟 manifest 分别经过 HMR：新 marker 可以先挂载采集组件，随后才安装新 publication。同 key 的 state/ref 会保留旧快照，旧 render 的 `actualStyle` 和节点也可能保留；仅等待安装再替换 ref 仍不足。阶段门禁现在由宿主读取真实发布文件选择新 publication，旧发布返回 425；设备独立读取实际 runtime，匹配后通过 state 才挂载内层节点，再冻结本阶段安装。每例仍核对宿主 fence、实际 manifest、publication 与 realm；采集开始后任何安装变化继续拒绝，同内容的新 UUID 不能按 hash 合并。

回归先重现 marker-first 的旧样式闭包、旧 context 异步失败污染新 revision、以及安装缺失错误使用空 run ID。修复后真实 runtime 与 React DOM 的受控组件测试覆盖两种更新顺序、等待期间卸载、case 在途卸载和合法 context 后的错误交付；旧 context 成功与失败均隔离，当前阶段读取失败仍立即阻断。没有合法 context 时不伪造 run ID，投递失败仍显式保留。

本地命令与结果：

- `pnpm --filter @weapp-tailwindcss/example-react-native-expo test`：八文件三十三项通过。
- `pnpm --filter @weapp-tailwindcss/example-react-native-expo exec tsc --noEmit`：通过。
- `CI=1 pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/react-native-reporter-session.test.ts e2e/react-native-phase-evidence.test.ts e2e/react-native-installation-evidence.test.ts e2e/react-native-runtime-artifacts.test.ts --update=none`：四文件八十一项通过。
- `pnpm e2e:react-native:static:update`：定向重新生成，审查仅 `verifiedAt` 变化，没有改支持预期、fixture hash 或样式结论。
- 审查基线后 `CI=1 pnpm e2e:react-native-compatibility --update=none`：十九文件二百五十项通过，含 Web/Android/iOS Metro export；ESLint（含未忽略的示例测试）、`agents:check` 与 `git diff --check` 通过。

这次阶段门禁的端侧结果须绑定后续新提交记录；单测不能改写 e1bb 的真实失败。servedBundle 仍未捕获，Image/ScrollView、原生注册能力和完整转换 oracle 等缺口继续保持未完成。

同 e1bb 的 hosted iOS run `39625105304`、job `119308516784` 取得首例两帧，几何、像素和 control 均通过，但第二帧解码/判定结束约 10,145.6ms，超过固定 10,000ms 总预算；它仍为失败，不能因 consecutive=2 改为成功。Mpx benchmark run `39625105270`、job `119308606559` 的三次构建峰值 RSS 中位增加约 162.59MB（14.72%），steady 增加约 160.35MB（15.41%），超过既有门槛。旧 824 与 e1bb 间没有 packages 生产代码或 lockfile 差异；本轮 baseline 多一次 major GC、较早回调 heap 相近，只支持 GC 调度差异相关，缺构建结束期 heap，不能证明不存在保留量回归。两项失败均保留，不放宽预算或盲目重跑。
