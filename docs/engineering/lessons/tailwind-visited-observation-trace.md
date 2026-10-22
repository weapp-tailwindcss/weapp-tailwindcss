---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 4ea2684361a8080362eb796c7eae5c8a117fa804
regressions:
  - e2e/tailwind-web-history-observe.test.ts
  - e2e/tailwind-web-history-replay.test.ts
  - e2e/tailwind-web-history-runner.test.ts
verification:
  - claim: 三宿主实测对照中，仅开启正常历史登记的macOS宿主在原两秒预算内绘制真实目标访问色
    kind: integration
    status: passed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: macOS arm64、Node24.18.0、Playwright1.64.1、WebKit2370；含六个微信环境相关未提交文件，diff cd06248bc489956e4169b5fac7958f6f053b2ac6b397505b8f2dded00ae2b17d；三独占persistent profile，headless true，非正式验收
    command: pnpm exec tsx .tmp/visited-host-comparison.mts
  - claim: 新文档查询与历史返回两条路径中，WebKit 候选及手写参考仍未绘制访问色
    kind: integration
    status: failed
    sha: 44ce882520940eb45463386fe50f6876944581e7
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；Chromium 156.0.8078.4 与 WebKit 27.2，四份独占 persistent profile，headless true，仅定向诊断
    command: pnpm exec tsx .tmp/visited-navigation-diagnostic.mts
    reason: 不作为正式全面验收；97张PNG独立重读，Chromium可信点击对照通过，WebKit四条离散观察轨迹未达到；未定位历史登记或查询根因
  - claim: 当前全面验收的 WebKit visited 四边像素失败，手写参考同样未显示访问后颜色
    kind: integration
    status: failed
    sha: 4ea2684361a8080362eb796c7eae5c8a117fa804
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，本轮 extended 预检、原生 Chrome computer use 与 verify 全部通过，CI=1
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/1b9d3cfc-b0ea-4a3a-8713-090df74430a1/report.json
  - claim: 原实现未保留同页观察轨迹，新增观察回归得到四项真实失败
    kind: unit
    status: failed
    sha: 0e1c33c947794df1acde709f8464f7c90d5e8135
    environment: macOS arm64，包含新增未提交回归、尚无观察修复，CI=1，Vitest 5.0.4，快照更新 none
    command: pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/tailwind-web-history-observe.test.ts --maxWorkers=1 --update=none
  - claim: 有界原图观察、完整离线重放与存活截图结算通过定向回归
    kind: unit
    status: passed
    sha: 0e1c33c947794df1acde709f8464f7c90d5e8135
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交修复，CI=1，Vitest 5.0.4，快照更新 none
    command: pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/tailwind-web-history.test.ts e2e/tailwind-web-history-replay.test.ts e2e/tailwind-web-history-runner.test.ts e2e/tailwind-web-history-observe.test.ts e2e/tailwind-web-history-profile.test.ts e2e/tailwind-web-history-server.test.ts e2e/tailwind-capabilities-coverage.test.ts e2e/tailwind-capabilities-ci.test.ts e2e/tailwind-capabilities-lynx-adapter.test.ts --maxWorkers=1 --update=none
  - claim: 三引擎真实历史绘制须在整合修复后重新完成新鲜预检与运行
    kind: integration
    status: pending
    sha: 0e1c33c947794df1acde709f8464f7c90d5e8135
    environment: 本机 Chromium、Firefox、WebKit，包含本记录对应未提交修复
    reason: 原全面运行固定于4ea，不能修改其源码或复用已消费的预检；合成PNG回归不证明WebKit真实状态稍后必然达成
---

# Tailwind visited 原图观察与结算

## 症状

运行 `6d596b2e-fe30-4294-b14f-f1fabfdf5126` 中，Chromium、Firefox 的历史目标通过，WebKit 真实点击、HTTP 200、返回、截图身份、几何与资源清理均通过，但 probe 和手写 `#reference:visited` 的四边仍是 `[1,2,3,255]`，预期 `[18,52,86,255]`；24 条 RGB 断言失败。三引擎生成 CSS 相同。首图之后没有后续 PNG，不能据此证明稍后会恢复，也不能自动登记为平台不支持。

## 根因与纠正

原夹具把返回导航和两次 rAF 当成 visited 绘制完成保证。改为仅在同一文档内固定两秒观察，保留每次原图、实际几何、掩蔽的 computed/matches、单调时间、两次 rAF 和 `performance.timeOrigin`。初始与新 profile 恢复仍为一次精确断言。最终颜色、四边、独立参考与未访问对照均未放宽；不会跨帧拼接成功。

私有 sidecar v3 要求连续轨迹与逐帧可见身份，包含 run、engine、CSS、profile、状态和样本序号。重放重新解码所有 PNG，拒绝删首帧、跳号、重复、乱序、跨帧/profile 原图、污染对照、超预算成功、重置时钟、换文档、额外夹具请求和成功后继续采样。全部原图必须拥有报告引用及 receipt。外层报告保持 v2，历史报告保留。

有界 Promise 的失败不会取消底层操作。生产 runner 现在结算仍存活的截图与 receipt 后才清理并持久化，避免超时后的迟到写入。异常保存尝试序号、起止时间、预期文件名与原错误；PNG 解码失败前已经取得的样本仍保存。

## 验证

观察原回归为 4 失败、1 通过。补充重放反例又得到浏览器时钟回退、替换文档两项失败；延迟截图回归确认原 runner 会在报告返回后才追加 receipt。修复后的九文件定向回归为 145 项通过；日志位于任务忽略目录 `.tmp/history-observe-*`，首次失败均保留。

中途一轮新单测的延迟截图 mock 误将含 `visited` 的所有文件名都挂起，已定向中断本任务的 Vitest，收窄到 visited 样本文件名后重新完整执行。该次中断不算通过，也未重跑真实浏览器碰运气。

未改变 HTML、CSS 声明和产物基线；变化是观察时机、图片身份及证据协议。新观察回归接入 `e2e:tailwind:contract`。未涉及公开包行为，不新增发布 intent。

## 适用边界

本片修复观察和证据生命周期，尚不能声称 WebKit 的原生历史状态问题已经消除。原4ea的失败保持失败；三浏览器须在整合后重新预检、真实 computer use、verify 和运行。整体四端验收仍为 partial。

## 规则评估

不新增 AGENTS。现有禁止失败改判不支持、原始证据重读、固定预算及任务资源收尾规则已覆盖边界，以可执行回归落实。

## 无 Tailwind 的 Self 控制诊断

独立手写 CSS 实验新增空链接 Self，分别以立即返回和目标真实 HTTP 文档 complete、两次 rAF 与截图后返回两条路径运行。两分支各自独立 profile，Chromium 156 和 WebKit 27.2 均后台运行，返回后观察预算仍是两秒。Chromium 的历史返回与同 profile 重开均首帧通过；WebKit 的 Self 始终显示访问色 `[18,52,86,255]`，但真实目标 probe/reference 始终为未访问色 `[1,2,3,255]`，control 正确保持未访问。

证据保存在 `.tmp/visited-self-control/report.json` 及逐帧 PNG，脚本为 `.tmp/visited-self-control.mjs`。所有自有 profile、context 和 HTTP 服务已关闭清理。此实验可排除通用 visited CSS 绘制失败及全面截图掩蔽，不能确定真实目标在历史登记、查询或失效链的具体根因。正向失败继续保留，不以 Self 代替真实导航，不放宽支持预期或时间预算。

## 新文档查询与空链接差异诊断

run `fe9ed664-a9d1-4227-a044-d499814d05f3` 固定源码44ce及相同生成CSS摘要，串行执行 Chromium/WebKit × click/goto 四个组合。可信点击路径是 A→B→C，在新文档C查询B，再返回B、A查询B；goto仅替代首次A→B作为方法对照，不替代正式可信点击合同。每组合使用独占临时profile，保留原始/解析href、baseURI、主frame、文档nonce、HTTP请求/响应nonce、pageshow、单调时间与逐帧四边像素。

| 引擎与首次进入B方式 | C查询B | 返回A查询B |
| --- | --- | --- |
| Chromium可信点击 | probe/reference/control首帧达到，约62ms | 三者首帧达到，约60ms |
| Chromium goto | 14帧未达到；末帧约2002.97ms超预算 | 13帧未达到，另有两帧rAF预算超时 |
| WebKit可信点击 | 15帧未达到 | 15帧未达到 |
| WebKit goto | 15帧未达到 | 15帧未达到 |

WebKit的probe与独立手写reference四边均保持未访问色。empty-self与absolute-self的解析URL逐字相同，却仅空href显示访问色；空链接控制走过特殊路径，不能证明一般历史登记正常。`reached`只检查probe/reference/control，不能推广为五条链接全部通过。WebKit轨迹是两秒上限内的离散采样，不声称穷尽连续两秒。

独立复核重读97张PNG、1860个RGBA四边采样及6次可信点击，核对URL/端口、main frame、HTTP与文档nonce链及CSS hash；20个HTTP请求均为200，无popup/pageerror。四份profile均关闭删除并独立确认目录不存在，共享HTTP服务关闭。顶层`errors=[]`不覆盖观察阶段异常，Chromium goto的超预算和rAF错误全部保留。

[持久摘要与97张原图摘要](evidence/visited-navigation-44ce.json)绑定完整record、诊断脚本和锁文件hash。完整record、HTML与PNG仍保存在本任务忽略目录，未随Git交付；摘要不能代替原始证据重放。本轮没有改变正式支持预期、两秒预算或CSS/HTML基线，也没有重跑全面调度。WebKit正向失败及partial继续保留，尚未证明Tailwind生成缺陷或WebKit平台限制。

## Playwright macOS 宿主的源码定位

本机实际 Playwright1.64.1、WebKit revision2370 对应 [Playwright提交cfe490d9的UPSTREAM_CONFIG](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/browser_patches/webkit/UPSTREAM_CONFIG.sh#L3)，固定WebKit base `56453fdfe0b0ca6258c23e6453b34f70b885d13f`。该版本的[headless宿主建页](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/browser_patches/webkit/embedder/Playwright/mac/AppDelegate.m#L326)没有开启历史登记。

WebKit [WebViewImpl初始化](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Source/WebKit/UIProcess/mac/WebViewImpl.mm#L1408)从history client取addsVisitedLinks，[默认返回false](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Source/WebKit/UIProcess/API/APILegacyContextHistoryClient.h#L51)。[VisitedLinkStore](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Source/WebKit/UIProcess/VisitedLinkStore.cpp#L103)在该开关关闭时拒绝页面提交的历史hash；[空href则直接走InsideVisited路径](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Source/WebCore/dom/VisitedLinkState.cpp#L114)。这条源码链解释了普通目标不变色、空href却变色的诊断差异，指向测试宿主配置缺口，不能登记成WebKit或Tailwind不支持visited。

修复边界在embedder：[现有WKWebView SPI](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Source/WebKit/UIProcess/API/Cocoa/WKWebView.mm#L5829)可开启正常历史登记，[WebKit自身测试宿主](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Tools/WebKitTestRunner/TestInvocation.cpp#L425)也显式控制该开关。没有以forcePseudoState或空href替代真实可信点击。该阶段只完成源码对照，以下后续构建实测单独记录，正式失败历史不改写。

## 三宿主构建对照

run `8fa5a010-dcc9-4aa0-89ab-9ffe66be63ce` 比较installed-stock、rebuilt-stock和rebuilt-visited。下载固定Playwright提交的49个embedder文件及WebKit对应ccache配置，逐项复核Git blob与SHA256；两次本机构建共用Xcode27.1/macOS27 SDK、arm64、deployment26.5及原revision2370配套框架。原样重建控制排除单纯本机重建差异。仅patched的headless建页和headful awakeFromNib各增加一行，均在首次导航之前：

```objc
webView._addsVisitedLinks = configuration.websiteDataStore.persistent;
_webView._addsVisitedLinks = _configuration.websiteDataStore.persistent;
```

条件保持ephemeral隐私边界；没有修改WebKit引擎、样式、目标URL、点击方式、采样预算或阈值。构建使用`xcodebuild -project <Playwright.xcodeproj> -target Playwright -configuration Release -sdk macosx`；上游scheme的target ID不对应本项目，不能改用scheme。输出、对象、PCH和module cache均独立于用户工程；`FRAMEWORK_SEARCH_PATHS`绑定revision2370目录。原cache和系统应用未覆盖。

| 宿主 | C查询B | 返回A查询B |
| --- | --- | --- |
| installed-stock | 15帧未访问色，末帧1928.496ms | 15帧未访问色，末帧1947.976ms |
| rebuilt-stock | 15帧未访问色，末帧1920.839ms | 15帧未访问色，末帧1944.036ms |
| rebuilt-visited | 首帧48.023ms通过 | 首帧46.212ms通过 |

每组合独占新persistent profile、headless true，A→B→C使用真实可信点击；在C查询B，再返回B、A查询B。probe与独立手写reference在patched宿主均为`[18,52,86,255]`，control保持`[1,2,3,255]`。两版stock的probe/reference持续为未访问色。

独立审计用Python标准库另写PNG解码，不消费仓库readPixels/pngjs，校验68张640×480 RGBA原图、CRC及1300个四边采样，结论吻合；核对六次可信点击、15个唯一HTTP nonce、68份文档及325个链接身份、110个事件序号。全部采样在原2000ms内，无重定向、popup或pageerror。三个profile目录已删除，无本任务匹配宿主/诊断端口遗留；服务已关闭。

[持久构建与采样摘要](evidence/visited-host-comparison-078e.json)保存固定源码manifest、原件/构建回执/脚本hash、三个宿主和框架hash、逐帧PNG摘要与四边一致颜色。完整record、构建源、脚本和原图仍在忽略的`.tmp/webkit-visited-host/`；摘要不是完整重放输入。独立目录重建时按manifest的固定Git提交和`source`路径获取文件，以`gitBlob`和`sha256`双校验，布局保持`Tools/Playwright`及对应`Tools/ccache`。patched只加上述两行，再以同参构建两份宿主。自建版启动显式`executablePath`，`DYLD_FRAMEWORK_PATH`及`DYLD_LIBRARY_PATH`绑定原cache；不可覆盖默认浏览器或静默替换正式报告的宿主身份。

这次源码身份为078e加当时六个微信环境相关dirty文件，准确diff hash见frontmatter和摘要；后续这六文件又修改过，不能称为纯078e或当前diff。框架绑定有构建参数、启动环境和二进制hash证据，未采集运行时loaded-image清单。未验证headful、ephemeral或其它系统。该对照支持把故障定位到宿主历史登记开关，尚未将修复宿主作为独立可复现工具接入正式runner；原WebKit正向失败、全面partial及新鲜预检要求继续保留。
