---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 7be44fe4a456e4248c61331edfa9e2824ca72d11
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-initial-warmup.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
  - e2e/wechat-automator.test.ts
  - e2e/wechat-launch-diagnostics.test.ts
  - e2e/wechat-launch-stages.test.ts
verification:
  - claim: 严格 warmup 在只有新产物而没有本轮编译成功信号时错误放行
    kind: unit
    status: failed
    sha: 7be44fe4a456e4248c61331edfa9e2824ca72d11
    environment: macOS，Node 24.18.0，独立 worktree 中加载新增回归与原实现
    command: pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-initial-warmup.unit.test.ts
  - claim: 整合后的首次编译合同与现有 watch 生命周期回归通过
    kind: unit
    status: passed
    sha: 78785fd31eeb13a8b4acf7ef5b6250f1ffff7ad7
    environment: macOS，Node 24.18.0，主任务 worktree，新增复盘尚未提交
    command: CI=1 pnpm --config.verifyDepsBeforeRun=false --filter weapp-tailwindcss exec vitest run test/watch-hmr-initial-warmup.unit.test.ts test/watch-hmr-regression.unit.test.ts test/watch-hmr-uni-build-lifecycle.unit.test.ts --update=none
  - claim: 当前提交的完整本地验收仍被微信 App 就绪检查阻断
    kind: native
    status: failed
    sha: 7be44fe4a456e4248c61331edfa9e2824ca72d11
    environment: macOS，Node 24.18.0，微信开发者工具 Stable 2.02.2608080，保留已有登录态
    command: CI=1 pnpm e2e:demo:workflow:local --quality --preflight-report e2e/.artifacts/preflight/ea37014e-44e6-4b82-8017-29fe13688814/report.json
  - claim: 启动阶段诊断保留原请求、预算、错误与清理合同
    kind: integration
    status: passed
    sha: 79818d04e7a04c07ca912e02a79ec713a77cfdbf
    environment: macOS，Node 24.18.0，真实 SDK 就绪回归及合成阶段故障，新增复盘尚未提交
    command: CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-launch-diagnostics.test.ts e2e/wechat-launch-stages.test.ts e2e/wechat-automator.test.ts e2e/wechat-session-boundary.test.ts --update=none
---

# 首次编译契约与微信 App 就绪的证据边界

## 症状

本轮报告 `ea37014e-44e6-4b82-8017-29fe13688814` 的 prepare、当前会话原生 Chrome 交互与 verify 通过。23 阶段完整验收的前 12 阶段通过，第 13 阶段在 Taro Webpack React 的微信 App 域就绪检查处失败，探针退出 78；第 14–23 阶段未执行。

最后错误为 `DEVTOOLS_PROTOCOL_TIMEOUT`，方法 `App.captureScreenshot`，剩余预算 1216ms。该值是 30s 启动共享预算的尾部，不能据此将整个启动超时描述为 1216ms。watch 日志包含最终 `Compiled successfully in 9.91s`，但原日志没有启动各阶段的时间戳，不能证明 IDE 打开时编译已经完成。

前一提交的完整验收也曾在 Taro Vite React 的同一 App 就绪层失败。两次命中不同 case，现有记录不能区分 IDE 编译、App 服务、截图渲染与宿主调度延迟，也不能据此确认框架编译缺陷。

## 根因与纠正

独立审查发现一个可证的验收器合同缺口：`waitForInitialWarmup` 先接受新 WXML/JS 的 mtime 稳定窗口，再检查 `requireInitialCompileSuccess`。因此声明必须等待首次编译成功的 case，仍可能仅凭局部文件稳定而放行。已有预构建文件时，IDE wrapper 又不会重复执行缺失产物等待。

新回归在原实现上得到 6 项中 3 项失败：无本轮成功信号、只有旧成功信号，以及成功信号尚未达到原稳定窗口时，严格模式均在 1800ms 错误放行。延迟成功信号用例本应至少等到 4500ms。依赖未构建导致的零用例环境失败单独保存，不计入行为红证据。

修复由通用 warmup 合同承担：严格模式只接受已有会话提供的本轮编译成功信号与原稳定窗口；mtime 和预构建产物回退只服务未声明严格要求的 case。复用现有成功信号，不添加框架日志猜测，不改变超时、稳定窗口、后续 HMR 或产物断言。

这一缺口可以通过定向回归证明，但不能倒推出本次 App 超时恰好命中了该竞态。新增启动分阶段诊断只观察现有 discovery、两次 login、auto、connect 与 readiness 操作，记录单调时钟耗时、剩余 deadline 和白名单错误标识；不输出请求参数、错误正文或凭据。它不增加 IDE 请求，也不修改重试、预算和关闭责任。

观察器在启动与原失败清理全部结算后停用，一次输出最多 64 条阶段元数据并报告省略数；限制日志容量不会截断连接重试。事件循环 histogram 覆盖整个作用域，包含失败清理时间，不能把 max/mean 单独归因到 readiness。零样本明确记录为缺证；观察器或日志故障不替换原结果或原始异常。诊断不构成修复 App 超时的证据。

## 验证

- 新增 warmup 回归覆盖新/旧成功信号、延迟成功与原稳定窗口、building 阻断，以及非严格模式的新产物和预构建回退。
- 整合后的 3 文件、128 项回归通过，0 跳过。额外尝试的独立 TypeScript 检查使用不合适的根目录配置并命中既有传递类型错误，原输出保留，未算作通过，也未为此扩大修改范围。
- 诊断整合回归 4 文件、50 项通过，0 跳过，包含原 29 项 SDK 与 5 项会话边界回归。7 个变更 TS 文件的显式严格 ESLint、4 个诊断文件的定向 strict TypeScript 检查通过；会话扫描未新增豁免。独立审查核对请求数量、预算、重试、失败清理及异常身份，未发现阻断项。
- 真实完整验收原日志及阶段报告保留；日志 SHA-256 为 `2b1ec5f6d1c18a594ed8865b920fa635d1c0be0c5fb6b8220cc179525d4ca228`。后续定向通过不能改写该失败状态。
- 本轮报告记录的 1814 个 PID 与两个 owner root 均经独立复查确认退出；微信租约不存在、prepare 为 finished、Git 工作树干净，原日志没有独立清理错误。
- 首次按数字匹配 PID 时，曾命中在验收退出后启动的审计 Python helper。原观察保留，随后按启动时间和命令确认是 PID 重用，未终止该进程。进程归属不能仅凭历史 PID 数字认定。
- 当前 IDE 选中窗口属于另一 worktree 的旧预检，仅进行只读观察。没有关闭、重载或操作该项目，也不以当前窗口推断历史失败现场。

## 适用边界

一次完整验收失败后，停止后续调度，只允许有界诊断与本任务清理。代码整合后先用原失败用例做一次有界诊断；重新开展完整验收前仍需全新 prepare、当前会话 computer use 与 verify。不能将重跑取绿、旧报告、局部回归或远端 CI 换算为完整本地验收通过。

微信登录、HTTP 服务、项目租约和清理继续由现有边界负责。不启动或重启 IDE，不读取或替换票据，不修改 SDK 或安装版 IDE，不放宽原预算。

## 规则评估

不新增 AGENTS 规则。现有首次编译要求通过持久行为回归约束；失败阻断、登录保护与归属清理继续遵守现有工程流程。本文保留 partial，直到当前改动的真实诊断及完整验收取得相应证据。
