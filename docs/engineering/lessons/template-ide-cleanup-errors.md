---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ce4a58bad6bf286891a2fed7db21e8950dd97ece
regressions:
  - e2e/template-ide-session.test.ts
  - e2e/template-ide-project-config.test.ts
  - e2e/ide-project-cleanup.test.ts
  - e2e/wechat-automator.test.ts
  - e2e/wechat-service.test.ts
  - e2e/wechat-session-boundary.test.ts
---

# 模板 IDE 收尾保留首次失败

## 症状

2026-10-04 全面流程在模板 IDE 的首个 mpx 项目失败，终端只显示微信服务已被阻断，堆栈落在项目关闭处。本轮 `templates-ide/mpx-tailwindcss-v4/error.txt` 已先记录 `auto 失败（HTTP 500）`，说明这不是首次失败。

主流程另行读取的微信 IDE 日志显示，10:05:14.197 的 `formatProject` 拒绝了同一本轮项目的 `touristappid`。该 AppID 选择问题由统一授权 AppID 修复处理。本记录聚焦异常传播，不把清理失败或之后读取到的 `login=true` 解释成退出登录。

## 根因与纠正

模板用例的 `finally` 直接等待项目关闭。`auto` 失败后，服务边界按设计拒绝后续请求，关闭步骤再次抛错，覆盖了原 HTTP 500。同样的问题存在于临时 AppID 配置恢复、连接断开后的 HTTP 清理，以及 launcher readiness 失败后的连接释放。

模板会话现在由 `e2e/template-ide/session.ts` 持有连接。执行、诊断与关闭复用 `runWithCleanup`：只有一次失败时抛出原对象，多次失败时保留 `AggregateError.errors` 和 `cause`。诊断文件展开堆栈及原因链，失败截图设置显式超时；写诊断或截图失败也不会阻止后续收尾。未取得连接时不请求截图。

配置恢复继续核对本轮写入内容，不覆盖并发修改；冲突与原执行失败共同保留。项目清理等待同步或异步断开，再尝试原绑定服务的项目关闭。服务 blocked 策略、登录态保护、拒绝重试与项目归属均保持原语义。

模板调用方同时接入已有 `resolveWechatAppId()`，供并行的 AppID 绑定修复统一模板与预检选择；本次不修改该解析器的规则。

## 验证

先为三个既有边界增加回归，在修改实现前得到 4 个预期失败：原实现都只留下最后一次清理错误。修改后执行：

```sh
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-ide-session.test.ts e2e/template-ide-project-config.test.ts e2e/ide-project-cleanup.test.ts e2e/wechat-automator.test.ts e2e/wechat-service.test.ts e2e/wechat-session-boundary.test.ts --update=none
```

6 个文件、73 项通过。回归覆盖执行、诊断写入、失败截图、项目关闭及配置恢复同时失败，也覆盖本地 HTTP stub 返回 500 后，blocked 收尾不得发送第二次网络请求。诊断写入失败使用真实临时目录模拟，配置恢复冲突使用真实文件模拟；所有 AppID 均为合成测试值。

## 适用边界

本次只验证测试编排与资源生命周期，没有启动真实 IDE、模拟器或浏览器，没有修改 demo 样式或 static 基线。实际模板 IDE 验收须在集成 AppID 修复后使用新预检报告执行。保护首因不会使原 HTTP 500 自动变成成功。

## 规则评估

不新增 AGENTS 规则。已有登录态保护、资源归属、首次失败诊断和定向回归要求足够；补齐可执行回归比增加重复规范更直接。
