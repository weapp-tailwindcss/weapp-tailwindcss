---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1172
baseline: a5d25c2ad823077b06aa60b8921013044c6fefd4
regressions:
  - scripts/ci/demo-matrix/browser-navigation.test.mjs
  - scripts/ci/demo-matrix/browser.test.mjs
---

# 开发重载后的 hash 导航判定

## 症状

PR Gate 的 macOS Node 24 `style-injector-taro-vite-react:h5` 停在首次 `page.goto` 校验。
[失败任务](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34255683684/job/102162604494)
包含 `net::ERR_ABORTED` 和 Vite 依赖预构建触发的重载。失败截图已显示本轮探针和样式，
但导航循环始终把 `null` 响应当作 HTTP 失败。

## 根因与纠正

Playwright 对同地址的 hash 导航不发送新的主文档请求，`goto` 返回 `null`。
开发服务器重载中断首次导航后，重复 `goto` 可以落入这种正常语义，不能要求每次导航都产生 HTTP 响应。

入口现在按主框架请求维护当前文档响应。只有返回值为 `null`、页面仍处于精确目标 URL、
已观察主文档 URL 与目标去除 hash 后一致且 HTTP 成功时，才接受该次导航。
新主文档请求立即清空旧响应，HTTP 404 不会借用旧成功状态。后续探针、模块加载和开发连接检查照常执行。

## 验证

新增回归使用真实 Vite 和 Chromium，只注入 CI 已观察到的首次导航中断；随后实际 `goto` 返回 `null`。
修复前成功文档用例因导航循环超时而失败，修复后通过，并验证只有一次主文档请求。
对应 HTTP 404 用例仍被拒绝。`CI=1 pnpm test:demo:matrix`：10 个文件、43 项通过。

`CI=1 pnpm e2e:demo:matrix style-injector-taro-vite-react:h5` 本地通过生产构建与既有 static 基线校验，
以及 initial、replace、add、restore 和刷新。没有修改 demo、样式 fixture 或基线。
原始日志保存在忽略目录 `e2e/.artifacts/verify-1170-1144/style-injector-macos-local.log`。

## 适用边界

本修正处理测试入口的导航状态，不改变开发服务器、路由、CSS 或 HMR 转换行为。
HTTP 错误、缺失探针和未建立开发连接仍会失败。最新提交的远端矩阵需另行验证。

## 规则评估

不新增 AGENTS 规则，以真实浏览器回归约束主文档与 hash 路由的边界。
