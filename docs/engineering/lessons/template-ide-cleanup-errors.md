---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 3ac230d8fc0a8d496501689c47f8ec83f2e24fdf
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

集成首轮修复后，新预检 `abb711a6-86ed-47a8-aace-59ca6c61c31c` 的 MPX 模板运行通过，Taro Vite 模板则出现渲染查询超时和项目关闭超时。目录有 `error.txt` 而无 `failure.png`；终端只显示一个内层聚合错误及其渲染首因，随后显示关闭错误。这不表示截图成功，也不能据此判定页面样式缺失。

## 根因与纠正

模板用例的 `finally` 直接等待项目关闭。`auto` 失败后，服务边界按设计拒绝后续请求，关闭步骤再次抛错，覆盖了原 HTTP 500。同样的问题存在于临时 AppID 配置恢复、连接断开后的 HTTP 清理，以及 launcher readiness 失败后的连接释放。

模板会话现在由 `e2e/template-ide/session.ts` 持有连接。执行、诊断与关闭复用 `runWithCleanup`：只有一次失败时抛出原对象，多次失败时保留 `AggregateError.errors` 和 `cause`。诊断文件展开堆栈及原因链，失败截图设置显式超时；写诊断或截图失败也不会阻止后续收尾。未取得连接时不请求截图。

配置恢复继续核对本轮写入内容，不覆盖并发修改；冲突与原执行失败共同保留。项目清理等待同步或异步断开，再尝试原绑定服务的项目关闭。服务 blocked 策略、登录态保护、拒绝重试与项目归属均保持原语义。

模板调用方同时接入已有 `resolveWechatAppId()`，供并行的 AppID 绑定修复统一模板与预检选择；本次不修改该解析器的规则。

后续调查发现持久化边界仍不完整：`error.txt` 在失败截图与项目关闭之前写入，只包含执行首因。Vitest 5.0.3 的任务失败处理仅展开最外层 `AggregateError.errors`，默认报告器只递归打印 `cause`，不会展示内层 `errors`；因此截图次因虽然保存在错误对象里，仍无法从报告文件和默认终端输出读到。SDK 1.2.22 的 `screenshot({ path, timeout })` 会等待文件写入成功，参数本身没有问题。

会话出口现在等待诊断和项目关闭完成，再用 `formatWorkflowError` 更新报告，保存完整聚合链。落盘成功后继续抛出同一会话错误；落盘本身失败时，将写入错误与原会话错误聚合，保留原对象、层级和 `cause`，不重复截图或关闭。截图前的首因记录继续保留，便于后续步骤中断时定位最早失败。

## 验证

先为三个既有边界增加回归，在修改实现前得到 4 个预期失败：原实现都只留下最后一次清理错误。修改后执行：

```sh
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-ide-session.test.ts e2e/template-ide-project-config.test.ts e2e/ide-project-cleanup.test.ts e2e/wechat-automator.test.ts e2e/wechat-service.test.ts e2e/wechat-session-boundary.test.ts --update=none
```

6 个文件、73 项通过。回归覆盖执行、诊断写入、失败截图、项目关闭及配置恢复同时失败，也覆盖本地 HTTP stub 返回 500 后，blocked 收尾不得发送第二次网络请求。诊断写入失败使用真实临时目录模拟，配置恢复冲突使用真实文件模拟；所有 AppID 均为合成测试值。

最终诊断修复基于 `3ac230d8f`。先补回归得到 3 个预期失败：主体成功而关闭失败时没有报告，多次失败时报告仅包含渲染首因，最终持久化错误没有进入错误链。修改会话出口后执行：

```sh
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-ide-session.test.ts e2e/template-ide-project-config.test.ts e2e/wechat-session-boundary.test.ts --update=none
```

3 个文件、21 项通过。新增回归检查最终文件包含渲染、截图、关闭错误及各自堆栈；通过真实文件系统制造最终报告写入失败，验证全部原错误对象与因果仍在，截图和关闭各执行一次。成功会话在新目录中不创建错误报告。定向严格类型检查通过。

## 适用边界

本次只验证测试编排与资源生命周期，没有启动真实 IDE、模拟器或浏览器，没有修改 demo 样式或 static 基线。实际模板 IDE 验收须在集成 AppID 修复后使用新预检报告执行。保护首因不会使原 HTTP 500 自动变成成功。

最终报告属于会话边界：外层 `withTemplateAppId` 在会话结束后恢复配置，其恢复冲突仍由外层错误链传递，不包含在本文件中。按模板复用的历史产物目录可能留下先前运行的 `error.txt`；成功流程不写入或删除它，验收应同时核对本轮日志和文件时间。最终落盘无法还原旧运行已经缺失的截图异常文本，也不代表已修复 Taro 的真实 IDE 协议超时。

## 规则评估

不新增 AGENTS 规则。已有登录态保护、资源归属、首次失败诊断和定向回归要求足够；补齐可执行回归比增加重复规范更直接。
