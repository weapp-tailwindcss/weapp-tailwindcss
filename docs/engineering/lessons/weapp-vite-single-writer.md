---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e192ed3d3b2a6e3aa402f1c72b9355f7efe7f94c
regressions:
  - packages/weapp-tailwindcss/test/ci/weapp-vite-e2e-watch.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-removed-rules.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
---

# weapp-vite watch 单写者与小程序样式移除合同

## 症状

扩展流程的框架 IDE 阶段中，`demo/weapp-vite-tailwindcss-v4` 已完成启动、页面重载和 watch 就绪，却在模板 class 热更新后报告 `undefined is not a function`。日志显示原生增量构建完成后，包装器又执行完整构建并清空相同输出目录；回滚时也发生同样操作。该证据能确定并发产物写入，不能凭匿名调用栈断言具体哪个运行时函数失效。

本轮实际解析到 demo 安装的 weapp-vite 7.4.0，使用现有 `classic` 开发模式。独立模板安装的其他版本不代表这个 demo 的运行版本。

## 根因与纠正

旧包装器同时维护 `weapp-vite dev` 和源码轮询驱动的 `weapp-vite build`。两个进程拥有同一输出目录，完整构建清理目录时，IDE 可能读取增量构建已经公布但随后被删除或替换的产物。

包装器现在只解析当前项目 manifest 声明的 CLI bin，并由当前 Node 直接启动一次 `dev --platform … --no-mcp`。CLI 继承会话的进程组，不引入额外 pnpm 启动器或脱离归属的进程。旧 `WEAPP_VITE_E2E_WATCH_BUILD_FALLBACK=1` 配置在创建任何子进程前报错，防止配置残留悄悄恢复第二个写者。

关闭请求只转发一次，包装器等待子进程 `close` 后释放监听。`exit` 时固定是否已收到取消，避免子进程意外退出后、后代尚未释放管道期间的迟到信号将失败改写为成功。取消前自行退出、非零退出、信号终止均失败；仅取消后协作清理并以 0 退出成功。超时和进程组升级终止仍由外层 watch 会话负责。

移除第二写者后，真实模板复杂语料首次失败于 `[@supports(display:grid)]:grid` 缺少 CSS。对完全相同输入分别保存 dev 与 production 的 WXML、JS、CSS 后，确认 WXML 和 CSS 分别字节一致，四个条件 token 均保留，`@supports` / `:hover` 样式在两条链路都被移除，回滚后 token 消失。这里的边界是 weapp-vite 的 `transformBundle → compiler.transformCss` 调用默认小程序 finalize；不能泛化为所有底层样式转换都会移除这些语法。

因此在主模板、普通分包和独立分包绑定已有 `MINI_PROGRAM_REMOVED_CSS_UTILITIES` 负向合同：仍需原始 token，支持的 utility 仍需实际 CSS，禁止残留条件规则，并验证最终回滚。未过滤这些模板输入，也未修改 Gulp 合同。主脚本使用的既有 JS 语料本身不包含这四个 token，本轮保持原输入和断言不变。

## 验证

定向回归使用以下入口，禁用快照更新：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/weapp-vite-e2e-watch.test.ts test/watch-hmr-removed-rules.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none
```

CLI 生命周期回归启动真实 Node 子进程，在带空格的临时项目目录读取非默认 bin 路径，覆盖 stdout/stderr 分片 UTF-8 就绪、同一进程新增/替换/回滚、启动前后异常退出、启动期间取消、重复关闭、延迟清理、exit/close 竞态和取消后的 SIGKILL。POSIX 协作信号专项在 Windows 明确跳过，其他用例保留跨平台执行。

真实 7.4.0 classic 回归调用现有 `runCase`，保留构建，`timeoutMs=120000`、`pollMs=40`，运行小程序完整案例。第一次保留未绑定负向合同的失败；修正后第二次通过主模板与主脚本的 baseline、complex、hex 轮次及额外 class、同 class 字面量、注释和样式回滚，随后在 `content / issue33-arbitrary / add` 的 `bg-[#000]` class/CSS 证据处失败。原生该轮重编译记录为 592.48 ms，断言等待到超时；此结果仍需进一步定位，不能写作整例通过。

原始证据保存在任务忽略目录 `.tmp/weapp-vite-single-writer/`：`classic-native-before-error.txt`、`candidate-diagnostic/` 和 `classic-native-after.log` / `classic-native-after-error.txt`。测试结束后确认源码已恢复；首次失败样本保留，不调整性能阈值或反复重跑寻找通过。

后续在主任务提交 `779129b54500e5eaacc93da7516914772973cb32` 完成新预检 `005877e1-513c-45fe-9061-56df3ccc5526`，原微信 IDE 用例三项通过：模板和脚本热更新均以 `devtoolsVisible=live` 确认，运行时检查无异常；样式热更新通过。没有使用页面重载或重新打开项目兜底。外层领取与准备进程退出码均为 0，记录的 15 个采样进程均已退出，源码干净，临时浏览器标签页为 0，微信登录态仍有效。证据目录为 `e2e/.artifacts/weapp-vite-demo-ide-verification/005877e1-513c-45fe-9061-56df3ccc5526/`。

后续 content 失败根因及 native 完整功能复验见[混合模板 class 消费证据](watch-mixed-class-consumers.md)。保留前述首次失败，后续通过不能覆盖原始观察。

## 适用边界

本轮修复测试包装器的输出归属与退出回执，未修改公开包行为、demo 源码、生成器或 static 基线。CLI 功能回归不替代真实 IDE 验收，也不代表性能门禁通过；IDE 原用例已按上述主任务提交完成预检和复验；最终扩展全流程仍由主任务统一验收。条件样式合同仅限已证明执行小程序 finalize 的 weapp-vite 模板链路。

## 规则评估

不新增 AGENTS 规则。现有构建生命周期、进程归属和首次失败证据要求已覆盖本问题；通过真实子进程回归以及实际 case 的 token、CSS 和回滚断言固化边界。
