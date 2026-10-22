---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1307
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/weapp-tailwindcss/test/bundlers/webpack-processed-css-source.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-web-gradient.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin-hooks.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
  - packages/weapp-tailwindcss/test/core.test.ts
  - e2e/lynx-rspeedy.test.ts
verification:
  - claim: 完整资产兼容、来源映射、真实导入 watch 和转换夹具定向回归通过
    kind: integration
    status: passed
    sha: 3bf758008e7095609edfdcb52ae9bc75cae27faf
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本轮未提交修复，不代表原 head 已通过
    command: CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/bundlers/webpack-processed-css-source.test.ts test/bundlers/webpack-web-gradient.integration.test.ts test/bundlers/webpack-web-cascade.integration.test.ts test/bundlers/vite-plugin-hooks.unit.test.ts test/bundlers/vite-plugin.bundle.unit.test.ts test/core.test.ts --update=none
  - claim: 当前源码尚缺新的原生与全面执行证据
    kind: native
    status: pending
    sha: 3bf758008e7095609edfdcb52ae9bc75cae27faf
    environment: 当前工作树，新的全面执行必须重新预检
    reason: 原 head 双端 Lynx CI 失败，不能用本轮实际编码通过替代设备运行；性能退化仍未定位
---

# 导入合并后的渐变兼容与原生退化

本文接续 [main 三项 Issue 根因复验](lynx-main-root-verification.md)，不覆盖此前的失败与证据范围。

## 症状

本轮全面预检 `5f022ede-5f78-4e98-a213-6646dc9e2a55` 完成脚本、当前会话原生 Chrome 交互和 verify，报告只消费一次。基于 `3bf758008e7095609edfdcb52ae9bc75cae27faf` 的全面入口在第 2/57 阶段停止：根构建 71/71 通过，单测 963 文件通过、3 失败、5 跳过；10,283 项通过、1 项预期失败、44 跳过。后 55 阶段未执行。服务正常收尾，报告为 finished，不可复用。

两个 WebView mock 只有方向声明和 `linear-gradient(var(--tw-gradient-stops))`，缺少 position 到 stops 的完整消费链，新算法正确拒绝推测用途。正向 mock 补齐真实依赖并保留原有不得残留 `in oklab` 的强断言，独立负向合同不变。转换 API 单测的裸 context 依赖全仓自动扫描；改为真实独立小夹具，固定 basedir 与 source(none)，新增精确 runtimeSet 断言。不修改生产扫描、ignore、并发或超时。原三文件 246 项通过但耗时 80.86s，固定夹具后 10.36s；未证明原超时的具体耗时阶段，也没有证据说明扫描了被忽略的 `.tmp`。

同一准确 head 的 Lynx Android run `39512087341`、job `118935769266` 在 report-validation 失败。工件 `12306970581` 的 SHA-256 为 `3cd19f755f68fc4e32c267639a2503dcf941313b113ccb0a8a1ffbb340ef5317`。118 例唯一状态退化为 `background-linear-gradient`：14 个像素采样均为纯蓝 `[14,165,233]`，灰色对照渐变正常。`main.css` 的 `to right` 被后面的 `to right in oklab` 覆盖，TASM 同样保留现代插值 token；颜色与完整变量链均编码，不能归因于 encoder 删除。`initial` 仍编码于 supports 内，其实际匹配与独立影响未知。

## 根因与纠正

生成管线恢复本地 import 后才执行兼容，消费图此时不完整，保留 token 正确；框架随后合并导入，而原先没有在完整资产上重做渐变分析。修复位于 Webpack/Rspack processAssets 的 OPTIMIZE 阶段，所有 CSS 任务结束后读取本轮 compilation asset，早于压缩及 Lynx OPTIMIZE_HASH 编码；不后置读取源码、不改已序列化模板。

CSS 所有者 PostCSS 返回精确文本编辑；核心通过 ReplaceSource 和 updateAsset 更新构建图，保留框架 source map。只保存目标声明的原文，未启用 Web compatibility 时不解析 CSS。完整消费图算法不放宽：未展开 import、普通消费者、注册或查询等仍否决改写，原变量名及作者 reset 保留。

## 验证

最小回归先出现 2 项缺方向失败。审查再补出 BOM 偏移与结束回调顺序的 3 项失败：PostCSS 剥离 BOM 后的 offset 必须还原；完整资产处理必须在 HMR 计时及 onEnd 前完成。修复后覆盖 LF/CRLF、两类 BOM、中文与 emoji、Windows/POSIX/相对来源、转义变量、值内注释、同一行后继声明映射、幂等及未知消费。真实 Webpack watch 验证导入中新增普通消费者后保留 token，移除后恢复兼容，并核对编码阶段实际读到的资产。

新真实构建夹具曾在并行运行时达到单轮 20 秒预算；加入构建诊断后完整执行通过，进一步固定它的 tailwindcssBasedir，避免测试依赖全仓输入。保持原 20 秒预算，最终与其他五文件并行的 263 项全部通过，耗时 12.37s。不得据此称生产 HMR 性能退化已经修复。

实际 Rspeedy 构建、固定 decoder 的 28 项通过，分别检查生成 CSS 与实际 bundle 的方向、原动态变量和 initial。首次新增断言因 decoder 合法的函数内空白失败，改为只容许该空白的锚定语法断言，未放宽方向、变量身份或支持预期。PostCSS 全包 148 文件、1,669 项通过、3 项既有跳过；主题切换、恢复与 CSSOM 的三浏览器定向 15 项通过。

仅执行 `CI=1 pnpm e2e:lynx:static:update` 重生成 ReactLynx static evidence：118 项能力与版本结果零差异，仅 generatedAt 更新。后续正常入口继续使用 CI=1、--update=none。包构建及正式 `tsconfig.typecheck.json` 类型入口通过；误用包通用 tsconfig 的直接 tsc 将测试和仓外源码纳入 rootDir，失败日志保留，不把该命令写成类型通过。新增源码和新集成文件的定向 ESLint 通过；旧测试目录默认忽略，强制扫描的既有错误未批量改写。

重建当前依赖后，最终 `CI=1 pnpm e2e:lynx --update=none` 为示例 205 项、E2E 39 文件 780 项通过；包含真实开发与生产构建、固定 encoder/decoder、原始静态合同及禁止更新的 static 比较。首次并行调用核心 hook 单测碰到同工作树包构建清理 dist，产生入口解析错误且没有收集测试；构建与消费测试改为顺序执行，失败日志保留，不计为代码回归或成功执行。架构检查为 37 包、1,428 源文件通过，agents 为 67 规则、347 文档、1,005 命令、零错误。

## 后续全面单测与活进程快照边界

提交 `6977733a2d50a9c6f6632532da66dd9d2acf69f4` 后，新预检 `ee14aac9-7ae9-4ece-9a65-c71a350955e2` 的全部脚本、当前会话原生 Chrome 输入/点击/截图与 verify 通过；本任务探针标签已关闭，用户原页面保留。报告领取一次并随全面入口正常收尾为 finished，不能复用。根构建 71/71 通过，第 2/57 阶段为 965 文件通过、2 失败、5 跳过；10,293 项通过、1 项预期失败、44 跳过，后 55 阶段未调度。原两个 WebView mock 和 core 夹具回归已通过。

第一项新失败是 `v5-assets.ts` 增长至 514 行，违反既有 500 行生产源码合同。Web 完整资产处理与小程序最终哈希收尾被提取到同目录 `v5-assets/final-css-assets.ts`，主 hook 保留调度和阶段选择，不删除空行凑数或放宽门禁。已有真实 Webpack 导入/watch、子编译、来源与生命周期回归连同源码上限检查共 5 文件、189 项通过。

另一项是天然 GC 测试：活进程快照已有 147 个 batch，加 startup 为 148 条数据记录，但最后一份 accounting 的 dataWrites 仍为 147。observer 先同步写完整 batch，再单独写 accounting；跨进程读取可落在两次写入之间。末行有换行不能证明两条记录是原子事务，业务 ready 也不是 observer 的发布屏障。该证据不证明生产丢记录，控制器本来就用 lastWriteAccounted 标记这类边界。

测试继续在活进程中核对 major 回调已落盘、身份、内存与时钟，正常退出后重新读取完整快照，严格比较全部事件与写入数；同时检查最终文件保留原始前缀。新增确定性回归使用完整的 startup → batch → accounting → batch，必须报告“格式有效、末写入未记账”，追加匹配 accounting 后才可通过。未增加重试、sleep 或 force GC，未改生产 writer 与性能门槛。GC 天然进程、控制器与限额回归共 3 文件、19 项通过；日志为 `.tmp/gc-stable-snapshot.log`。

只读复核再发现读取边界遗漏：生产 writer 允许短写循环，活进程或信号退出的文件可能具有半条尾行。确定性的 17 字节半行回归先失败，再将测试读取器改为只解析完整前缀并保存原始文本；正常退出仍强制末行完整、全量计数，已完成的无效 JSON 行仍必须失败。三文件最终 20 项通过，强制扫描这两测试文件的 ESLint 通过，红绿日志为 `.tmp/gc-partial-snapshot-{red,green}.log`。没有修改生产取证与阈值。

为继续修改测试，已主动 block 并关闭尚未领取的预检 `a7d9b440-fb83-4d56-b1b9-da4dd48a7cee`：脚本通过，仅完成当前会话探针读取和截图，没有完成输入/点击、verify 或全面调度。任务临时标签已关闭，不能用此报告放行。

本批不改变样式语义或夹具，因此不再次改写 static 基线；真实导入与 watch 回归继续核对相同输出。源码类型入口通过。完整失败保留于 `.tmp/full-acceptance-6977733a2.log`，模块拆分回归位于 `.tmp/webpack-finalizers-split.log`。修改后仍须新建全面预检。

范围审查确认，57 阶段没有调度统一 `e2e:tailwind` 的 15 目标及全部补全的实际转换审计；static 合同里的少量 mock 也不代表 23,286 个候选已运行。57 阶段完成后仍须另一次扩展预检和统一入口，不能复用 lease。既定 not-run 会被统一报告门禁拒绝，应沉淀逐项 partial 结果，不能为取得零退出而降低证据要求。

## 适用边界

准确 head 的 Benchmark run `39512087343`、job `118937280022` 有四项正式失败，阈值保持 5%。HMR plugin 中位数 1,838→2,398ms（+30.47%），P95 1,848→2,436ms（+31.82%）；wall 中位数与 P95 分别增加 11.36% 和 6.59%。实际 checkout 为 merge `2f3f9b7b1d85984e7119ca81478eb02435a47b82`，环境为 Ubuntu 24.04.5、Node 22.23.3、pnpm 12.14.0。

工件 `12307765007` 的 SHA-256 为 `aaa56fd46f249aadf54cc6341733eadf32f5206465bb44cf1c02b2c70c35dda9`。三个样本的平均插件增量 497.67ms，其中 tasks.css 增 329.12ms、finalize.rootCss 增 163.24ms；Web compatibility 耗时仅约 0.001–0.003ms，此目标不走新增 Web 渐变图。没有逐文件缓存与停顿证据，根因仍 unknown，不能宣称 cache 失效或 GC 已确证。旧 macOS/Node24 带 preload 的诊断不替代该失败，不反复重跑碰运气。

原始日志与工件分别位于 `.tmp/full-acceptance-3bf758008.log`、`.tmp/web-asset-core-integration-final.log`、`.tmp/webpack-gradient-*.log`、`.tmp/lynx-final-asset*.log`、`.tmp/postcss-full-assets-green.log` 及 `.tmp/ci-1314/3bf-{lynx-android,benchmark}/`。这些本地证据不随仓库发布。

验收仍为 partial。修复后双端实际运行、完整 57 阶段和性能门禁尚待执行；RN served bundle/HMR 交付链、Image/ScrollView、RN/Lynx 注册夹具、独立转换 oracle 与六类 Web variant 的既有缺口继续单独登记。没有合并 PR、关闭 Issue 或重置微信登录态。

## 规则评估

本轮没有新增或放宽 AGENTS 规则。继续由 PostCSS 拥有 CSS 分析、构建器 API 拥有产物更新，以可执行的生命周期、来源映射和负向消费回归固定现有安全边界。
