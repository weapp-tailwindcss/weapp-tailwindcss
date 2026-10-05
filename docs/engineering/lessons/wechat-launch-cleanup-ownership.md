---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 7e593089398056b38d84656dc7583bacf6ff5608
regressions:
  - e2e/wechat-automator.test.ts
  - e2e/template-ide-session.test.ts
  - e2e/framework-ide-project-lifecycle.test.ts
  - e2e/ide-project-cleanup.test.ts
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

## 验证

- 新增真实 Launcher 与模板/框架/视觉包装层的三项组合回归，修复前全部失败，分别观察到二次清理错误聚合或首因被覆盖。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/wechat-automator.test.ts e2e/template-ide-session.test.ts e2e/framework-ide-project-lifecycle.test.ts e2e/ide-project-cleanup.test.ts e2e/wechat-service.test.ts e2e/wechat-session-boundary.test.ts --update=none`：6 文件、83 项通过，涵盖真实本地 HTTP 错误、会话操作白名单及并发服务租约。
- 模板证据回归验证旧成功文件保持原样，新失败目录只有当次错误；启动层已有的聚合错误按原对象和层级保留。
- 测试资源使用独立临时目录，HTTP fixture 的租约文件也限定在本例目录并收尾。

## 适用边界

未启动或重启微信 IDE，未操作账号、票据或会话缓存。原生日志只归档本轮窗口的已审查行，不复制账号字段。没有修改模板或 demo 的样式源码与构建输出，不需要更新 static 基线。本轮清理修复仍需新的预检与真实 IDE 验证，单测不能替代主包就绪和运行截图。

## 规则评估

不新增 AGENTS。修正原测试中「启动失败由外层再次关闭」的错误假设，用 Launcher 组合回归与独立证据目录固定责任边界。
