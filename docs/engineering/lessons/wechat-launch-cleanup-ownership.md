---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 7e593089398056b38d84656dc7583bacf6ff5608
regressions:
  - e2e/wechat-automator.test.ts
  - e2e/template-ide-session.test.ts
  - e2e/framework-ide-project-lifecycle.test.ts
  - e2e/ide-project-cleanup.test.ts
  - e2e/frameworkIdeReopen.test.ts
  - e2e/wechat-service.test.ts
  - e2e/issue-1214-ide-lifecycle.test.ts
  - e2e/ide-launch-diagnostics.test.ts
  - e2e/preflight-probes.test.ts
---

# 微信启动失败的清理责任只移交一次

## 症状

完整扩展轮次 `2fa9fbeb-94a5-420f-87c3-0ba45101d05e` 前 26 阶段通过；第 27 阶段 MPX 模板成功，Taro Vite 模板失败：`App.captureScreenshot within 1245ms`，随后又报「未登记本轮微信项目与 HTTP 服务的归属」。后续 28—46 阶段未调度。归档包含本轮 preflight、控制台、内存报告、模板证据及进程审计；1945 个采样 PID 均已退出。

模板目录还保留了数小时前的 `rendered.json` 和成功截图，本轮只更新 `error.txt`。这些旧图片不能证明本轮完成渲染。

## 根因与纠正

1245ms 是启动就绪检查的最后一次剩余期限，并非模板证据截图的 15 秒参数。`Launcher.launch` 在统一 60 秒启动期限内调用上游 `waitForAppReady`，后者用最多 3 秒的截图协议探针等待 App 域。失败后 Launcher 使用打开时的 HTTP 服务关闭本轮项目，成功关闭会释放绑定；调用方未取得返回值，却仍在 finally 中第二次关闭项目，制造了无归属清理错误，视觉入口还会覆盖原始错误。

清理责任现在以成功返回连接为移交点：Launcher 负责失败启动的原服务收尾；模板、框架、视觉和相关 IDE 用例只在取得连接后关闭项目。保留服务边界对未知归属、认证异常、并发租约的拒绝；没有把未知项目关闭改成静默成功。直接通过 HTTP 打开项目的预检仍负责自己的显式服务清理。

每次模板 IDE 运行使用独立 `run-*` 证据目录，并在控制台打印路径；失败不覆盖历史证据，也不夹带上一轮成功图片。

本轮原生 IDE 日志另显示 `routeTo appLaunch timeout` 和 `triggerAppRouteDone timeout`。DevTools 的主包加载完成信号没有到达，不能简单解释为截图慢。伴随的 `custom devtools frontend param is missing` 只是在 frontend 未显示时产生的诊断，目前没有证据证明它是首因，亦未证明前一 MPX 项目残留导致失败。此处修复清理与证据生命周期，不声称已修复 IDE 内部的主包就绪失败。

进一步审查修复了同一边界的三个遗漏：Issue #1214 仅在取得连接后关闭，独立执行项目与临时目录清理，最终状态及完整错误链在清理后落盘；root-selector 去掉外层两次启动循环，诊断失败也保留原始启动错误；Launcher 和预检连接等待遇到上游握手/断连的聚合错误立即停止，不用下次成功掩盖资源释放失败。

HMR 原来的“重新读取页面”会在外层已经持有项目租约时再次 `launch`，然后吞掉“项目已有活跃会话”直至 marker 超时。现在只借用原项目登记的 WebSocket 端口，连接获取在页面轮询外执行；临时客户端断开不会释放外层项目租约。端口借用检查 auto 已成功、原服务未阻断及租约身份，未知项目、打开未完成或关闭后均拒绝借用。稳定版原生服务用客户端集合管理独立连接，UUID 请求单独回传，但页面状态仍共享，不能据此放开同服务的双项目并发。

## 验证

- 新增真实 Launcher 与模板/框架/视觉包装层的三项组合回归，修复前全部失败，分别观察到二次清理错误聚合或首因被覆盖。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-automator.test.ts e2e/template-ide-session.test.ts e2e/framework-ide-project-lifecycle.test.ts e2e/ide-project-cleanup.test.ts e2e/wechat-service.test.ts e2e/wechat-session-boundary.test.ts --update=none`：6 文件、83 项通过，涵盖真实本地 HTTP 错误、会话操作白名单及并发服务租约。
- 模板证据回归验证旧成功文件保持原样，新失败目录只有当次错误；启动层已有的聚合错误按原对象和层级保留。
- 测试资源使用独立临时目录，HTTP fixture 的租约文件也限定在本例目录并收尾。

- 新增三项连接/服务组合回归修复前失败，证明重复打开和吞聚合清理错误；修复后 7 套 100 项通过。Issue 生命周期随后补充“测量通过但收尾失败不得落盘 passed”和聚合错误展开回归，最终 7 文件 101 项通过。
- `67d4a29ee` 上新预检 `cb0db1a0` 与当前原生 Chrome 的完整证据通过；不跳过安装/构建，按 MPX→Taro Vite 顺序定向运行，3 项通过（含合同），原生渲染、截图及零运行时错误均通过。这只是一次有界复测，原 App 就绪超时根因仍未证明修复。
- 随后 `9faeb190` 的最小原生预检再次出现 `App.captureScreenshot within 1990ms`，未进入全面验收或真实双连接验证；其他脚本环境探针通过。失败不是 Taro 独有。原生 UI 取消未提交的文件选择弹窗后发现本任务昨天已阻断的三个预检窗口：`e850c24c`、`01122f5a`、`6c8519e3`。逐项核对报告归属与已结束状态，再只关闭这些项目窗口；保留其他项目和 IDE 主进程。尚不能把历史窗口或弹窗认定为超时首因。

- 清理后的新轮次 `6e128cf6` 通过全部脚本探针、原生 Chrome 的输入/点击/截图证据及 verify。真实同项目双客户端实测通过：临时客户端读取 marker 后断开，原客户端仍可 currentPage、点击、验证新状态和截图；HTTP 仅 `/v2/auto` 一次、`/v2/close` 一次，末次登录检查通过。证据与复现脚本保存在该轮 `full-regression` 归档。本次只验证共享项目连接生命周期，页面命令仍串行，未验收双项目并发。

## 适用边界

未启动或重启微信 IDE，未操作账号、票据或会话缓存。原生日志只归档本轮窗口的已审查行，不复制账号字段。没有修改模板或 demo 的样式源码与构建输出，不需要更新 static 基线。本轮已取得新的预检与同项目双连接真实证据；最终提交仍需完整扩展流程，单次成功不能证明间歇性的主包就绪超时已消除。

## 规则评估

不新增 AGENTS。修正原测试中「启动失败由外层再次关闭」的错误假设，用 Launcher 组合回归与独立证据目录固定责任边界。
