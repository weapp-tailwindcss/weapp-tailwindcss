---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 5d141ab6b470440da2d602fcdc150bd1cfae9bb2
regressions:
  - website/tests/navigation-readiness.spec.ts
---

# 网站截图与统计上报的同步边界

## 症状

全量网站验收包含 1204 次实际执行的路由截图。移动 Chromium 的 `/`、`/blog`、`/docs/ai` 导航分别耗时 11118.201ms、10999.410ms、11092.535ms，截图本身通常只需数百毫秒。

本轮 trace 证实：页面加载后，`https://www.google-analytics.com/g/collect` 的 `fetch` 持续约 10006–10016ms，随后以 `net::ERR_CONNECTION_CLOSED` 失败；备用 `https://www.google.com/g/collect` 返回 204，原 `networkidle` 又等待约 500ms 才返回。重复延迟来自不改变页面内容的统计上报。

另一次 WebKit 首次导航在 60 秒超时；其重试耗时 20727.997ms。重试的晚到 GA preconnect 日志、请求等待阶段与 500ms 空闲尾部吻合，但现有 HAR 没有保存绝对请求完成时间，不能精确还原全部在途请求。root 到 `/zh-cn/` 的客户端跳转约在第 22ms 开始。不能把首次 60 秒超时或重试全部耗时都直接归因于某个尚未定位的网络层。

## 根因与纠正

`networkidle` 把不可见的统计报告纳入页面就绪条件，导致视觉和交互验收等待与其目标无关的请求。共享测试导航函数保留全部请求等待，只排除主 frame 中、资源类型为 `fetch`、HTTPS origin 严格为上述两个 Google 地址、路径严格为 `/g/collect` 的报告请求。查询参数保持原样，请求照常发送和完成，不拦截、不伪造、不取消产品请求。

业务数据、远端脚本、图片、字体与 iframe 的全部请求继续等待，最后仍需连续 500ms 空闲。主文档必须成功返回，并出现 Docusaurus 的真实 `data-has-hydrated="true"` 标记，字体也须就绪。Docusaurus 3.10.2 的该标记来自 `BrowserContextProvider` 完成 hydration 后的 effect，并非静态 HTML 常量。

主 frame 开始新文档请求时切换请求代际，防止语言重定向前的请求、响应或 abort 污染最终文档；最终文档的失败与 HTTP 500 必须报错。所有临时事件监听器均在 `finally` 移除。刷新复用相同边界。

## 验证

先以原 `page.goto(..., { waitUntil: 'networkidle' })` 运行真实 Chromium fixture：本地 CSS 与脚本释放后，统计请求仍挂起，新增的 2 秒就绪断言失败。接入新函数后，13 种 fixture 在 Chromium、Firefox、WebKit 共 39 项通过，验证了本地 CSS/JS 阻塞、真实计算样式与按钮交互、统计请求持续挂起时的就绪、同页 `networkidle` 仍超时、远端业务数据、相似 host/path/port、非 fetch 脚本、iframe 文档与内部 fetch、初始及重定向后的 500、语言重定向和监听器清理。

定向命令：

```sh
pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts navigation-readiness.spec.ts --reporter line --max-failures 1
pnpm --filter @weapp-tailwindcss/website typecheck
pnpm agents:check
```

测试只替换 `index.spec.ts` 与 `showcase.spec.ts` 原有的 `networkidle` 导航及刷新入口。原来的路由、浏览器、viewport、功能与几何断言、完整页面截图、60 秒 test/expect、5 像素差异阈值、worker 数及整体预算均保持不变。没有产品补丁或视觉基线更新；全量截图对照和全仓验收仍须另行完成，生成基线不能当作严格对照通过。

## 适用边界

只解决网站私有测试的同步边界，不涉及公开包行为，不新增 change intent。未来统计 endpoint、资源类型或 Docusaurus hydration 协议变化时，必须重新检查真实浏览器证据并补回归，不能扩大为忽略全部外部请求。

## 规则评估

未新增 AGENTS，沿用既有环境预检与快照门禁。
