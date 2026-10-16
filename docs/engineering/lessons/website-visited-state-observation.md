---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: e0e7400c91d871e8562cbd57b7cc8a46aca97215
regressions:
  - website/tests/visual-context.spec.ts
verification:
  - claim: 原消费回归在 Firefox 真实访问后仍取得蓝色首像素，定向复现失败
    kind: integration
    status: failed
    sha: e0e7400c91d871e8562cbd57b7cc8a46aca97215
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1 / Firefox 157.0，原源码，CI=1、headless、retries=0、快照更新 none
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/visual-context.spec.ts --project=firefox --retries=0 --update-snapshots=none --reporter=line,json --trace=on
  - claim: 有界 visited 状态断言、真实控制组、未访问负控制及组合配置继承通过三浏览器消费回归
    kind: integration
    status: passed
    sha: e0e7400c91d871e8562cbd57b7cc8a46aca97215
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含本记录对应未提交修复，CI=1、headless、retries=0、快照更新 none
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/visual-context.spec.ts --project=chromium --project=firefox --project=webkit --retries=0 --update-snapshots=none --reporter=line,json --trace=on
  - claim: 整合后的同提交本地扩展全端验收待重新执行
    kind: integration
    status: pending
    sha: e0e7400c91d871e8562cbd57b7cc8a46aca97215
    environment: 本机扩展全端矩阵
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <本轮报告>
    reason: 三浏览器定向消费回归不能替代新候选的重新预检和完整验收
---

# Firefox 消费回归的 visited 状态观察

## 症状

本轮扩展流程 `e52943f5-bb41-4085-9876-9a763544f4ed` 在第 24 阶段真实退出 1。Firefox 的 `fresh visual document 1` 在同 browser 新建控制 context 后，预期红色 `[255, 0, 0, 255]`，首张截图却为蓝色 `[0, 128, 255, 255]`。此前已执行的 1389 项通过、332 项声明跳过和剩余 861 项未运行分别保留，没有将本轮失败解释为取消。

原源码的定向运行也失败，但发生在 `fresh visual document 0` 的独立视觉页面自身真实访问后。原始截图读取未记录后续状态；补充诊断中有通过和失败，也未取得可用的首蓝转红轨迹。因此这些证据不证明 Firefox 内部某条特定异步链路稍后恢复，也不能据此声称独立 browser 的历史隔离失效。

## 根因与纠正

旧消费夹具把 `click`、URL 达成和返回首页完成当成 visited 像素同步绘制完成的保证。公开导航事件不提供这一保证；截图自身的几何稳定检查也不声明 visited 查询或重绘完成。回归应观察最终的真实像素状态。

现在仅在同一页面上有界观察精确 RGBA，正向状态预算为两秒。每次观察仍读取真实链接截图，不重新导航、不重跑测试、不清历史、不改 CSS。初始蓝色和隔离后的蓝色仍作单次精确比较。先确认原控制 context 真实访问后已绘制红色，再关闭它；新 context 必须继承红色，独立视觉页面必须保持蓝色，并在自身访问后变红。

每轮使用不同的目标 URL，避免第二轮由前一轮已访问目标代证。页面另有从未访问的链接：它在已污染的控制页面和独立视觉页面仍须保持蓝色。负控制还要求对该链接期待红色的有界观察确实超时，且全部实际样本为蓝色；截图或文件写入异常必须作为原异常失败，不能冒充预期超时。

每次像素及对应 PNG 都保存，状态断言在成功和超时时均记录样本、预期和预算。子 runner 的 JSON、trace、截图及生成源码在成功和失败时均复制到外层测试结果；录像开关两次消费使用独立报告和输出目录。子进程还显式绑定自己的 `PLAYWRIGHT_JSON_OUTPUT_FILE`，避免父 runner 的报告环境变量覆盖子报告或反向写入父报告。子夹具的临时目录仍由 `finally` 清理，复制证据失败时保留原始异常及复制异常。

## 验证

最终源码的 Chromium、Firefox、WebKit 消费回归结果为 3 通过、0 跳过、0 重试；网站类型检查和该文件 lint 通过。配置继承、两轮 browser 身份、真实请求头、精确红蓝状态及录像保护均保留。Firefox 的未访问红色负控制确实产生预期超时，其样本和附件可复核。

原始大日志保存在任务忽略目录 `e2e/.artifacts/firefox-history-isolation/`。`canonical-first-failure/` 和 `directional-original/` 保留原失败；`diagnostic-*`、两个独立 probe 及其源字节只用于诊断，不作为修复验收；`final-bound-reports-three-browsers/` 保存最终源码的三浏览器结果和完整子夹具证据。诊断期间一轮最大五次的执行在首轮失败后停止，剩余四轮未运行；另一次同样有界的诊断通过五轮，两者均保留，未把诊断绿色算成产品修复。

## 适用边界

本次修复负责测试夹具的状态同步与证据生命周期。私有 `visualTest` 的 browser/context 生命周期、产品 visited 样式、黄金截图、阈值、路由和覆盖范围均无变更。此前的[黄金截图历史隔离](website-visual-history-isolation.md)仍解释独立 browser 的用途；本文补充消费回归不应依赖同步绘制的边界。没有公开包行为变化，不新增发布 change intent，也无需更新 static 基线。

本记录保持 `partial`。本机完整矩阵需在整合后的准确候选上重新预检并执行；本次未操作原生 Chrome、微信 IDE 或设备，也未推送 main。

## 规则评估

不新增 AGENTS。现有的真实状态验证、首次失败保留、资源归属和禁止降级断言规则已覆盖本次问题；可执行消费回归负责约束状态观察与负控制。
