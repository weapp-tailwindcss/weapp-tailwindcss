---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 6ebc4cbe9f42238fcc2a7106527ec74b5114949f
regressions:
  - website/tests/navigation-document.spec.ts
  - website/tests/navigation-cache.spec.ts
  - website/tests/navigation-readiness.spec.ts
  - website/tests/visual-context.spec.ts
  - website/tests/index.spec.ts
verification:
  - claim: WebKit 两类真实缓存往返在原 helper 上均重现 HTTP 304 误拒绝
    kind: integration
    status: passed
    sha: 6ebc4cbe9f42238fcc2a7106527ec74b5114949f
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含新增未提交回归、原 helper，headless、CI=1
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test tests/navigation-document.spec.ts --project=webkit --grep "two round trips" --retries=0 --trace=on --update-snapshots=none
  - claim: 原导航与视觉合同连同新增缓存边界共 104 项通过，28 项 WebKit 专属边界声明在另两浏览器按原因跳过
    kind: integration
    status: passed
    sha: 6ebc4cbe9f42238fcc2a7106527ec74b5114949f
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含本记录对应的未提交修复，headless、CI=1
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/navigation-document.spec.ts tests/navigation-readiness.spec.ts tests/navigation-cache.spec.ts tests/visual-context.spec.ts --project=chromium --project=firefox --project=webkit --retries=0 --update-snapshots=none --reporter=line,json --trace=on
  - claim: 真实本地 Worker 上的三浏览器首页完整功能组与三张既有黄金截图共 75 项通过、6 项原有跳过、0 失败
    kind: integration
    status: passed
    sha: 6ebc4cbe9f42238fcc2a7106527ec74b5114949f
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含本记录对应的未提交修复，headless、CI=1、重试 0、快照更新 none
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/index.spec.ts --project=chromium --project=firefox --project=webkit --grep "homepage hero layout|homepage locale detection|mobile navbar sidebar|color mode transition strategy|desktop viewport desktop / screenshot" --retries=0 --update-snapshots=none --reporter=line,json --trace=on
  - claim: 最终候选仍须通过本轮预检后重新完成全部扩展矩阵
    kind: integration
    status: pending
    sha: 6ebc4cbe9f42238fcc2a7106527ec74b5114949f
    environment: macOS arm64，本地扩展全端矩阵
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <本轮报告>
    reason: 本记录为私有网站测试工具的定向修复，定向通过不能替代最终同提交全流程验收
---

# WebKit 缓存表示与当前文档证据

## 症状

扩展验收 `eb070837-e48d-4563-b9d4-f3be9a74e6aa` 前 23 阶段通过，网站阶段的 React Native、Lynx 本地化链接用例在 WebKit 连续三个 attempt 报 HTTP 304。第一次首页是真实 200；点击链接由 History API 改变路由，再 `goto` 返回首页时，WebKit 暴露网络层 304。

[前轮最终文档修复](website-document-navigation-evidence.md)的刷新回归中 WebKit 返回 200，没有覆盖离开后重访缓存页。新增真实 HTTP fixture 的客户端路由、实际离开两类往返在原 helper 上均失败，保留两份 trace，不能把此前 75 项通过扩大为所有缓存路径都已覆盖。

## 根因与纠正

WebKit 重验证后的新 Document 已正确解析缓存 HTML 并完成 hydration，但 `PerformanceNavigationTiming.responseStatus` 不存在，`decodedBodySize` 为 0；实际 `deliveryType` 为 `cache`。Firefox 则提供合并后的 2xx 状态及非零正文。不能按缺字段直接放行，也不能把所有 304 当成功。Playwright 对全部 300–399 禁止读取 `Response.body()`，所以不能从当前 304 API 补取正文。

HTTP 表示来源与当前文档运行时应分别证明。每个 Page 用 WeakMap 保存本辅助函数观察到的主 frame GET 来源：成功完整 2xx、requestfinished 且未 requestfailed、原始正文非空并保留 SHA-256 摘要、合法 ETag、允许存储的缓存策略及 Vary 请求字段值。206、Content-Range、no-store、Vary 星号与取不到原正文的响应不提供来源；新的不可存储响应撤销同 URL 旧来源。全部来源只在当前导航整体通过后提交。

语言跳转的中间文档可以在旧运行时尚未 hydration 时完成 HTTP 响应。首版仅保存最终 ready 文档的方案，在真实首页完整功能组中得到 74 通过、6 原有跳过、1 失败：从中文切回英文时，根英文文档早已作为中间 200 缓存，却没有进入账本。修复因此按完整 HTTP 来源记账；旧中间文档的 runtime、身份或资源集合不替代当前文档。

缺少 Firefox 合并性能记录的 304，另须证明当前浏览器使用缓存、来源 URL 精确匹配、本轮请求 If-None-Match、响应 ETag 与来源 ETag 三方一致，并保持 Vary 身份。304 可省略 Vary 沿用来源；重新声明不同字段或请求值变化均拒绝。原有当前新 Document 身份、同 URL、commit、finished、代际、hydration、字体和非统计资源连续 500ms 空闲门禁全部保留。Firefox 的有效合并性能证据路径保持不变。

新增异步元数据读取后，先复核导航代际再使用成功或失败结果，避免旧 304 缺证误拒绝其间已经开始的新导航。ready 路径复用已验收 proof；HTTP 来源读取结束后再核对 Document 身份、URL、代际、ready、资源和空闲条件，最后同步提交账本。所有五类监听器仍在 finally 移除。

## 验证

真实来源探针记录中间 `/locale` 200 的 requestfinished、`Response.finished() === null` 与完整 329 字节原正文摘要。最终 `/locale` 304 的 If-None-Match、ETag 匹配、deliveryType 为 cache，且 Document 身份与先前最终 `/ready` 文档不同；截图、运行时和原始响应记录均保留。

新增负例保留无缓存 304、伪 hydration、HTTP 500、请求失败、旧 Document 与未知来源边界，并补充未完成中间响应、部分表示、Vary、validator 缺失或错配、同 context 其他 Page 的来源隔离。Page 隔离用例初稿错误假设新 Page 首次请求必为 304，真实 trace 显示 200；修正为先在该 Page 以外部导航建立缓存，再验证其不能借用另一 Page 的 helper 来源，原失败证据保留。

三浏览器原导航与视觉合同、两轮缓存往返及新增边界共 132 项声明，真实结果 104 通过、28 跳过、0 失败；28 跳过来自 14 种缺失合并性能记录的 WebKit 专属边界用例在另两浏览器不适用，原有 75 项导航和 3 项视觉合同均继续执行，重试 0、快照更新 none。

增加首页两循环后，另轮完整功能组在 Chromium 暴露测试设置竞态：上一轮 SPA 路由刚改 URL，Layout 的 locale 持久化 effect 尚可能回写；直接把 localStorage 改为下一轮中文并不等于完成语言切换。该轮 74 通过、6 原有跳过、1 失败的原始回执保留。两个方向均改用已有真实语言下拉链接，其捕获阶段写入导航意图，根页 bootstrap 消费该意图；保留精确 href、URL 和每轮原四条 RN/Lynx URL 断言，不增加固定等待、不改产品或超时。

最终使用本 worktree 正式构建及其本地 Worker 重跑上述四个首页功能组与桌面黄金截图：81 项声明，75 通过、6 原有跳过、0 失败。Chromium、Firefox、WebKit 各自完成 RN/Lynx 两轮真实语言切换及原有首页断言；三张黄金截图全部通过，使用主验收工作树中已审查基线的逐字节副本，未生成或更新 PNG。JSON 回执确认 headless、重试 0、快照更新 none；辅助函数和首页用例的执行前源码摘要与最终候选一致。

正式网站构建通过。初次 typecheck 的独立 worktree 只安装网站过滤依赖，遗漏被现有共享脚本引用的 hbuilderx-runner/cross-spawn；冻结安装补齐后通过，并为当前 DOM 类型尚未包含的 deliveryType 使用局部可选类型扩展。lint 初稿的正则冗余分组错误已修正，原日志保留。最终六个 TypeScript 文件的定向 ESLint 与网站 `typecheck` 均为退出码 0；本记录定稿后重新执行 `pnpm agents:check` 和 `git diff --check`，均通过。全部原始失败、成功日志、JSON、trace、来源探针及精确命令保留在同一证据目录，定向成功不代表全仓扩展验收已完成。

## 适用边界

仅修改网站私有测试 helper、真实 HTTP 回归与首页链接重复往返，保持公开接口兼容。产品源码、CSS、PNG、原有黄金截图范围、5 像素阈值、跨端 0.05 门槛及 Firefox 视觉隔离 fixture 均未变，不触发公开包 change intent。专门验证缺失合并性能字段的负例仅对 WebKit 执行；另两浏览器按明确原因跳过，原导航和视觉合同继续三浏览器执行。

## 规则评估

不新增 AGENTS。保留原始失败、禁止更新快照、定向完成后重新预检及最终同提交扩展验收要求；大体积原始日志、trace、截图和回执置于本轮恢复 artifacts 的 `website-webkit-cache` 目录。
