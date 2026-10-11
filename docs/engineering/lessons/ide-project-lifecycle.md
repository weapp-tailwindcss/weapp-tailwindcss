---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 712e9647507a76799ea6abe98c7f29fea5af60e3
regressions:
  - e2e/ide-project-cleanup.test.ts
  - e2e/template-ide-contract.test.ts
  - e2e/template-ide-project-config.test.ts
  - e2e/templates-ide-smoke.test.ts
---

# IDE 项目生命周期与模板验收

## 症状

全面测试审查发现框架、Issue、选择器、模板和截图入口按应用名关闭或强杀共享微信 IDE；HBuilderX 构建收尾也执行相同操作。这些操作无法区分本轮项目和用户项目。

模板实际验收随后在 weapp-vite 的页面 JSON 存在性断言失败。其他模板还存在页面栈超时或读取不到内容就直接返回成功的分支。

## 根因与纠正

清理边界错误地采用应用进程，未使用各测试已经持有的项目路径。统一先断开本次连接，再执行官方 CLI `close --project`；CLI 失败保留为错误，不使用全局终止兜底。HBuilderX 编译自身不拥有整个微信 IDE，因此移除其全局退出操作。截图 HMR 即使项目关闭失败，也继续恢复本轮源码配置并停止本轮 watch。

weapp-vite 发布版的 `emitJsonAssets` 明确只输出非空 JSON 对象，模板原生页面源码是 `{}`。配置验收仅允许这一明确来源的空配置省略产物；非空源码、缺失源码、非法 JSON 和其他模板缺失配置仍然失败。组件引用继续根据实际产物逐项验证，不以缺文件默认空配置。

模板运行时改用 automator 的 `waitForRendered`，保留页面启动和渲染错误。严格复测发现 Taro Vite 的标签/WXML 查询失败，但真实截图完整、页面数据正常。后续使用同一会话查询 `.min-h-screen` 得到 390×753 的实际布局，确认是根节点查询方式不适用于当前 App-Service 协议。

模板验收因此使用所有模板已声明的根 class 和 Taro 组件作用域，要求真实节点具有有限且非零的宽高，并保存布局 JSON、截图和运行时错误。页面栈超时、页面缺失、零尺寸节点和渲染超时均不能作为通过；不使用页面 data 代替布局证据。

## 验证

- 旧清理入口的 8 项所有权回归全部失败；修复后 16 项清理测试与 22 项截图主题测试通过。
- 真实 `pnpm e2e:ide --update=none`：12 项通过，覆盖 10 个框架，耗时 1061 秒。
- Issue 909/916/928 两项、`:where` 一项、根选择器一项真实 IDE 测试通过。
- `pnpm e2e:ide:visual`：11 个截图场景通过，包含 uni-app x 两种样式隔离模式，耗时 777 秒。
- 模板原始失败：`weapp-vite-tailwindcss-v4 weixin should emit page json: expected false to be true`。配置与渲染契约修正后的首次实际复测在后续环境错误处中止；设置经验证的本机 AppID 后，最终已通过全部模板，包括 weapp-vite。
- 配置与布局契约 16 项定向测试通过；布局回归在旧 WXML 验收实现中有 5 项失败。Taro Vite 的真实诊断截图与查询结果位于 `e2e/.artifacts/template-ide-diagnostic-queries/`。
- 原始日志位于忽略目录 `e2e/.artifacts/full-test-fixes/2026-09-20T21-19-10.920Z/`，截图副本位于该目录的 `wechat-visual/`。
- 游客配置下模板复测：4 项通过（覆盖登记、Mpx、Taro Vite、Taro Webpack），uni-app Vite 1 项失败，uni-app Webpack 与 weapp-vite 2 项未执行。原始日志位于 `e2e/.artifacts/full-test-fixes/2026-09-20T22-20-23.677Z/e2e-templates-ide.log`，该轮预检 ID 为 `4b83b688-dad5-4621-bd16-7579ee6fc933`。
- uni-app Vite 已取得非零布局与实际页面截图，但出现 10 条被旧日志协议序列化为空对象的错误。独立产物副本的有界诊断使用 automator `enableLog(10000, { structured: true })` 与 `flushConsole()`，取得原始错误：`SystemError (appServiceSDKScriptError) / {"errMsg":"webapi_getwxaasyncsecinfo:fail "}`。结构化记录和截图位于 `e2e/.artifacts/uni-template-diagnostic/`；未忽略这些错误，也未更改正式产物或验收阈值。
- 当前 uni-app 模板的 AppID 为空，生成配置使用 `touristappid`，基础库版本为空。再次完整预检后复测仍失败，日志位于 `e2e/.artifacts/full-test-fixes/2026-09-20T22-32-55.322Z/`。随后在临时产物副本中仅替换为同框架 demo 已配置、此前已验收的 AppID，同一基础库 `3.17.2` 下获得 390×1621.78125 的实际布局，结构化运行时错误为零。证据位于 `e2e/.artifacts/uni-template-account-diagnostic/2026-09-20T22-36-06.497Z/`。这纠正了此前必须等待用户提供新 AppID 的判断：本机已有可验证的配置，但不应把该配置硬编码到通用模板。
- 模板测试新增显式 `E2E_TEMPLATE_IDE_APP_ID` 参数；本轮通过环境变量传入已验证的 AppID，项目关闭后恢复配置原始字节，遇到外部修改保留现场。7 项回归覆盖参数值、未设置、非法值、失败恢复与外部修改；无实现时 5 项失败，实现后与渲染契约共 23 项通过。
- 修复后重新预检（`e88cb880-db66-499e-b8e2-1b2ea3e3085f`）并运行：模板 IDE 7 项通过、HBuilderX 小程序 5 项通过、H5 页面和 HMR 3 项通过。日志位于 `e2e/.artifacts/full-test-fixes/2026-09-20T22-41-57.492Z/`，所有模板取得布局 JSON、实际截图与运行时错误检查。结束后 `git status --short -- templates demo` 为空，临时配置和源码均已恢复。

## Android 原生链路阻塞

同轮 Android 验收中，两个普通 uni-app 用例通过产物和传输检查，但未配置 Android 运行时探针，不能据此宣称设备完整通过。uni-app x 首次更新 `append-mt-200-to-existing-node` 在增量编译后触发第二次 `App Launch`，纯 HMR 断言失败。完整日志区分首次启动 `06:45:28.947` 和保存后的启动 `06:45:33.882`，不存在首次启动日志误计的问题。

有界对照使用无 `package.json`、无 Vite 配置、无 Tailwind 插件的最小原生 uni-app x 项目，保持同一 HBuilderX `5.26.2026091802`、VDOM 和 Android `emulator-5554`（API 30）。仅把页面原生 class 与文字从 before 改为 after，差量编译和文件同步后仍触发 `App Launch native-hmr-control`。证据位于 `e2e/.artifacts/native-hmr-control/2026-09-20T22-49-02.724Z/`，包含日志、前后截图及 `restarted: true` 报告；原始失败副本位于本轮完整日志目录的 `android-hmr-failure/`。

结论限于当前工具链：无本仓库插件也能复现重启，不能通过放宽断言、改为原生热重载模式或修改插件来宣称纯 HMR 已修复。保留既有 `e2e/hbuilderx-hmr-lifecycle.test.ts` 对重启的拒绝规则。恢复需要能够保持应用生命周期的上游运行链路，或由用户明确调整验收范围；再次全面执行前重新预检。

## 适用边界

本机验证为 macOS。Mpx 的框架套件使用编译可见性，Webpack React、HBuilderX、uni-app x 保留原有页面可见性豁免；独立截图矩阵有真实结构和画面证据，但不能把框架套件中的豁免改写成已执行。浏览器工具认证已通过当前会话的读取、输入、点击与截图验证。微信 SDK 配置阻塞已解除，后续在 Android 原生纯 HMR 阶段阻断；iOS、Harmony、App 视觉矩阵、React Native、Lynx 和尾部开发链路未完成。Windows/Linux 未实测，最终代码未完成全矩阵验收。

## 规则评估

不新增或放宽 AGENTS。通过共享的项目级清理实现、持久回归和更新 E2E 文档执行既有会话归属边界。
