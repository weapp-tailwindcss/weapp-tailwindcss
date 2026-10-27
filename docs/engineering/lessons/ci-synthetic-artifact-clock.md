---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40466542404
baseline: 60aca0b2377457a29ac7dc23309abb6690b25c6e
regressions:
  - e2e/tailwind-capabilities-coverage.test.ts
  - e2e/tailwind-weapp-replay.test.ts
  - e2e/tailwind-report-clock.test.ts
  - e2e/tailwind-web-native-media-runner.test.ts
  - e2e/tailwind-authoring-runner.test.ts
  - e2e/tailwind-authoring-web-runner.test.ts
  - e2e/tailwind-framework-source-runner.test.ts
  - e2e/tailwind-static-conversion.test.ts
  - e2e/tailwind-web-history-runner.test.ts
verification:
  - claim: main 的两个合成夹具因混用系统时钟和文件系统时钟而失败
    kind: ci
    status: failed
    sha: 60aca0b2377457a29ac7dc23309abb6690b25c6e
    environment: GitHub Actions Ubuntu / Node 22.23.3
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40466542404
  - claim: 合成夹具使用同文件系统时钟后通过，旧产物继续被拒绝
    kind: integration
    status: passed
    sha: 89f8e2599268fce388ea92f602745b8b13f47f10
    environment: macOS / Node 24.22.1 / pnpm 12.14.0
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-capabilities-coverage.test.ts e2e/tailwind-weapp-replay.test.ts e2e/tailwind-report.test.ts e2e/tailwind-report-clock.test.ts e2e/tailwind-weapp-capture.test.ts --update=none --coverage.enabled=false
  - claim: 六类 runner mock 对齐正式时钟模型后通过，时钟超前和旧产物拒绝回归保持
    kind: integration
    status: passed
    sha: b153b595d52ca5716b3502fcb2bd6fee7fe9aa02
    environment: macOS / Node 24.22.1 / pnpm 12.14.0
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-authoring-runner.test.ts e2e/tailwind-authoring-web-runner.test.ts e2e/tailwind-framework-source-runner.test.ts e2e/tailwind-static-conversion.test.ts e2e/tailwind-web-history-runner.test.ts e2e/tailwind-web-native-media-runner.test.ts e2e/tailwind-report-clock.test.ts e2e/tailwind-report.test.ts --update=none --coverage.enabled=false
---

# 合成产物的时钟边界

## 症状

main 的 E2E Static 第三分片将本轮生成的 `raw.css` 和 `generated.wxss` 判为过期。前者的 `mtimeMs=1793087723878.8054`，报告起点为 `2026-10-27T07:55:23.880Z`，相差约 1.2 毫秒。

## 根因与纠正

原有提交 `07d650e02` 已将正式报告迁移到 `filesystemObservedAt`，但覆盖率与微信重放的两个合成夹具仍直接读取 Date。两个时钟的精度和更新边界不同，执行顺序正确也可能出现较早的文件时间。

夹具现在复用现有的同文件系统时钟。回归先将 Date 超前 60 秒复现旧行为，再确认本轮产物有效，并回拨 CSS 或截图时间验证旧证据继续被拒绝。生产报告验证器、哈希和重放协议保持原有要求。

后续在本任务 head `ca5b99e669b1f50f7dbe53e6ee356ea94f1f0896` 手动执行[完整 CI](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40541520612/job/122322652762)，第一静态分片又捕获媒体 runner 的同类错误：`generated.css` 比报告起点早约 1.11ms。生产 `newReport` 已使用 `artifactStartedAt ?? filesystemObservedAt(context.directory)`，该测试却 mock 成 `new Date().toISOString()`。相邻六类 runner 的同类 mock 一并对齐正式时钟模型，避免只修首个失败文件；生产 1ms 新鲜度边界不放宽。

## 验证

先构建 `weapp-tailwindcss` 的依赖闭包，再运行上述五个定向文件，47 项全部通过。初次复验因工作树没有构建 `weapp-tailwindcss/escape` 而在导入阶段失败，完成依赖构建后使用相同用例通过。

六类 runner mock 修复整合后，连同报告与时钟反例共 8 文件、64 项通过；范围包括 Date 超前、回拨 CSS/截图时间以及哈希篡改拒绝。远端第一静态分片须在后续准确提交上重新验证。

## 适用边界

这是合成证据的确定性回归，不代表真实微信 IDE、截图或完整多端验收通过。未启动 IDE，未修改 demo、样式输出或 static 基线。远端修复结果待本任务当前 SHA 的 CI 验证后补充。

## 规则评估

不新增规则，复用现有文件系统时钟与新鲜度反例测试。
