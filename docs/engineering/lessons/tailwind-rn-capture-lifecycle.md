---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 86a19f2abcf47b2c20145d432e07bb4af9e2b9c0
regressions:
  - e2e/react-native-native-wait.test.ts
  - e2e/react-native-frame-evidence.test.ts
  - e2e/react-native-reporter-session.test.ts
  - e2e/react-native-runtime-artifacts.test.ts
  - packages/react-native/test/metro-store.test.ts
  - scripts/ci/demo-matrix/rollup-file-identity.test.mjs
  - scripts/ci/demo-matrix/rollup-polling-identity.test.mjs
  - scripts/ci/demo-matrix/rollup-polling-readiness.test.mjs
verification:
  - claim: 旧阶段门禁在三浏览器完成三个实际阶段，但不能覆盖新双帧协议
    kind: integration
    status: passed
    sha: 86a19f2abcf47b2c20145d432e07bb4af9e2b9c0
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，本轮 extended 预检、当前会话 IAB 真实交互与 verify 通过
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/f69160ba-8f1b-48c3-9c7e-737af4c719b3/report.json --target expo-chromium,expo-firefox,expo-webkit
  - claim: 旧协议的 RN iOS、Android 和 Expo 三浏览器 hosted 运行成功
    kind: ci
    status: passed
    sha: 86a19f2abcf47b2c20145d432e07bb4af9e2b9c0
    environment: GitHub Actions，实际 checkout merge b4ff0d4b9fb042a8c590e95948a741e779d17fde，parents 为 main 7d80eb1b 和本 head
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39629380581
  - claim: 旧 head 的 Mpx 构建耗时仍超出现有门槛，根因尚待独立 profiling
    kind: ci
    status: failed
    sha: 86a19f2abcf47b2c20145d432e07bb4af9e2b9c0
    environment: GitHub Actions，三份正式样本，计时范围和门槛未改变
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39629380200/job/119323657572
  - claim: 新双帧协议及 owner 收尾通过定向回归，真实端侧尚待验证
    kind: unit
    status: passed
    sha: 86a19f2abcf47b2c20145d432e07bb4af9e2b9c0
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交改动，CI=1、禁止更新基线
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-reporter-session.test.ts e2e/react-native-frame-evidence.test.ts --update=none
  - claim: v3 连续帧协议在 Expo 三浏览器及 RN Android、iOS 完成三阶段采集和独立离线重放
    kind: native
    status: passed
    sha: 0c873b02d7b1de1bdc89975bc0f937a854dedb9f
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；fresh extended 预检 31a957c5、当前会话原生 Chrome 真实交互与 verify 通过；每目标仍有 1260 项注册能力未执行
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/31a957c5-c743-4d44-9321-e68afe9b6513/report.json --target expo-chromium,expo-firefox,expo-webkit,react-native-android,react-native-ios
  - claim: 新 head 的 Expo 三浏览器 CI 首先被包类型检查阻断，未进入运行时
    kind: ci
    status: failed
    sha: 0c873b02d7b1de1bdc89975bc0f937a854dedb9f
    environment: GitHub Actions，实际 checkout merge af556147266cee7b85237643124c8cbdf4c42673，包含本 head 与 main 7d80eb1b
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39636208131
  - claim: 包取消兼容与采集协议通过本地定向回归，不能覆盖后续 hosted 检查
    kind: unit
    status: passed
    sha: 0c873b02d7b1de1bdc89975bc0f937a854dedb9f
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交修复；CI=1、禁止更新基线；21 文件 281 项通过
    command: pnpm e2e:react-native-compatibility --update=none
  - claim: polling 夹具修正身份精度和基线握手后，脚本矩阵通过，但不能消除历史 raw 匹配失败的未明原因
    kind: integration
    status: passed
    sha: 0c873b02d7b1de1bdc89975bc0f937a854dedb9f
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交修复；CI=1、禁止更新基线；53 文件 407 项通过；此前一次 406 通过、1 失败单独保留
    command: pnpm test:demo:matrix
---

# RN 截图生命周期与双帧证据

## 症状

历史 iOS CI 首例的第一帧通过，第二帧在既有十秒宿主判定预算内未完成。没有逐命令退出与 CPU 时间线，不能认定第二条 simctl 卡死，也不能以另一次成功消除首次失败。旧回执只持久化最终 PNG，无法独立重放“两帧连续通过”的声明。

复审还发现：逻辑超时可能先于真实截图结束；report 写入也可能仍在途。原收尾会复制或删除证据目录，迟到操作仍可写文件。若第一次 drain 超时而操作在关闭 provider 期间才结束，旧流程又可能归档成功却遗漏 HMR 源码与设备设置恢复。

## 根因与纠正

将判定超时和真实操作结束分别管理。十秒采集判定、每例抵扣上限不变；超时立即取消并失败，只有逻辑 finally 与真实 Promise 均结束才释放 owner。独立五秒收尾预算不转换为成功预算，不合作操作仍保留 pending。晚到拒绝交给 drain，不丢弃错误。

report completion 与发布快照读取也进入 owner 生命周期。停止后拒绝新 context、case 和 report，文件读写传递 AbortSignal。Playwright 不提供取消截图参数，因此先收集 Buffer，确认未取消后才独占写入本轮文件。provider 停止后最终 drain：仍 pending 则保留原始临时证据；已结束则恢复 marker、CSS 与 Android 设置，再归档。恢复失败仍归档诊断并使流程失败。

每次真实截图保留独立 frame PNG、摘要、长度、阶段相对时间与三个语义检查点，全部尝试帧保留，最后两帧必须连续通过。相邻完整 Buffer 完全相同才复用本 pair 上一帧计算，仍执行两次截图，并显式标记复用来源；字节不同则重算，不跨 pair 或 revision 缓存。离线 validator 对每帧独立解码、重算和校验摘要，再验证末帧兼容入口。阶段索引升级为 v3，拒绝旧单帧报告冒充新协议。

## 验证

本轮依次固化缺少 pending/drain、旧单帧误通过、微任务重入、取消仍交付快照、report owner 写入和最终恢复遗漏的红例；原始失败日志保留在 `.tmp/rn-*-red.log`。最后恢复遗漏红例三项失败，修复后 reporter、frame、runtime-artifacts 三文件二十七项通过。此前统一入口二十一文件二百七十九项通过，该结果早于最后恢复修复；最后修复由上述定向用例复验，不改写历史计数。

包回归二十二文件一百五十九项及包构建通过；示例按依赖构建完成后顺序复验，八文件三十三项及类型检查通过。一次将示例测试与依赖 build 并行的执行失败属于编排错误，保留 `.tmp/rn-frame-example-test.log`，不计通过。`pnpm e2e:react-native:static:update` 定向重生成并审查，仅两处 fixture hash 和验证时间改变；新 hash 为 `a52314acd3bc18a6bbaba1c87d11faf4f6e5ee982436bc847d1aea1cc6131d2e`。

旧源码 86a 本地运行 `a6e2210a-f4a8-4bce-a515-c4231f196eeb` 的三个浏览器各完成 baseline、TSX HMR、CSS HMR，每阶段一百一十八例、四十回执；每浏览器三阶段保持同一 JS realm。三十一项支持仍分为二十六运行时和五编码，另八十七项预声明拒绝；每目标一千二百六十注册能力未执行，统一入口 exit 1 正确拒绝全面通过。对应 hosted iOS job `119323519853`、Android job `119327894487` 成功，但旧工件未按新协议补写，iOS 工件尚未下载独立核验。

Mpx 同 head 的 build 中位数 `17306.728 → 18180.065ms`（+5.0462%），plugin `989 → 1194ms`（+20.728%）；本轮 RSS 下降，不能与 e1bb 的旧 RSS 回归混写。uni-app job `119323657765` 同一 merge checkout 的 build 中位数 `4937.524 → 5237.724ms`（+6.080%）、plugin `1570 → 1794ms`（+14.268%）、HMR plugin P95 `100 → 117ms`（+17%），均超过既有 5% 门槛。保留失败，不重跑碰运气，不放宽阈值。独立 profiling 不得混入正式门禁；inspector heap sampling 的强制 GC 不能描述为自然 GC，存活分配栈不等于保留关系。

首次预检 `83951f58-dfd7-465a-a4da-2b0d0573cf83` 的截图原件为 JPEG，主代理误命名为 PNG，签名断言失败，没有完成 computer-use 回执，过早 verify 被 ENOENT 拒绝。这是证据归档失误，不是环境故障，没有调度端侧。原件保留、正规转换后也不复用失败报告；已 block 并关闭服务。全新预检 f691 才完成真实交互与 verify。本任务 IAB 标签 10、11 均关闭并核对为空，用户 Chrome 页面未动。

## 适用边界

### 新协议的真实运行

提交 `0c873b02` 的第一次新鲜预检 `ec86bacf-cb6e-4fb4-8f22-b5fc400afc27` 因本进程未继承已有 Gradle 路径而失败，没有调度端侧，服务已退出；配置本机已有 Gradle 后重新 prepare，未安装、重置工具或设备。全新报告 `31a957c5-c743-4d44-9321-e68afe9b6513` 的扩展脚本全部通过，再以原生 Chrome 入口完成本轮 run ID 输入、点击与状态核验。截图原件保留，确认为 JPEG 后正规转换并核对 PNG 签名，完成真实调用归档后 verify 成功。本任务挑战标签已关闭并核对，用户页面保留。

运行 `597c18ac-7798-40f7-9cf1-aa3d1b551a43` 的 Expo Chromium、Firefox、WebKit、RN Android 和 iOS 各完成 baseline、TSX HMR、CSS HMR。每端三阶段保持同一 JS realm，每阶段一百一十八例、四十回执、八十份帧原件；合计六百回执、一千二百份帧原件。独立调用 `validateNativeRuntimePhases()` 对五端全部离线重放通过，逐帧摘要、解码、语义与阶段来源均复核。五端 cleanup 全部 settled、pending=false，marker/CSS 已恢复，prepare 服务正常退出。原始产物在 `e2e/.artifacts/tailwind/597c18ac-7798-40f7-9cf1-aa3d1b551a43/`，摘要在 `.tmp/rn-frames-0c873b0-summary.json`。

该结果的三十一项支持仍分为二十六运行时与五编码，另八十七项为预声明拒绝；不能写为一百一十八项正向运行时支持。每目标一千二百六十项未执行，统一入口 exit 1 正确拒绝全面通过。此次 iOS 成功只证明本机本轮连续帧通过，不能消除历史 hosted 超时的未明根因，也不能覆盖后续源码提交。

### CI 暴露的兼容边界

`0c873b02` 三个 hosted Expo Web 作业均先在 `manifest-store.ts` 的两处 `AbortSignal.throwIfAborted()` 触发 TS2339，未执行浏览器测试。RN consumer 引入的全局 AbortSignal 声明只有共有属性与事件 API。此前包 build 与示例 typecheck 通过不能覆盖包自身 consumer 类型检查，这是本轮遗漏，已本地执行包 typecheck 复现并保留 `.tmp/rn-abort-signal-types-red.log`。

先补七项取消边界红例（默认取消、Error、null、0、false、空串及没有 reason 的旧信号），全部因缺方法失败；再改为共有 aborted 检查。以 `"reason" in signal` 保留原始原因，包括原型属性与 falsy 值；没有 reason 才生成 AbortError，继续把 signal 传给文件读取和轮询 timer。不扩张 DOM 全局声明、不强制断言生产 signal 类型，不改变取消与 deadline 的原有优先级。

Windows repeated-watch run `39636207958` 的 job `119347267231` 则先在 polling 夹具的 `after.ino !== before.ino` 失败，实际 repeated-watch 尚未执行。日志中的 Number inode 超过安全整数范围，且没有 BigInt 回执，不能据此断言物理文件没有替换或确认该次精确 ID 的差值。夹具改用既有 BigInt helper 证明同时存在的新旧文件身份不同、发布后仍是原临时文件；临时文件继续置于被监视目录外。新增 Number 碰撞合同回归，保留真实 raw/change/失效/bundle=6 门禁，并只接受发布游标后的实际快照。ctime 不充当身份，也不假定 utimes 必然推进 ctime；若未来精度边界使产品过滤事件，仍应失败，不 skip 或放宽。

本地第一次 `CI=1` 定向复验有一项 Taro raw 快照匹配失败，四十一项通过，原日志 `.tmp/polling-exact-identity-ci-green.log` 虽沿用 green 文件名，实际 exit 1，不计成功。源码核对确认 Node 返回 StatWatcher 时首次原生 stat 仍可能在途，Chokidar closer 不等于 native baseline ready，但旧日志只有 bool，不能据此认定该轮唯一根因。

新增明确的 fixture 就绪协议：在同一个五秒截止时间内顺序发布内容不变的 metadata probe，取得真实 raw 前后采样；恢复固定 mtime 后再次核对 raw，并从真正构建的 `observedMtime` 导出核对恢复后的 bundle。初始 sentinel 与恢复值不同，旧 bundle 不能充当恢复证据；读取前后核对 Task 调度状态，Windows throttle key 通过既有路径身份 helper 查询。全部 probe 写入逐个 await，没有后台 interval；最后重新采集 before/身份和事件游标，最终 rename 只执行一次。七项 helper 回归覆盖首次 probe 被吸收、无 ack、无恢复 ack、旧 bundle、队列忙和迟到发布等边界。此协议只验证已经建立采样基线后的等长/固定 mtime 替换，不能证明“刚订阅即首次保存”窗口已修复；Task idle 也不等于所有原生异步 stat 已排空。

该握手第一版完整矩阵仍有一项 raw 快照失败（五十二文件、四百零六项通过），Vitest 又折叠了诊断对象，尚无足够轨迹判定具体原因。保留 `.tmp/polling-native-baseline-matrix-ci.log`，没有归因环境或豁免。随后修复 Windows key、补显式失败轨迹并在读取 bundle 前确认 idle，完整矩阵五十三文件四百零七项通过，日志 `.tmp/polling-native-baseline-matrix-trace.log`；该次成功不证明先前 raw 匹配失败根因消除，不继续相同配置盲重跑。后续若复现，将直接保留实际快照、精确身份、发布游标与 raw/change/失效轨迹。

包自身 typecheck、二十二文件一百六十六项及统一二十一文件二百八十一项在 `CI=1`、`--update=none` 下通过；此次没有更改 demo 源码、样式生成或 static 夹具语义，无需再次改写 static 基线。定向 ESLint（显式包含被默认忽略的两份测试）、agents 检查、diff 检查与 release status 通过。不新增 AGENTS，既有准确失败归档、路径身份和资源 owner 规则继续适用。

完整 HTTP/WS bundle 字节仍为 not-captured；Image/ScrollView、原生注册夹具、转换 oracle、WebKit visited、媒体分支与完整十五目标仍未完成。#1307–#1309 修复尚未合并到当前 main，总体验收保持 partial。

## 规则评估

不新增 AGENTS。用持久回归约束资源 owner、证据版本与最终恢复边界，执行现有失败保留、预检和资源归属规则。
