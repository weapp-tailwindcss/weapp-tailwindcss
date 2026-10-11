---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/4ca235ff7aa54bf12c619a88aded8edd949361e9
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-environment.unit.test.ts
  - e2e/taro-dev-signals.test.ts
  - e2e/watch/taro-demo-dev.test.ts
  - e2e/web-hmr-evidence.test.ts
  - e2e/watch-command-lifecycle.test.ts
  - e2e/watch-command-scopes.test.ts
  - e2e/watch-artifact-collection.test.ts
---

# Watch 子进程环境与编译完成证据

## 症状

Taro Vite React 普通 demo 的 dev 脚本 在框架测试中输出 `syntheticNamedExports: __moduleExports` 错误，但 smoke 被报告为通过。独立 watch-HMR 工具可以完成构建和变更。

## 根因与纠正

普通 dev smoke 继承 Vitest 的 `NODE_ENV=test`，其余两条 watch 入口已各自清理测试环境。原始提交对照探针确认同一命令在 test 环境下失败，移除该环境后完成最终构建。提取公共环境边界函数供三个入口消费，移除测试运行器标志和值为 test 的 NODE_ENV/BABEL_ENV，保留显式 production/development、设备变量及用户覆盖，不修改父进程环境。

另一个独立问题是 smoke 把 `modules transformed` 当作编译完成。该信号只表明转换阶段结束，后续链接仍可能失败。改为接受 `built in`/`compiled successfully`，明确的编译错误会立即使等待失败；保留进程存活和稳定窗口检查，不放宽超时或断言。

全端验收还发现 Taro/Vite Web HMR 只有内存中的 DOM/CSS 断言与日志，没有前后截图。现在在相同页面与原有断言生命周期内保存截图、计算样式、浏览器诊断和服务日志；失败时保留原始异常并补充失败截图。报告区分断言通过与截图视觉审查，截图存在不能替代页面身份和样式断言。

MPX 还暴露命令预算与进程生命周期问题：三个原本独立的 watch 会话共用一个 420 秒命令预算，外层超时只杀死 pnpm 包装层，内层继续写源码并晚到输出成功。根据现有 splitSubPackageWatchSessions 元数据，将主包与分包分成各自可核验的命令，不改变单步性能阈值。超时先通过会话独有的取消文件进入 runner 的 finally，恢复源码并关闭会话；无响应时清理所属进程树。取消后的新会话在清理旧进程或 spawn 前即拒绝启动。晚到的内部成功不能覆盖外层失败。

## 验证

- 环境回归修复前 3 failed；信号回归修复前 1 failed、7 passed。
- 环境及原 watch-HMR 工具回归：119 passed；信号回归：9 passed。
- 原始提交 demo 的 dev 脚本 对照：test 环境触发 syntheticNamedExports，正常环境完成构建。探针仅在取得错误或最终完成信号后关闭自身进程组，关闭日志中的 ELIFECYCLE 不作为编译失败。
- `E2E_WATCH_CASE=taro-vite-react-tailwindcss-v4 pnpm exec vitest run -c e2e/vitest.e2e.watch.config.ts e2e/watch/taro-demo-dev.test.ts --update=none`：实际修复入口 1 passed，先取得最终构建，再验证稳定窗口。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/web-hmr-evidence.test.ts --update=none`：真实 Chromium 中 3 passed，覆盖样式变化、内层滚动容器目标截图和失败断言诊断；实际完整 H5 命令通过，归档前后页面、目标截图、计算样式和诊断。Vitest Web 汇总 18 passed 中，6 项 classFlowRequired=false 直接返回，不计入实际浏览器覆盖；有效浏览器场景为 9 项标题/样式与 3 项 class flow。Nuxt 标题场景仅验证文字，颜色由独立背景场景验证。

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/watch-command-lifecycle.test.ts e2e/watch-command-scopes.test.ts --update=none`：11 passed，包含真实子进程协作恢复与不响应后代清理。
- MPX 主包注入 45000ms 外层预算：按预期约 45.4 秒超时失败，runner 完成源码恢复，进程检查无残留；正常预算下完整主包/分包复验退出 0（约 424 秒，分别核验主包与两个分包），源码恢复。

日志保存于本轮忽略目录 `e2e/reports/local-full-run/2026-09-17-full/`，包括 `e2e-frameworks`、`watch-environment-red`、`taro-dev-signals-red`、`watch-environment-green`、`taro-dev-signals-green`、`taro-dev-test-env-probe`、`taro-dev-normal-env-probe`、`taro-dev-smoke-green`。

MPX 主包隔离后，快照门禁发现 app.wxss 的第三方样式依赖缺失；实际文件存在，是采集器只读取 mutation 候选造成。现从登记的样式产物递归收集相对 CSS import，去重循环依赖并保留缺失文件元数据，继续由原门禁拒绝真正的缺失。根路径 URL 没有产物根元数据时不按宿主文件系统解析。快照保留 CRLF 原始内容，确保内容字节数、SHA256 与实际文件一致。新增回归修复前 3 failed；修复后连同原门禁共 18 passed，覆盖传递依赖、缺失、循环和 POSIX/Windows 路径。实际 MPX 全链路复验通过（外层命令退出 0），第三方样式及其引用门禁通过。

## 适用边界

Taro 4.2.1、Vite 4.5.14、Vitest 5.0.0 的本机证据。早期批次中假通过的 dev smoke 不计入验收，完整框架复验仍待完成。清理测试环境只发生在启动真实 watch 子进程的边界，不改变普通测试进程或产品的环境变量语义。

## 规则评估

不增加规则；以公共环境函数和最终完成信号回归落实已有真实运行时验收要求。
