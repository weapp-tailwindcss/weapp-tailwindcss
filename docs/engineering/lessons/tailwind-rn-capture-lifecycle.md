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

新双帧与 owner 协议尚需新鲜 prepare `--extended`、当前会话真实 computer use、verify 和真实端侧运行。旧 86a 成功不能覆盖当前源码。完整 HTTP/WS bundle 字节仍为 not-captured；Image/ScrollView、原生注册夹具、转换 oracle、WebKit visited、媒体分支与完整十五目标仍未完成。#1307–#1309 修复尚未合并到当前 main，总体验收保持 partial。

## 规则评估

不新增 AGENTS。用持久回归约束资源 owner、证据版本与最终恢复边界，执行现有失败保留、预检和资源归属规则。
