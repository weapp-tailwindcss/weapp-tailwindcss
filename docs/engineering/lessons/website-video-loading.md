---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: b071f00ce06ab6f6af716a81c33d509769fe11ce
regressions:
  - website/tests/video-loading.spec.ts
  - website/scripts/seo-geo.test.mjs
---

# 文档视频的主动加载边界

## 症状

Taro、uni-app Vite 的中英文文档直接包含第三方播放器 iframe。打开文档就会加载播放器，即使读者尚未滚动到视频演示。

真实 Taro 页面的一次有界诊断中，源码等价的请求集合镜像在 60 秒内未就绪，原生 `networkidle` 在 55 秒内未就绪；当时均记录到当前 iframe 内未结束的 MP4 `other` 请求，HTTP 状态为 206。iframe 只提交一次，未发生 detach；主页面已 hydration，`fonts.status` 为 `loaded`。该诊断未直接读取 Playwright 内部 inflight 集合，也未单独等待 `fonts.ready`，不能据此断言媒体请求是全部超时的唯一原因。

## 根因与纠正

产品文档把第三方播放器的加载放在了首次阅读路径。修复在四份文档中加入本地化的原生 `details` / `summary` 入口，并为原 iframe 设置 `loading="lazy"` 和本地化标题。浏览器在用户展开后加载播放器；原视频的 `aid`、`bvid`、`cid`、`p`、`autoplay=0` 与全屏能力保留。

入口外提供标准 Markdown 视频链接，关闭 JavaScript 时仍可访问。初版曾用原始 HTML `<p><a>` 编写外链；实际 `docusaurus-plugin-llms@0.6.1` 导出只留下链接文案，丢失地址，因此改为 Markdown，并用真实导出处理器固定回归。

早期曾怀疑旧 iframe 的请求残留。Playwright 1.64.1 的实现会在 frame 提交和分离时维护其原生请求状态，而本次真实诊断没有出现该生命周期。因此没有修改导航 helper 的请求排除、空闲窗口、超时、截图阈值或已有断言。

测试夹具也经历了三项纠正：Playwright 转译环境不接受该辅助文件中的 `import.meta`；测试目录应从 `testInfo.project.testDir` 获取；`server.close` 回调可能早于 socket / response 的 `close` 事件。前两项启动错误与最后一项清理错误分别保留，不作为产品回归证据。最终清理显式等待所有本任务资源关闭，同时保留行为失败、服务运行错误和清理失败。

## 验证

环境为 macOS、Node.js 24.18.0、pnpm 12.9.1、Playwright 1.64.1，所有浏览器均以 headless 模式运行，重试为 0。

受控网络夹具读取四份真实文档的视频段，只将播放器 origin 改为另一真实 HTTP origin。播放器请求一个保留未完成 body 的 HTTP 206 响应。原文档在 Chromium、Firefox、WebKit 共 12 项中全部于初始请求断言失败：均出现 `/player.html`、`/stream.mp4` 和一个未完成流。修复后的同一加载回归覆盖首次读取、滚动到入口、整页截图及截图后的负观察窗口，只有键盘 Enter 展开后才创建播放器请求；持续响应仍会让原生 `networkidle` 超时。

无 JavaScript 的 12 项回归读取四个真实站点路由，验证本地化视频链接可见且指向原视频。LLM 处理器回归先恢复初版 HTML 链接，得到新增 4 项失败、原有 10 项通过；恢复 Markdown 链接后验证相同断言。

定向命令：

```sh
pnpm --filter @weapp-tailwindcss/website build
pnpm --filter @weapp-tailwindcss/website exec playwright test tests/video-loading.spec.ts --config scripts/local-worker/playwright.config.mts --retries=0 --workers=1 --reporter=line,json
pnpm exec vitest run website/scripts/seo-geo.test.mjs --update=none
pnpm --filter @weapp-tailwindcss/website typecheck
pnpm exec eslint website/tests/video-loading.spec.ts website/tests/helpers/video-fixture.ts website/scripts/seo-geo.test.mjs
pnpm agents:check
```

最终 24 项浏览器回归全部通过，跳过、意外失败与重试均为 0；SEO / LLM 处理器测试 14 项通过，站点双语构建、类型检查、定向 ESLint 与规则检查通过。验证时包含尚未提交的本任务改动，不将基线 SHA 当作含修复的提交。

站点测试的 `PLAYWRIGHT_BASE_URL` 由仓库 `withLocalWorker` 绑定本轮构建。在真实四路由上另外验证了 MDX / Docusaurus Details 的键盘展开：首次阅读和整页截图后均为零播放器请求，Enter 后各出现一个保留原视频参数的请求，受控 iframe 内按钮可交互。静态 `.md` 与中英文 `llms-full.txt` / `llms-quickstart.txt` 均保留对应链接。实际 iframe 响应由浏览器 route 提供受控内容，不代表第三方真实媒体播放。初次额外验证脚本的相对 locator 写法错误，修正后仅重跑该四路由检查，没有重复已通过的 24 项回归。

独立 Worker、浏览器、context、HTTP 服务与 socket 在结束后关闭，Worker 端口确认返回 `ECONNREFUSED`。完整网站截图基线及全仓验收由主任务执行，不把生成基线记为严格对照通过。

## 适用边界

受控网络夹具验证真实文档片段的 HTML 加载边界，不包含 MDX 与站点主题样式。模拟播放器的按钮只证明 iframe 内交互可以完成，不证明哔哩哔哩真实媒体的解码、播放或网络可用性。无 JavaScript 验证只要求普通视频链接可使用。

已展开播放器继续保留原网络行为；折叠入口不负责卸载已经加载的第三方播放器。这里只改变文档站的媒体入口，不改变公开包行为，不需要 change intent。

## 规则评估

不新增 AGENTS 规则。沿用现有根因回归、真实构建验证、截图基线与资源归属边界，并通过持久测试防止加载和导出行为回退。
