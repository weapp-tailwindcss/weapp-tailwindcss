---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 97949cfdf495ec822ae6cd6fb52a661c6afd5986
regressions:
  - website/tests/navigation-document.spec.ts
  - website/tests/navigation-readiness.spec.ts
verification:
  - claim: 三浏览器真实文档、缓存与原有资源边界的 75 项定向回归通过
    kind: integration
    status: passed
    sha: 97949cfdf495ec822ae6cd6fb52a661c6afd5986
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，包含本记录对应的未提交修复，headless、CI=1
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/navigation-document.spec.ts tests/navigation-readiness.spec.ts --project=chromium --project=firefox --project=webkit --retries=0 --update-snapshots=none --reporter=line
  - claim: 全仓本地扩展验收仍须对最终提交从第一阶段重新执行
    kind: integration
    status: pending
    sha: 97949cfdf495ec822ae6cd6fb52a661c6afd5986
    environment: macOS arm64，本地扩展全端矩阵
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <本轮报告>
    reason: 定向修复尚未整合为最终候选，不能复用上轮环境预检或把定向通过写成全流程通过
---

# 网站最终文档与缓存响应证据

## 症状

扩展验收 `578bf867-f763-42d5-a311-7f210d6cbdd1` 的前 23 阶段通过，网站阶段出现四个 Firefox 永久失败。四份 retry1 trace 都记录根文档 HTTP 200，随后客户端语言跳转的 `/zh-cn/` 文档 HTTP 200；`goto` 的返回结果却没有 Response。辅助函数在 `action()` 后立即报“HTTP 无响应”，尚未进入最终文档就绪检查。同轮另一 attempt 在刷新时报告 HTTP 304。

这补充了[统计上报同步边界](website-navigation-readiness.md)的适用范围。第五个首页截图的 788 像素差异只完成一次失败采样，重试被主动中断；它是另一条证据，不能算成已确认的第五个导航失败。

后续独立调查确认该截图由 Firefox 跨 context 的访问历史造成，修复与准确的前序测试计数见[黄金截图的访问历史隔离](website-visual-history-isolation.md)。

## 根因与纠正

导航 API 返回值不等于最终主文档的身份。Firefox 的同步 `location.replace()` 可以令 `goto` 返回 null，但最终页面已有真实请求和响应；同文档 hash 导航也按 Playwright 协议返回 null。不能直接放行 null，必须先取得其对应的文档证据。

辅助函数跟踪本轮主 frame 的 request、response、framenavigated 和 requestfinished，并用不可枚举的 Document Symbol 区分实际文档。请求代际、完成和 commit 归属、响应 URL 与当前文档 URL 去 hash 后的一致性、新 Document 身份必须同时成立，再执行原有 hydration、字体和非统计资源连续 500ms 空闲门禁。action 异常、HTTP 错误和最终文档 requestfailed 仍失败；所有五类事件监听器在 `finally` 清理。

真实 HTTP fixture 的服务器收到 `If-None-Match`，返回无正文 304 后，Firefox 的 Playwright Response 暴露 304，Chromium 暴露合并缓存后的 200。WebKit 本轮刷新没有发条件请求，返回 200；没有把它记作执行了 304 分支。尝试依赖 Firefox `request.headers()` / `allHeaders()` 的方案被实验否定：两者均省略浏览器自动生成的条件头，首版修复因此得到 68 通过、1 失败，该日志保留。

有效 Firefox 重验证的新 Document 中，当前 `PerformanceNavigationTiming` 记录合并后的 HTTP 200 和非零 decodedBodySize；无缓存 304 则记录 304、零正文、空白文档。304 只有在同一新文档中取得与 Response 去 hash URL 一致、合并后 2xx 且非空正文的导航性能记录，并通过上述全部生命周期与运行时检查，才被接受。缺失该证据时失败，不按状态码单独放行。

同文档导航只复用 WeakMap 中先前由辅助函数验证过、且 Document 身份仍相同的 Response。History API 可以修改路径而保持同一 Document，因此此分支有意不要求旧响应 URL 等于新路由。外部重新加载同一 URL 会创建新 Document，旧证据不得复用；未知页面即使已显示 hydration 标记，也不能借旧响应兜底。

## 验证

新增真实 HTTP 测试在原实现上得到 4 失败、6 通过，分别复现同步跳转 null、跳转后资源等待、真实 ETag 重验证 304、hash null。修复后扩展为 12 种新场景，加上原有 13 种资源边界，在 Chromium、Firefox、WebKit 共 75 项通过，重试为 0，快照更新为 none。

负例包含无缓存 304 即使伪造 hydration、ETag 与 X-Cache 也失败；直接或跳转后的 HTTP 500、直接或跳转后的请求失败、未知旧文档、外部换文档后的旧证据均拒绝。同文档 hash 与 History API 路由触发的业务请求持续挂起时仍等待，监听器计数回到原值。

本 worktree 完成网站构建和官方 `pnpm --filter @weapp-tailwindcss/website typecheck`。显式 lint 覆盖三个新增或修改的 TypeScript 文件。一个仅保留三个根文件的临时 TypeScript API 探针因移除完整程序原有的 Node ambient 类型来源报七项诊断，不能据此声称正式配置存在同样错误；原始输出保留，以完整官方 typecheck 的零诊断为准。

独立本地 Worker 验证本轮构建 HTML 的身份后，原四个 Firefox 失败用例和精确首页截图共五项通过，保持原 60 秒预算和 5 像素阈值。真实截图诊断另保留 fresh、hover、neutral 和访问介绍页后返回的图像、访问动作与样式观测；浏览器会隐藏 `:visited` 的可读状态，不能用 `matches(':visited') === false` 或计算颜色否认真实访问历史。没有更新产品、CSS 或 PNG 基线。

## 适用边界

本次只修改网站私有测试辅助层，不改变公开包，无需公开 change intent。资源集合覆盖监听器注册后观察到的 request；它不是恢复调用前既有业务请求的通用空闲 API。同文档路径也不宣称能追回先前已开始、尚未结束而未被观察到的请求。

失败 trace 的旧英文文档还出现 Docusaurus 3.10.2 自带 BaseUrlIssueBanner 的 `document.body.prepend` 空值错误：早期语言跳转取消旧解析后，它的 DOMContentLoaded 回调仍执行。该错误属于被取消的旧文档，现有证据不能改写为最终中文文档运行时失败，也不能在导航修复后宣称它从未发生。本次保留归属证据，不修改供应商或吞掉 pageerror。

## 规则评估

不新增 AGENTS。沿用当前会话预检、主代理原生 Chrome 证据、快照禁止更新与最终同提交完整验收要求。
