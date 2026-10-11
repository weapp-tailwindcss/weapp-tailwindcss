---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 791b6f925845568df573d77f36a8ea224090661e
regressions:
  - scripts/ci/demo-matrix/browser.test.mjs
  - scripts/ci/demo-matrix/browser-navigation.test.mjs
  - scripts/ci/demo-matrix/browser-connection.test.mjs
  - scripts/ci/demo-matrix/browser-readiness.test.mjs
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
