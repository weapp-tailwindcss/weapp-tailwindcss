---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1288
baseline: 6d5a5588967797811e3515fe2cf9b18596675df6
regressions:
  - scripts/ci/demo-matrix/browser-styles.test.mjs
  - scripts/ci/demo-matrix/output.test.mjs
---

# 浏览器外链样式的 CSS 表示与采集边界

## 症状

[PR Gate run 38277825189](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38277825189)、attempt 1、准确 head `6d5a5588967797811e3515fe2cf9b18596675df6` 的 [Nuxt macOS / Node 22 job 114908983040](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38277825189/job/114908983040) 在 replace 轮次等待 180 秒后失败：

```text
CssSyntaxError: .../nuxt/dist/app/components/error-404.vue:1:10:
Unknown word createHotContext
at inspectStyles (scripts/ci/demo-matrix/output.mjs:65)
```

失败 artifact 的 `last-inspection.json` 中，第一份样式实际是 14132 字符的 Vite HMR JS 包装，后两份是正确的 Tailwind 和 SiteBrand CSS。replace 页面九个探针的 DOM 标识与计算样式均符合预期，截图显示正常页面，浏览器事件仅有热更新和重连。不能根据模块名 `error-404.vue` 认定失败终态是 Nuxt 404 页面；现有证据也不证明更新途中从未短暂出现 404。

## 根因与纠正

浏览器最初加载 `<link rel="stylesheet">` 时请求 CSS，验证器却用默认 `fetch(sheet.href)` 重新取文本。Vite 8.3.4 根据请求的 `Accept` 决定同一个样式 URL 的表示：包含 `text/css` 时添加直接 CSS 查询，否则可能返回 JavaScript 模块。把后者传给 PostCSS 导致错误，首次偏离在浏览器采集器，不能修补产品样式或放宽 CSS parser。

外链采集显式发送 `Accept: text/css`，确认成功 HTTP 状态和规范化 MIME 为 `text/css`，再读取原始 CSS。保留 inline STYLE 的原始文本和严格 PostCSS 解析；CSSOM 会规范化色值、丢弃非法声明，不适合作为全部原始语法证据的替代。

明确外源第三方链接在采集前排除。同源链接的网络失败、错误状态、错误 MIME 和非法 CSS 必须失败，不能由另外一份有效样式掩盖。整轮样式采集共享 5 秒预算，涵盖响应头和正文；最后一次异步读取后复核信号及截止，避免单次悬挂检查绕过外层轮询预算。最后的 inspection 记录每份 CSS 的来源，方便后续核对 URL 与内容。

继续检查当前 DOM 轮次、消费类名、规则与计算样式。重新获取同 URL 的 CSS 只能证明服务端表示，计算样式才能证明浏览器已应用本轮变化。没有重启 Nuxt、增加轮次超时、过滤 JS 关键词或吞掉 CSS 解析错误。

## 验证

本地 macOS / Node 22.22.3 / pnpm 12.9.1，基线上包含本轮未提交修复。真实 Vite 外链夹具先证明普通请求返回 `createHotContext`，而 CSS 请求返回原始色值。旧实现在相同外链检查中出现与 CI 相同的解析错误；503 和错误 MIME 两项在旧实现错误放行，新实现正确阻断。

```sh
CI=1 corepack pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/browser-styles.test.mjs scripts/ci/demo-matrix/browser.test.mjs scripts/ci/demo-matrix/browser-hydration.test.mjs scripts/ci/demo-matrix/browser-readiness.test.mjs scripts/ci/demo-matrix/browser-navigation.test.mjs scripts/ci/demo-matrix/browser-connection.test.mjs scripts/ci/demo-matrix/output.test.mjs --update=none
CI=1 NODE_OPTIONS=--max-old-space-size=6144 DEMO_MATRIX_ARTIFACT_DIR=e2e/.artifacts/issue-1286-ci/nuxt-css-node22 corepack pnpm e2e:demo:matrix web/nuxt-vite-tailwindcss-v4:web
```

第一组 29 项全部通过，无跳过。新增 6 项覆盖真实外链连续 initial/replace/add/restore、最终刷新、503、错误 MIME、非法 CSS、正文悬挂及明确跨域链接。Nuxt 定向链路通过 production、initial、replace、add、restore、refresh；production 以不更新模式核对现有 static 基线。测试使用 headless Chromium，finally 关闭自有浏览器和服务器、恢复 demo 源码，工作树没有 demo 或快照差异。

## 适用边界

本地定向回归证明 CSS 表示协商、严格采集和同服务更新链路。修复提交仍需准确 head 的 hosted CI，不能将旧 head 的成功或条件跳过当作新修复验收。没有执行本地全仓、IDE 或设备验收，记录保持 `partial`。

## 规则评估

不新增 AGENTS 规则。原有输入与产物边界已足够，补真实浏览器回归和明确采集契约更直接。仅调整私有验证器，不改产品样式、demo 内容或 static 基线，不新增包发布 intent。
