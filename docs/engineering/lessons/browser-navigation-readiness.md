---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 791b6f925845568df573d77f36a8ea224090661e
regressions:
  - scripts/ci/demo-matrix/browser.test.mjs
  - scripts/ci/demo-matrix/browser-navigation.test.mjs
  - scripts/ci/demo-matrix/browser-connection.test.mjs
  - scripts/ci/demo-matrix/browser-readiness.test.mjs
  - scripts/ci/demo-matrix/process-poll.test.mjs
---

# 浏览器启动导航和当前文档就绪应分开判断

## 症状

[Windows Node 24 CI](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37304749753/job/111745623668) 的 demo 编排单测期望开发重载产生两次文档请求，实际出现三次。该任务还未执行后续 demo HMR，不应将其表述为 Taro 业务回归。

## 根因与纠正

启动逻辑把等待 DOMContentLoaded 的 `page.goto` 放在轮询重试中。开发服务器已成功返回主文档后，页面自身重载仍可能中断首次导航；重试会再次主动导航，与页面自己的重载争用。现在初始导航及唯一一次模块传输恢复只等待 commit，已观察成功主文档响应后停止主动导航；文档的 load、HTTP、模块下载、HMR 握手及更新 idle 仍由后续门禁验证。首次连接断开仍可重试，404 不会因同地址 hash 导航返回空响应而放行。

审查发现另一处观察空窗：最后一次异步 idle 查询之前就完成了文档版本、HTTP 和连接检查，查询返回前若切换文档，会带着旧状态返回成功。现在所有最终同步检查都在最后一次 await 之后。

## 验证

- 成功响应后注入首次导航中断：修复前普通地址与 hash 地址两项失败；修复后只发起一次主动导航。200/404 均使用真实 Chromium HTTP 响应。
- 无外部脚本的替换文档在真实 idle 查询之后完成导航：200/404 两项在修复前均错误放行，修复后拒绝旧状态；测试外部核对实际导航状态码，避免把导航本身失败当成有效复现。
- 真实页面通过请求屏障触发重载，覆盖 DOMContentLoaded 尚未完成及 hash 地址；此用例在本机旧实现也通过，不能宣称单靠它复现了 Windows 原始时序。
- 首次主文档连接被服务端中断后可恢复，保留本地脚本执行及 HMR 握手断言；所有浏览器均为 headless，并在 finally 释放自己创建的资源。

`CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/browser.test.mjs scripts/ci/demo-matrix/browser-navigation.test.mjs scripts/ci/demo-matrix/browser-connection.test.mjs scripts/ci/demo-matrix/browser-readiness.test.mjs --update=none`：4 文件、14 项通过。ESLint 与 diff 检查通过。

首次扩展验证 `CI=1 pnpm test:demo:matrix` 为 36 文件、238 项通过；补入文档就绪回归后为 239 项通过、1 项 Rollup 取消后重新订阅用例超时，另行定位该首次失败。保留 `.tmp/ci-audit/browser-navigation-before.log`、`browser-readiness-before-isolated.log`、`browser-matrix-final.log` 与 `browser-final-targeted.log`，不将定向通过替代整个矩阵通过。

## 适用边界

仅修复测试浏览器的导航和就绪生命周期，不调整业务产物、性能阈值、轮询期限或模块恢复次数。无需更新 static 基线或公开包 change intent。Windows 当前提交验收仍以 CI 为准；本地完整多端验收需重新预检。

## 规则评估

不新增 AGENTS。用真实浏览器与明确屏障固定异步边界，保留首次失败及未复现的限制。

## PR #1316：保留轮询终止前的首因和浏览器状态

[Windows Node 24 run `40266549349`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40266549349/job/121390106969) 在 head `5240e401d422ef5e9700a4007422d76fd2124811` 的单测阶段失败。200 + hash 用例在 20 秒期限结束时抛出数字 deadline 断言，尚未进入实际 Taro demo watch。同样四项在本机原实现均通过，不能据此声称复现或修复了 Windows 的页面就绪问题。

可确定的诊断缺陷是：`until` 在重试捕获区外调用 `ensureRunning`，会话终止会直接覆盖最后一次就绪断言；浏览器错误、HTML 和截图又保存在测试结束即删除的临时目录中。因此 CI 只剩期限断言，无法区分 HTTP、模块下载、load、更新 idle 或连接握手的首次偏离。

现在会话终止仍立即失败，不继续重试；若已有就绪错误，则以 `AggregateError` 保留终止错误和最后一次就绪错误的原对象，并将最后断言及会话日志写入消息。首次检查前退出继续原样抛出原错误。浏览器启动失败在错误链中附加文档版本、当前 URL/HTTP、待完成模块、握手、恢复次数及页面事件；各项证据写入和关闭逐项执行，次要错误也进入最终消息，兼容只保存 `error.stack` 的矩阵结果。证据目录不存在不能阻止浏览器释放。

验证基于 `5240e40` 加本节对应补丁：新增轮询与错误状态断言在旧实现出现三项预期失败；修复后定向组为 7 文件、35 项通过，四个脚本的严格 ESLint 通过。命令为：

```sh
CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/process-poll.test.mjs scripts/ci/demo-matrix/endpoint.test.mjs scripts/ci/demo-matrix/browser.test.mjs scripts/ci/demo-matrix/browser-navigation.test.mjs scripts/ci/demo-matrix/browser-connection.test.mjs scripts/ci/demo-matrix/browser-readiness.test.mjs scripts/ci/demo-matrix/browser-hydration.test.mjs --update=none --maxWorkers=1
```

新增缺失证据目录用例保留实际 `ENOENT`，并在测试兜底关闭之前核对本次所有 Chromium 均已断开。原 HTTP、导航次数和 HMR 握手断言保留；没有改变超时、轮询间隔、恢复次数或产品源码。Windows 当前失败的根因仍待带完整错误链的新证据，不能将这次诊断修复当作业务或性能验收通过。不新增规则，也不调整 static 基线或公开包 change intent。
