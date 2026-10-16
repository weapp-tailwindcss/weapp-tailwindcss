---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 0838260c57c8088fafd35a380dcb1e66c52e2873
regressions:
  - website/tests/navigation-diagnostics.spec.ts
  - website/tests/navigation-timeout.spec.ts
  - website/scripts/local-worker/command.test.ts
verification:
  - claim: 原辅助函数缺少真实 HTTP 失败的结构化诊断附件
    kind: integration
    status: passed
    sha: 0838260c57c8088fafd35a380dcb1e66c52e2873
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，原 helper 加新增未提交回归，headless、CI=1、重试 0
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test tests/navigation-diagnostics.spec.ts --config playwright.config.mts --project=chromium --workers=1 --max-failures=1 --retries=0 --update-snapshots=none --trace=on
  - claim: 最终候选的 138 项导航合同保留真实回执
    kind: integration
    status: passed
    sha: 0838260c57c8088fafd35a380dcb1e66c52e2873
    environment: macOS arm64，包含本记录对应的未提交诊断修复，headless、CI=1、禁止更新快照
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/navigation-diagnostics.spec.ts tests/navigation-document.spec.ts tests/navigation-readiness.spec.ts tests/navigation-cache.spec.ts tests/visual-context.spec.ts --project=chromium --project=firefox --project=webkit --update-snapshots=none
  - claim: 三浏览器的 poll 与 hard 六项真实超时回归全部通过
    kind: integration
    status: passed
    sha: 0838260c57c8088fafd35a380dcb1e66c52e2873
    environment: macOS arm64，最终未提交候选，headless、CI=1、重试 0、禁止更新快照
    command: pnpm --filter @weapp-tailwindcss/website exec playwright test tests/navigation-timeout.spec.ts --config scripts/local-worker/playwright.config.mts --project=chromium --project=firefox --project=webkit --update-snapshots=none --reporter=json
  - claim: 唯一一轮 169 项 Chromium 有序前缀全部通过，原超时未复现
    kind: integration
    status: passed
    sha: 0838260c57c8088fafd35a380dcb1e66c52e2873
    environment: macOS arm64，未提交诊断候选，原四份 spec 全文和 index 用例正文保持一致，只添加只读 CDP 观察
    command: pnpm exec tsx <本轮证据目录>/prefix-once.mts <候选工作树> <本轮证据目录> <原 canonical 提取报告>
  - claim: 后续完整流程的首错停止回归收到执行与收尾聚合错误，内层原因未留存
    kind: integration
    status: failed
    sha: 174cd17c8e710073f983ad149386c97ec6b073db
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1，本轮 bf248624 扩展预检和原生 Chrome 证据已通过
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <bf248624-2981-4fec-9699-506b075e0af2 本轮报告>
  - claim: 加入完整异常断言上下文后，同文件 8 项定向回归通过，未复现聚合错误
    kind: integration
    status: passed
    sha: 174cd17c8e710073f983ad149386c97ec6b073db
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1，包含未提交的断言上下文增强，CI=1、禁止更新快照；真实 CLI 夹具不使用浏览器 fixture
    command: pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/local-worker/command.test.ts --update=none
  - claim: 一次四进程 CPU 竞争下，同文件 8 项定向回归通过，未复现聚合错误
    kind: integration
    status: passed
    sha: 174cd17c8e710073f983ad149386c97ec6b073db
    environment: macOS arm64，Node 24.18.0、pnpm 12.9.1，包含未提交的断言上下文增强；16 个可用逻辑处理器上启动 4 个 CPU 子进程，单进程硬预算 10 秒、套件上限 30 秒
    command: node <website-cli-cleanup-q17zlgfu 证据目录>/bounded-competition.mjs
  - claim: 最终同一提交仍须重新预检并完成本机扩展矩阵
    kind: integration
    status: pending
    sha: 0838260c57c8088fafd35a380dcb1e66c52e2873
    environment: macOS arm64，本地扩展全端矩阵
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 14bd2ee5d186586b6359caa2ca374db37e996b38 --preflight-report <本轮报告>
    reason: 本改动只修复首错取证和本地首错停止合同，不能把定向验证当作全面验收或原导航故障已修复
---

# 网站导航首失败取证

## 症状

扩展流程 `de0d9ab2-0b29-4da6-87fd-730266508e4b` 的前 23 阶段通过；网站阶段 Chromium 的 RN/Lynx 本地化链接用例首 attempt 失败，重试通过。首 attempt 没有 trace，因为旧配置只在首次重试采集；不能把重试成功的轨迹当成失败现场。

独立解析首 attempt 的步骤得到：第三次首页导航已返回，后续 565 个轮询步骤都停在资源或连续空闲门禁，没有进入运行时读取。实际状态为 `failed`，持续 59760ms。Playwright 1.64.1 的 matcher 会使用测试截止时间减 250ms 的预算，并报告 `Test timeout of 60000ms exceeded`；这与硬 runner 的 `timedOut` 必须区分。原失败里具体哪个请求仍在等待，现有证据不能回答。

## 根因与纠正

另一轮带未触发统计 route 的真实探针捕获到旧文档脚本事件在新导航请求之后才到达，并一直没有终结事件。route 本身会改变网络拦截与缓存条件，不能把它说成完全不变的 canonical 复现，更不能据此断言原首错的精确根因。

三浏览器公开 `Request.timing()` 探针显示，尚未得到响应的旧请求和当前请求都可能为 `startTime: 0`。真实 HTTP 103 Early Hints 探针还证明 Firefox 会在主文档响应与 commit 之前发起当前文档的必要图片请求。因此，按事件到达先后或未知 timing 归属请求、在 commit 时无差别清空等待集合，都会丢失真实资源门禁。Referer、资源目录与 URL 相似也不能普遍证明 Request 的发起 Document。

本次不改 hydration、字体、Document 身份、主文档 HTTP/cache、commit/finished、代际或非统计资源连续 500ms 空闲断言，不改统计过滤、官方测试时限、截图与性能阈值，也不把未知归属资源排除。

## 诊断与停止合同

辅助函数失败时附加 `website-navigation-state.json`，仍抛出同一个原始异常。附件记录实际 pending Set、主请求/响应/commit/finished/failure、初始 Document 身份、导航代际、当前轮询关卡、公共 timing 和有界网络事件。Request 的某个字段无法读取时，其他字段与请求仍保留，错误作为 secondary 信息记录；不读取 cookies、全部请求头或响应正文来取证。

只读运行时快照最多每秒发起一次，保留最近五个样本及采样开始、完成时的代际。它不创建 Document 身份，也不参与 readiness；跨文档采样不能被解释为请求归属。失败时补样最多等待 250ms，标明未完成观察。附件失败单独输出，不能覆盖原异常。真实 `requestfailed` 只记 failed，结算状态复用不伪造 `requestfinished`。

默认 trace 改为 `retain-on-failure`，保留首个失败 attempt。本地 canonical 配置固定 `workers: 1`、`retries: 0`、`maxFailures: 1`，由 Playwright 原生首错退出阻止后续调度；全局普通测试配置的重试策略不变。现有上层命令传播失败并按归属回收进程，不靠外部观察终端符号去抢先发信号。

## 验证

真实 HTTP 500 回归保留一个未完成业务 fetch，要求原错误、实际 pending、事件、运行时与监听器收尾同时成立。原 helper 在附件缺失断言上得到 red。最初独立绿色后，为严格证明请求发起而引入流式主文档门闩，Firefox 在相关合同中出现真实死锁：仅有主文档 500 响应，没有 commit、finished 或业务 fetch。该夹具把文档 end 依赖于尚未执行的脚本请求，形成循环；不能据此断言 Firefox 具体缓冲机制或产品缺陷。

夹具现完整返回 500 HTML：inline fetch 后跟一个 parser-blocking 外链脚本；仅该脚本响应等待服务端收到业务 fetch，业务响应仍保持未完成。这样 DOMContentLoaded 依赖真实业务发起，主文档本身不再等待脚本。保留所有原断言，不加 sleep、填充字节或浏览器跳过。

真实子 runner 分别验证原生首错停止、canonical 型 poll 预算截止及硬 runner 截止。前者要求首例仅 retry 0 一次、后例完全未执行；poll 型要求原 timeout、首 attempt trace 和实际 pending JSON 同时存在。硬截止只承诺已经证明的原 timeout 与 trace，不能扩大为任意强制中断都保证 helper 附件送达。JSON reporter 可能把 Buffer 附件内联为 base64 body，回归同时支持 body 与 path。真实浏览器子命令使用仓库受管进程生命周期，异常与清理错误同时保留。

最终相关验证分两次完成：原 138 项合同为 110 通过、28 项既有边界跳过；迁移后的超时 E2E 三浏览器各跑 poll/hard，共 6 项通过。合计 144 项声明、116 通过与 28 项既有跳过，不能写成同一轮 144 项执行。命令配置与真实首错停止共 8 项通过，最终候选 lint、网站类型和规则检查通过。

仅执行一次从原 canonical 首 attempt 的 startTime 排序还原的 169 项 Chromium 前缀：150 项英文内容、4 项侧栏、8 项完整截图、1 项截图合同及首页前 6 项。四份前置 spec 逐字节相同，index 只替换 fixture import，逆替换恢复原全文。真实 startTime 顺序与清单逐项一致，169 项全通过、无重试、无跳过。RN/Lynx 原超时本轮未复现，仍不能声称原故障根因已定位或修复。

外部 fixture 只读启用 CDP 网络与页面观察，不拦截、不清缓存、不更改请求。6 份 ledger 均有效，Playwright report 的业务错误、全局错误及 ledger 的 secondaryErrors 均为空。该外部诊断 fixture 的 `use(page)` 不会把业务异常抛回 fixture，因此不能依靠缺失 `ledger.primaryError` 判断业务成功；附件失败分支本轮未触发，结论直接依据 Playwright attempt 的原始状态与错误。正常导航 helper 的独立失败附加逻辑不受此限制。

进程与端口收尾按本轮归属核对：记录的 19 个 PID 均退出，本轮 7 个监听端口及此前超时探针 2 个端口均无监听。没有执行全局清理，也没有触碰用户微信 IDE 登录态。所有验证均为定向证据，同提交扩展 57 阶段验收仍待主任务完成。

## 后续完整流程的聚合异常

`174cd17c8e710073f983ad149386c97ec6b073db` 上的完整流程 `bf248624-2981-4fec-9699-506b075e0af2` 在第 2 阶段单测停止：906 文件、9714 项通过，1 文件、1 项失败，另有 1 项预期失败，5 文件、44 项跳过。失败为真实 CLI 首错停止回归预期 `exit=1 signal=null`，实际最外层消息为 `全面测试执行与会话收尾均失败。`。原日志没有输出执行与收尾聚合异常的内层原因，夹具目录又已按既有 finally 删除，无法事后还原精确原因；执行异常也可能来自身份观察或中断，尚无证据确认为 CLI 业务退出失败，不得将静态推测的进程表时序认定为本轮根因。

现只给原退出码断言增加 `formatWorkflowError(failure)` 作为失败上下文，完整展示后续可能出现的 `errors` 与 `cause`。通过条件及其后首例仅执行 retry 0、后例不执行、最大失败数、失败数和重试配置的全部断言不变，不把聚合错误接受为通过，也不改生命周期、进程树身份归属或任何清理时限。

先用同配置的独立真实 CLI 夹具取得正常 `exit=1 signal=null`，首例仅执行一次、其余 5 项未执行，聚合错误未复现。增加断言上下文后，同文件常规定向套件 8 项通过；再执行唯一一次有界竞争诊断，在 4 个 CPU 子进程运行时同文件 8 项仍通过。两次通过不能覆盖原首次失败，也不能证明收尾逻辑已修复。原完整流程日志保存在 `e2e/.artifacts/full-validation-recovery/canonical-bf248624-2981-4fec-9699-506b075e0af2/workflow.log`；独立诊断的 `exact-first-error.txt`、`exact-summary.json`、`command-directed.log`、`command-competition.log` 和 `competition-summary.json` 保留在本轮 `website-cli-cleanup-q17zlgfu` 证据目录。

竞争诊断明确拥有的 4 个 CPU 子进程均在套件结束后逐个 SIGTERM 并等待 close，套件本身以 0 退出，后续按记录 PID 核对均不存在。夹具不使用浏览器 fixture、未创建页面或服务监听；没有操作微信 IDE、用户浏览器或其他任务的进程。下一轮必须在源码改变后重新预检，再运行唯一完整入口取得必要数据；本次仅增强取证，原聚合异常根因和最终同提交扩展验收仍待确认。

## 适用边界

修改限于网站私有测试设施、回归与本记录，无公开包行为变更，不新增 change intent 或 static/PNG 基线。已有黄金截图、跨端完整性与 0.05 差异门槛不变。所有初始假设、探针、夹具失败、回归 red/green、首 attempt trace、原始 JSON 和清理回执保留在本轮恢复 artifacts；未知的 canonical 请求归属仍明确未知。

## 规则评估

现有规则已要求保留首次错误、禁止重试掩盖失败以及按归属回收资源，无需新增目录级 AGENTS。缺口在测试设施：本地配置仍允许重试、trace 未覆盖首 attempt、helper 缺少实际 pending 与关卡诊断。本次把这些合同落到配置及回归；未知请求归属仍保留未知，后续行为修复必须由实际首错证据支持。
