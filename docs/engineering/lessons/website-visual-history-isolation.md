---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 97949cfdf495ec822ae6cd6fb52a661c6afd5986
regressions:
  - website/tests/visual-context.spec.ts
  - website/tests/index.spec.ts
verification:
  - claim: 原有首页功能前序执行后，Firefox 首页黄金截图通过原有五像素门槛
    kind: integration
    status: passed
    sha: 9390f34b919c5add6deb808a565ca31ff58730ae
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含本记录对应未提交修复，CI=1、headless、快照更新 none
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/index.spec.ts --project=firefox --grep 'homepage hero layout|homepage locale detection|mobile navbar sidebar|color mode transition strategy|desktop viewport desktop / screenshot' --retries=0 --update-snapshots=none --reporter=line --trace=on
  - claim: 三浏览器消费回归覆盖历史隔离、组合配置继承和录像边界
    kind: integration
    status: passed
    sha: 9390f34b919c5add6deb808a565ca31ff58730ae
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含本记录对应未提交修复，CI=1、headless、快照更新 none
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/visual-context.spec.ts --project=chromium --project=firefox --project=webkit --retries=0 --update-snapshots=none --reporter=line
  - claim: 最终同提交本地扩展全端验收仍待执行
    kind: integration
    status: pending
    sha: 9390f34b919c5add6deb808a565ca31ff58730ae
    environment: macOS arm64，本地扩展全端矩阵
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <本轮报告>
    reason: 本次定向通过不能替代整合候选提交后的重新预检和完整流程
---

# Firefox 黄金截图的访问历史隔离

## 症状

扩展验收的首页截图出现 788 个像素差异，集中在英文首页 Read the introduction 链接。单独启动 Firefox 时截图通过；先执行首页功能测试，再运行相同截图则失败。此前的[文档导航修复](website-document-navigation-evidence.md)解决了独立的最终文档响应问题，不能解释这处颜色变化。

## 根因与纠正

Playwright 1.64.1 所用 Firefox 的访问历史跨 BrowserContext 共享。点击介绍页链接、返回首页后，关闭 context 并在同一个 browser 新建 context，仍绘制 visited 颜色。独立新 browser 的相同截图与基线一致。诊断进一步将访问后的链接区域与原失败截图逐像素对齐，确认相同的 788 像素变化；首次独立诊断额外一个像素来自顶部徽标，不能把它并入链接根因。

产品已有 `.homepage a:visited` 规则，其颜色优先级高于该正文链接的普通样式。这是现有功能。浏览器会隐藏 `matches(':visited')` 和计算样式中的真实访问状态，必须观察真实导航与截图像素，不能由这些 API 的返回值否定历史污染。

新增私有 `visualTest`，只用于 `index.spec.ts` 的路由与视口黄金截图循环。Firefox 每条视觉测试通过公开 `playwright.firefox.launch()` 和 `newContext()` 获得独立浏览器，保留内置 page；context 和 browser 分别用 `finally` 回收。其他浏览器直接沿用 super context。普通首页、showcase 功能测试继续保留原 fixture。

Playwright 1.64.1 的 runner 自动为公开 launch/newContext API 注入本轮 launch 和组合 context 配置，并记录 trace 与失败截图。没有复制私有 context factory、拼装配置白名单或改变 browser worker fixture 的作用域。黄金截图名称、数量、路由、视口、跳过规则和五像素阈值均保持原值；产品 CSS 与 PNG 基线没有变动。

## 验证

原始整段 Firefox 前序的精确结果是 23 通过、3 跳过、1 截图失败。修复后同一选择得到 24 通过、3 跳过、0 失败。三项原有跳过分别是仅 Chromium 的移动侧栏，以及两项原生 View Transition 路径；此前对话中的 25 通过、1 跳过是错误摘要，原日志与本轮追加更正记录保留，未改写旧证据。

真实 HTTP 消费回归在 Chromium、Firefox、WebKit 各运行一次，内部连续创建两轮视觉 fixture。Firefox 控制组在同 browser 的新 context 仍绘制访问后的红像素，独立视觉 fixture 保持未访问蓝像素；在 fixture 内真实点击后仍绘制红像素。两轮独立 browser 身份不同。其他浏览器断言沿用内置 browser，没有强加 Firefox 的历史实现。

后续完整流程暴露消费回归曾把导航完成当成 visited 像素同步绘制完成。原失败和定向复现均保留；[visited 状态观察复盘](website-visited-state-observation.md)记录有界真实像素断言、未访问负控制及证据持久化的纠正，不将本文的历史通过解释为同步绘制保证。

回归验证 viewport、deviceScaleFactor、userAgent、locale、timezoneId、colorScheme、reducedMotion、storageState 以及真实请求携带的 extraHTTPHeaders。首版回归误把 `hasTouch` 等同于各浏览器的 `navigator.maxTouchPoints`，并误要求 Chromium 隐私 context 绘制 visited，导致首轮失败；这些观察已保留，纠正测试预期后通过，不改产品或隔离实现。

外部临时负例故意失败以检查记录能力，没有把失败用例留在正式套件中。两次 Firefox 实际启动命令均包含 `-headless`，两个进程均有退出回执；保留失败 PNG、trace ZIP 及 trace 内的 411×377、fr-FR 等 context 配置和真实 HTTP 导航。另一轮 video=on 在创建独立 browser 前报错，实际 exit 1 回执保留；正式消费回归也覆盖此拒绝和其他浏览器的录像透传。

## 适用边界

本次只修改私有测试层，无公开包行为变化，不新增发布 change intent。网站实际持久黄金截图入口集中在 index 的 route/viewport 循环，已包含 showcase 路由；showcase.spec.ts 的功能测试、视频测试附件和合成分片截图回归不需要切换浏览器生命周期。

当前视觉矩阵 video=off。独立 Firefox context 绕过内置 context factory 的录像保存附件逻辑，因此非 off 配置明确报不支持，避免静默丢录像。以后需要录像时应补完整的录像持有、保存、附件与失败清理契约，不能删除保护后直接宣称支持。本方案的配置与 trace 继承已在 Playwright 1.64.1 验证，升级时由持久消费回归复核。

## 规则评估

不新增 AGENTS。已有真实交互、资源归属、禁止快照更新和最终同提交完整验收规则足以覆盖本次修复。
