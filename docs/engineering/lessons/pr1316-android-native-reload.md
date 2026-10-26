---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 34894ffcd7e89d1b39fc593cfee8205da06d0102
regressions:
  - e2e/hbuilderx-hmr-lifecycle.test.ts
  - e2e/demo-visual-update-mode.test.ts
verification:
  - claim: 无插件原生项目一次合法 class/text 更新仍触发 App Launch，纯 HMR 验收失败
    kind: native
    status: failed
    sha: f358684fa2c1e8bf691bb6a0b67532f74c35115e
    environment: macOS；HBuilderX stable 5.26.2026091802；Android emulator-5554 API 30；VDOM；样式隔离 2.0；独立无插件控制项目
    command: HBUILDERX_HOST=HBuilderX pnpm --config.verifyDepsBeforeRun=false exec tsx .tmp/pr1316-android-native-control.ts --execute
    reason: 该诊断证明外部原生更新会重启，不代表本项目或提议的 native-reload 验收通过
  - claim: Android VDOM 模式归属、原生重载拒绝错误和重装、纯 HMR 继续拒绝重启
    kind: unit
    status: passed
    sha: f358684fa2c1e8bf691bb6a0b67532f74c35115e
    environment: macOS；Node 24.18.0；Vitest 5.0.4；f358684 基线加本轮四文件未提交改动，原提交本身不包含模式声明
    command: CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-hmr-lifecycle.test.ts e2e/demo-visual-update-mode.test.ts e2e/app-visual-lifecycle.test.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/hbuilderx-ios-hmr-completion.test.ts --update=none
  - claim: Android VDOM 用例按 native-reload 完成全部原有更新和设备证据检查
    kind: native
    status: pending
    sha: f358684fa2c1e8bf691bb6a0b67532f74c35115e
    environment: 用户已授权；f358684 基线加本轮四文件未提交改动；本轮预检通过，但完整验收在微信 IDE 阶段停止，未进入 Android
    command: CI=1 E2E_HBUILDERX_CASE='uni-app-x-vdom-tailwindcss-v4 android' pnpm --config.verifyDepsBeforeRun=false e2e:hbuilderx:local:android --update=none
    reason: 尚待微信 IDE 恢复、全新预检、本项目全部 Android 更新步骤及后续平台验收
  - claim: 采用原生重载声明后的完整验收在第十三阶段被微信 App 域就绪超时阻断
    kind: native
    status: failed
    sha: f358684fa2c1e8bf691bb6a0b67532f74c35115e
    environment: macOS；Node 24.18.0；微信开发者工具 Stable 2.02.2608080；f358684 基线加本轮四文件未提交改动；有效预检 d3a87472-0f4d-46a4-b934-f4dd51a4ae01
    command: CI=1 pnpm --config.verifyDepsBeforeRun=false e2e:demo:workflow:local --quality --preflight-report e2e/.artifacts/preflight/d3a87472-0f4d-46a4-b934-f4dd51a4ae01/report.json
    reason: 前十二阶段通过，微信 Issue 1214 的 App readiness 使用剩余约七十一秒后超时；第十四至二十三阶段未执行
  - claim: 按用户授权正常重启 IDE 后，原失败用例仍被 auto 接口 HTTP 500 阻断
    kind: native
    status: failed
    sha: f358684fa2c1e8bf691bb6a0b67532f74c35115e
    environment: macOS；微信开发者工具 Stable 2.02.2608080；使用本轮已选 CLI 与已绑定 AppID；登录检查通过；未重置登录或清理会话
    command: CI=1 pnpm --config.verifyDepsBeforeRun=false e2e:ide:issue-1214
    reason: 一次原失败用例的有界复验；服务错误后停止项目请求，等待用户恢复 IDE
---

# Android VDOM 原生重载与纯 HMR 的验收边界

## 症状

PR #1316 的完整本地验收在 Android uni-app x VDOM 首次保存后出现第二次 App Launch，原有纯 HMR 门禁拒绝继续。首次构建与首步更新已取得 marker、颜色/尺寸探针和截图证据，但它们不能证明应用运行状态得到保留，也不能代替后续五步验收。

## 根因与纠正

2026-10-26 的最小原生对照固定 HBuilderX stable 5.26.2026091802、emulator-5554（API 30）、VDOM 和样式隔离 2.0。项目只有 manifest.json、pages.json、main.uts、App.uvue 和一个页面，没有 package.json、Vite 配置或 Tailwind 插件。两类合法原生 CSS 已预先声明；首次运行就绪后只保存一次页面 class 切换与静态文字替换，App 和 CSS 字节不变。

完整原始日志记录首次 App Launch 和保存后的第二次 App Launch，设备截图分别出现本轮 UUID 的 before/after marker；采样报告的 PID 为 4156→4304。因此 Tailwind 插件和原用例的主样式触碰不是本轮重启的必要条件，当前工具链的这条原生更新链路不能按保持应用状态的纯 HMR 验收。

既有 `uni-app-x-vdom-tailwindcss-v4 android` 用例按 `native-reload` 单独记录更新能力。它保留全部候选、主题、产物、传输、像素、marker、设备身份和更新步数检查；更新失败、重装与未取得当前运行时内容继续失败。报告记录每轮 App Launch 次数，并将原生重载步数与纯 HMR 步数分开。原生重载允许应用重新启动，不保证内存状态保持。

共享纯 HMR 门禁继续拒绝 restart，uni-app-x 的其他平台用例保持原有模式。该声明只调整具体测试的能力归属，公开编译行为没有因此改变；未来工具链声称支持保持运行状态的更新时，须先用独立原生控制重新核验，再单独审阅模式声明。

## 验证

本轮已执行无插件控制，结果是纯 HMR 失败；它仅证明外部平台在这次原生更新中重启，不是本项目的验收通过记录。有效证据位于忽略目录 `.tmp/pr1316-native-control-ny5Kr4/`：report.json、hbuilderx.log、update.log、before/after PNG 与 XML、两份源码快照及会话恢复资料。源码快照的实际 hash 与报告一致，唯一修改是页面 class/text；收尾完成、未阻塞，源文件已恢复，任务项目别名已关闭。

此前三轮初始化错误未完成更新，不计入有效对照。本轮有效运行使用正式 runner 的默认日志参数、每轮 UUID marker/AppID，并在更新前核对初始编译、同步与 App Launch；没有把旧页面或初始化失败作为控制结果。

2026-10-26，用户明确选择该用例的原生热重载契约。验证时为 f358684 基线加四文件未提交改动，原提交本身不包含模式声明。五文件生命周期与报告回归共 75 项、包内矩阵回归 12 项通过，严格 lint 和主包严格类型检查通过。

本轮有效预检 `d3a87472-0f4d-46a4-b934-f4dd51a4ae01` 的八项检查和 verify 全部通过；原生 Chrome 前台冲突后，按多端手册改用当前会话的后台应用内 computer use，保留真实调用、输入、点击、完成回执和截图，临时标签页已关闭。该预检固定的源码摘要为 `0b3461b1f7b7c22b050f591ddcf1bcef1bd396adb55ce30ac9a95dcb93293336`，四文件原文与 hash 已归档，不能将其视为后续提交的新预检。

完整入口前十二阶段通过，包括全仓 11,677 项单测、原有质量门禁、4,304 项 static 测试和 55 个多平台构建产物用例。第十三阶段的微信 Issue 1214 已完成构建和两次登录检查，但 App 域就绪在剩余约 71 秒内仍未确认。最后一次 `App.captureScreenshot` 的 990ms 是总预算余额，不能据此缩短或跳过原门禁。尺寸测量尚未开始，第十四至二十三阶段均未执行，Android 的六步更新、截图及后续平台验收仍为 pending。

按用户授权正常重启既有 IDE 后，登录检查仍通过；原失败用例只做一次有界复验，`auto` 接口返回 HTTP 500，未取得自动化连接或尺寸结论。服务错误后停止后续请求，用户确认暂时无法恢复 IDE。未修改登录、代理、账号、会话缓存或共享 Launcher 的保护逻辑。原始证据分别位于 `.tmp/framework-isolation/full-native-reload-20261026.log`、`.tmp/framework-isolation/full-native-reload-20261026-first-failure/`、`e2e/.artifacts/issue-1214-ide/run-MgsN74/` 与 `run-ZCNltS/`。

本轮失败、重启后的复验失败，以及此前 34894ffc 的第十九阶段失败均保留。后续局部通过或 CI 成功不能改写这些记录；恢复后须重新预检并完整执行，不能从停止位置续跑后宣称整轮通过。

## 适用边界

本轮公开日志没有暴露 FILES 协议，不能直接断言本次内部同步的首文件为 dex；PID/API 没有单独保存 adb 原始 stdout，来自采样代码和报告。安装源码的 dex→restart 分支是补充机制证据，结论仍以本轮两次真实 App Launch 为准。该结果不外推到其他版本、iOS、Harmony 或其他渲染模式。

模式声明不等于真实设备验收已经通过。整合后必须重新通过定向回归和该用例全部增量步骤，再按本轮环境预检规则完成剩余平台验收；单次无插件控制不能替代这些验证。

## 规则评估

不新增或放宽 AGENTS。多端手册只补充这个唯一 Android VDOM 用例的显式 native-reload 归属；其他 uni-app-x、iOS 与 Harmony 用例不自动继承。继续使用既有生命周期、设备证据、失败和重装拒绝门槛，原生重载报告不计入纯 HMR 步数。
