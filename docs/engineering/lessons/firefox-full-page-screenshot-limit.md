---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 49b48d65acee7bf3d01c33e1ecf293b0f18ce163
regressions:
  - website/tests/full-page-capture.spec.ts
  - website/tests/full-page-snapshot.spec.ts
---

# Firefox 超长整页截图的协议边界

## 症状

本地文档站的 Firefox 页面高度达到 44512 CSS 像素时，原生整页截图立即报错 `Cannot take screenshot larger than 32767`。`toHaveScreenshot` 持续重试，最终表现为 60 秒截图超时；随后页面关闭或评估失败属于次生错误。320×33001 的独立真实页面同样复现协议错误，说明增加页面就绪等待无法修复尺寸限制。

## 根因与纠正

仅 Firefox 且文档任一维度大于 32767 时，使用公开 `page.screenshot` 的文档坐标 clip，以不超过 16000×16000 的分片覆盖完整二维图像。保持 `fullPage: true`，不滚动、不修改视口、DPR、页面样式或截图缩放；每张分片明确使用 PNG、CSS 像素、关闭动画及隐藏光标，并检查解码后的分片尺寸。逐行复制 RGBA 数据，保留最后的不满尺寸分片。

一份样本的前后几何信息必须一致；捕获中尺寸变化，包括缩小至后续 clip 完全越界，均丢弃整份样本重采。无法复核几何时保留最初截图错误，共享截止时间耗尽则明确报告预算错误。至少两份连续完整图像的尺寸及全部 RGBA 字节完全相等后，才编码最终 PNG。所有分片、重采和编码共用最多 60 秒的绝对截止时间，每次截图只领取剩余时间。

最终只调用一次 `toMatchSnapshot({ maxDiffPixels: 5 })`，5 像素门槛作用于整张图。沿用 Playwright 原生匿名 PNG 命名及共享序号，不在稳定采样中调用快照 matcher。通过公开 `snapshotPath` 比较 screenshot 和 snapshot 两种模板；配置分化时明确拒绝，避免静默创建另一套基线。普通尺寸 Firefox 及所有 Chromium、WebKit 页面继续使用原生 `toHaveScreenshot({ fullPage: true })`。

## 验证

环境为 macOS、Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，浏览器均为 headless。定向命令为：

```sh
CI=1 pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts full-page-capture.spec.ts full-page-snapshot.spec.ts --reporter line --retries 0 --max-failures 2
pnpm --filter @weapp-tailwindcss/website typecheck
pnpm exec eslint website/tests/full-page-capture.spec.ts website/tests/full-page-snapshot.spec.ts website/tests/helpers/full-page/*.ts website/tests/index.spec.ts
pnpm agents:check
```

最终 Chromium、Firefox、WebKit 共 27 项通过，耗时 53.4 秒；ESLint、website 类型检查、AGENTS 检查及 diff 检查通过。未运行完整网站路由矩阵或多端全面测试。

- 高度和宽度分别超过 32767，覆盖分片两侧、首尾像素及不满尺寸尾片；视口、滚动位置和 DPR 不变。
- 正常页面强制小分片，包含 fixed、sticky 和 iframe 内容，验证与同浏览器原生截图的全部 RGBA 字节相等。
- 动态缩小文档后丢弃旧样本；内容在完整采样之间改变时至少再取得两份相同样本；悬挂分片不重新领取超时预算；截断分片明确失败；几何复核也失败时保留截图首错。
- 隔离临时目录中的真实 Playwright CLI 先由原生截图创建三份匿名 PNG，再使用新入口比较。原文件名、序号和 PNG 字节保持不变；位于不同分片的总计 5 个黑色像素通过，第 6 个像素失败。另验证模板分化拒绝，以及正常分支不会调用分片截图。
- 渐变裁剪可能出现单通道 1 级的后端栅格舍入差异；一次 Firefox 127 像素分片实测为 3 个像素。严格位置用例采用纯色块隔离布局语义，同时保留同浏览器原生渐变与分片结果的实际 PNG 比较回归，沿用默认 threshold 0.2 和整图 `maxDiffPixels: 5`。

临时 CLI 的 expected、结果和配置只写入 `os.tmpdir()` 下本轮目录；结束时释放命令及测试浏览器，再删除目录，不更新仓库 canonical PNG。类型检查需要先构建 cva、merge、variants 及其工作区依赖。

## 适用边界

这是测试截图采集层的协议修复，不改变文档产品、路由、浏览器项目、页面数量、视口或既有截图门槛，不更新 static 产物或公开包 change intent。WebKit 的同一长页原生截图可成功，不应因此扩大分片入口。定向回归通过仅证明截图边界与比较契约，全面矩阵仍需按本轮多端预检及完整验收入口另行完成。

## 规则评估

不新增 AGENTS。通过真实浏览器的尺寸、像素、生命周期及真实 CLI 命名回归固定边界；不使用 Playwright 私有 API，也不通过缩短页面、改变缩放或逐片比较降低验收要求。
