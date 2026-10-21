---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 269585f809bd424aaa7bb8164a603fb17c296ef4
regressions:
  - e2e/tailwind-web-native-media.test.ts
  - e2e/tailwind-web-native-media-replay.test.ts
  - e2e/tailwind-web-native-media-protocol.test.ts
  - e2e/tailwind-web-native-media-runner.test.ts
---

# Chromium contrast-less 的原生媒体证据

## 症状

`runtime/native-media-contrast-less` 仅登记 Chromium。Firefox/WebKit 仍是 not-run；Playwright 的 more/no-preference 选项不能替代 less。Chromium 现为 83/88 个 variant root 提供夹具，其他两引擎仍为 82/88；登记不等于本轮实际通过，整体验收保持 partial。

生成器通过 weapp-tailwindcss 生成 `contrast-less:bg-[#123456]`。浏览器直接解释独立字面量参考 CSS，另有无 class 对照。只使用本 page 的原生 CDP，不覆盖 matchMedia、不修改媒体条件或操作用户 profile。

顺序是 no-preference、less、more、custom、恢复 no-preference。每步检查四个原生媒体真值、两个递增 RAF、三个色块的精确计算样式和几何、原始 PNG 中心像素。more/custom 能拒绝被错误扩大为布尔 `(prefers-contrast)` 的条件。像素不设误差。

## 根因与纠正

截图有由 run ID、phase、实际生成 CSS 摘要共同派生的可见 RGB 标记。恢复后的原始协议、媒体、几何与生成证据先写 sidecar；关闭 owned context 后，从磁盘重新读取 sidecar、CSS 和五张 PNG 决定结果。统一产物验证和 coverage 均再次执行同一生产重放，缓存 passed 没有判定效力。

原生操作、RAF、截图和清理各有有限预算。reset、detach 和 context close 分别处理，错误聚合保留；不关闭借用 Browser。复读/解码失败写 failed 报告和 replay-error，不丢弃原始失败证据。

## 验证

先保留 coverage 红例：Chromium 原为 not-run。补齐实现后，12 个定向文件 197 项通过，包含媒体不变、候选失效、条件扩大、无条件生效、对照污染、缺恢复、缺 PNG、旧 run/phase、CSS+sidecar 摘要联合替换、结构伪装、warning、清理及有界超时反例；合成夹具只证明门禁。

真实后台 Chromium run `7afe67ed-74fa-4ec5-b196-a8d758d3dbd9` 的五状态、独立参考、精确几何、PNG、恢复及生产重放通过。run 目录保存在执行工作树的 `e2e/.artifacts/tailwind/<runId>/web-chromium/native-media`，Browser 和 context 已定向关闭。此为单案例定向验证，不替代全面预检或其他平台运行。

正式 static 更新入口 `pnpm e2e:tailwind:static:update` 新增 native-media.css，审查后以 CI=1 的只读 fixtureBaseline 验证47份产物通过；其他46份 CSS 摘要不变。ESLint、diff 与 agents 检查通过。直接 e2e tsconfig 全量检查仍因其他模块的既有类型/模块解析问题失败；新媒体模块及其四份单测无诊断，未宣称全仓类型通过。

## 适用边界

仅适用于已登记的 Chromium contrast-less；另外两个引擎和其余五类 variant 缺口仍需独立原生证据。Canvas、生成合同或合成单测均不能代替此运行时结果。

## 规则评估

现有能力目录规则已经要求独立 oracle、逐引擎证据和原始 sidecar/PNG 重放；本次落实到新媒体分组，规则不需要扩大。全面验收仍严格使用本轮 extended lease，定向单案例记录不放行全面调度。
