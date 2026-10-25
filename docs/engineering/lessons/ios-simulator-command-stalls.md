---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 34894ffcd7e89d1b39fc593cfee8205da06d0102
regressions:
  - e2e/react-native-ios-screenshot.test.ts
  - e2e/react-native-ios-screenshot-sample.test.ts
  - e2e/react-native-ios-screenshot-sample-lifecycle.test.ts
  - e2e/native-process-identity.test.ts
  - e2e/lynx-command-host.test.ts
  - e2e/lynx-command-observer.test.ts
  - e2e/react-native-native-wait.test.ts
  - e2e/lynx-ios-install-diagnostics.test.ts
verification:
  - claim: Expo 首次运行在 TSX HMR 的 shadow 双帧采集耗尽原 10 秒总预算
    kind: ci
    status: failed
    sha: 34894ffcd7e89d1b39fc593cfee8205da06d0102
    environment: macos-15 hosted arm64，Node 24.20.0，iPhone 16 Pro、iOS 18.5，attempt 1；实际 merge checkout 与作者 head 的 tree 相同
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40227547133/job/121272149917
  - claim: Expo 同参有限复测在首次 baseline 的 layout-aspect 双帧采集再次耗尽原预算
    kind: ci
    status: failed
    sha: 34894ffcd7e89d1b39fc593cfee8205da06d0102
    environment: macos-15 hosted arm64，Node 24.20.0，Xcode 16.4，iPhone 16 Pro、iOS 18.5，attempt 2；新 VM 与新设备身份
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40227547133/job/121279335187
  - claim: Lynx 首次运行在原 60 秒启动预算内未取得 simctl 返回
    kind: ci
    status: failed
    sha: 34894ffcd7e89d1b39fc593cfee8205da06d0102
    environment: macos-15 hosted arm64，Node 22.23.2，3 核、总内存 7516192768 字节，Lynx 4.0.1、iOS 18.5，attempt 1
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40227547136/job/121272173416
  - claim: Lynx 同参有限复测在原 120 秒安装预算失败，未进入启动或业务验证
    kind: ci
    status: failed
    sha: 34894ffcd7e89d1b39fc593cfee8205da06d0102
    environment: macos-15 hosted arm64，Node 22.23.2，3 核、总内存 7516192768 字节，Lynx 4.0.1、iOS 18.5，attempt 2；新 VM 与新设备身份
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40227547136/job/121279357307
  - claim: 慢截图诊断所有权、异步清理、进程身份与真实安装调用接线的 8 文件 69 项定向回归通过
    kind: unit
    status: passed
    sha: 63d113218ee093e29993551b36f06661bd060c17
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，CI=1、禁止更新快照；模拟命令与固定计时器，不操作设备
    command: pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-screenshot.test.ts e2e/react-native-ios-screenshot-sample.test.ts e2e/react-native-ios-screenshot-sample-lifecycle.test.ts e2e/native-process-identity.test.ts e2e/lynx-command-host.test.ts e2e/lynx-command-observer.test.ts e2e/react-native-native-wait.test.ts e2e/lynx-ios-install-diagnostics.test.ts --update=none --maxWorkers=1
  - claim: 新增诊断在准确新 head 的 Expo 与 Lynx iOS hosted CI 中取得真实原件
    kind: ci
    status: pending
    sha: 63d113218ee093e29993551b36f06661bd060c17
    environment: 目标为两个独立 macos-15 hosted job，各自绑定本轮 checkout、attempt、UDID 和原预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
    reason: 此诊断提交尚未取得远端原件；定向回归不能证明原生超时已解决，也不能替代更新后准确 head 的完整检查
---

# iOS 模拟器命令迟滞与诊断覆盖缺口

## 症状

PR #1316 的作者 head 为 `34894ffcd7e89d1b39fc593cfee8205da06d0102`；两个 workflow 实际 checkout 均为 `b68e1b7e91703606165bc65d3afd557cf617e48f`，已核对两者 tree 相同。Expo run `40227547133` 与 Lynx run `40227547136` 各有一次首次失败和一次同提交、同参数、同预算的有限复测。两类 job 使用不同 hosted VM，每次复测也创建新 VM 和新设备身份，不能合并为同一主机的性能样本。

| 入口与轮次 | 最早失败边界 | 原件中已观察的事实 |
| --- | --- | --- |
| Expo attempt 1 | TSX HMR 的 `effect-shadow/default` 双帧采集 | 第一帧截图约 8427ms，命令成功且几何、像素、control 均通过；第二帧约在总预算的 8814ms 开始，仅运行约 1206ms 就收到取消 |
| Expo attempt 2 | 首次 baseline 的 `layout-aspect/default` 双帧采集 | 第一帧截图约 6956ms，解码约 337ms、语义判断约 196ms，三项检查通过；第二帧在总预算的 7617ms 开始，约 2390ms 后被取消 |
| Lynx attempt 1 | `simctl launch --terminate-running-process` 原 60000ms 上限 | native build、bootstatus、安装和容器定位已完成；launch 的 stdout/stderr 为空，约 60065ms 收到 SIGTERM exit，随后 close |
| Lynx attempt 2 | `simctl install` 原 120000ms 上限 | bootstatus 完成；安装异常记录 `timedOut=true`、SIGTERM、duration 约 123067ms，未进入 launch 或业务断言；缺少安装命令独立生命周期诊断 |

Expo 的 10000ms 是整个连续双帧采集的总预算，包含截图、解码和语义判断，不是每帧分别 10 秒。第二次失败发生在首次 baseline，不能仅归因为 shadow 或 HMR。两次第一帧通过均不能代替连续两帧门禁。取消后的 exit、close 与 drain 均有记录，`capture-cleanup.json` 为 `pending:false, status:failed`，保留原错误；这里的 failed 不表示仍有待清理任务。

## 根因与纠正

目前确认的是命令迟滞和诊断缺口，尚未确认模拟器内部的唯一根因。Expo 两次失败双帧采集期间，Node 事件循环最大延迟约 25ms，主要等待位于截图子进程退出前；原 `simulator.log` 聚焦应用、React Native 和 bundle 消息，没有同一 VM 的宿主资源快照及 simctl/CoreSimulator 栈，因此不能判断延迟来自桥接、编码、I/O 或宿主调度。PNG 已是 simctl screenshot 的默认格式，也没有证据支持切换格式或添加预热。

Lynx 首次 launch 的同 VM 快照显示 3 核、约 7.5GB 总内存、load average `272.933 / 96.196 / 46.123`、空闲内存约 189MB；702 个进程中 163 个为 R 状态。simctl worker 的 155 个样本停在 `launchApplicationWithID → _sendBridgeRequest → host_support_mig_launch_app → mach_msg`。第二轮 bootstatus 期间也有计时器、ps 与 sample 的明显调度迟滞，但这些并非安装阶段样本。高负载是已证事实；load average 不是 CPU 利用率，free memory 也不是完整内存压力指标，不能据此认定 OOM、产品泄漏、CoreSimulator 死锁或某个进程是唯一原因，更不能将 Lynx 的主机事实移用于 Expo。

可修复的覆盖缺口分别位于截图诊断所有权和安装调用接线。提交 `63d113218ee093e29993551b36f06661bd060c17` 将已有只读 host/sample 实现提取到 [共享诊断目录](../../../e2e/native-command/sample.ts)，保留 Lynx 的原 re-export 和行为，并补充：

- [Expo 慢截图诊断](../../../e2e/react-native/ios-screenshot-sample.ts)：每轮最多领取一个持续超过 4000ms 的本任务截图子进程。先同步保存资源快照，再进行有界只读身份查询；只有原截图子进程仍存活、PID 未变、PPID 为当前 Node、可执行文件为 xcrun/simctl 时才采栈。exit、close、error 或取消后，迟到的身份结果不能重新授权采样。
- 诊断与截图分别收尾：成功截图立即返回，不等待诊断；最终 flush 以 5000ms 上限排空并保存失败，取消仅作用于本任务诊断子进程。身份查询失败或超时仍保留先前资源快照；不另发 simctl 探针，不操作共享服务。
- [Lynx 安装调用](../../../e2e/lynx/run-ios.ts)：为原安装命令传入 `install-command.json`，复用既有 observer 记录生命周期、同 PID 采样与只读 host 信息，保留原 120 秒安装预算和原错误传播。

两次同参运行均已失败，继续盲重跑不会补齐缺失的栈或安装阶段证据。此次保持双帧、像素、几何、control 和设备身份约束，不放宽预算、不加固定 sleep、重试或预热；先让下一次准确新 head 的运行留下可定位证据。诊断完善不等于底层超时已解决。

## 验证

上述 `verification` 的定向命令已在诊断提交上执行，8 文件、69 项全部通过；本次仅新增文档，没有重复运行这组测试。回归覆盖快命令零采样、一轮最多一次、原截图子进程退出/取消/PID 变化后拒绝迟到身份、身份超时仍保留快照、成功截图不等待诊断、flush 排空及失败保留。安装回归调用真实 `runIos` 入口并模拟外部服务，验证指定设备、原 120 秒预算、独立诊断路径以及安装失败立即阻断后续阶段，不把模拟命令视为真实设备通过。

持久回归路径在 frontmatter 中逐项登记；关键新增用例为 [采样所有权](../../../e2e/react-native-ios-screenshot-sample.test.ts)、[清理接线](../../../e2e/react-native-ios-screenshot-sample-lifecycle.test.ts)、[进程身份](../../../e2e/native-process-identity.test.ts) 和 [安装接线](../../../e2e/lynx-ios-install-diagnostics.test.ts)。诊断提交的定向 ESLint、严格 TypeScript（含 `exactOptionalPropertyTypes`）、`pnpm agents:check` 与差异检查均已通过。本文另执行规则与差异检查。

失败原件可从上列四个 job 下载：Expo 关注 `ios-screenshots.json`、对应 `.capture.json`、`.pair.json`、`capture-cleanup.json`；Lynx 关注 `boot-command.json`、`launch-command.json`、sample 和 host 记录，第二轮安装仅有原异常而无独立诊断。新诊断的远端原件仍为 pending，不能将旧 head 的失败或单测通过改写为更新后 iOS 已通过。

## 适用边界

本记录限于该作者 head、实际 merge tree 与上述四个 hosted job。Expo 使用 Node 24.20.0；第二轮 `ios-build-settings.json` 确认 Xcode 16.4、iOS 18.5 SDK。Lynx 日志确认为 Node 22.23.2、Darwin 24.6、Lynx 4.0.1；本复盘未独立确认其 Xcode 精确版本。两入口目标均为 iPhone 16 Pro / iOS 18.5，不能由此推广到其他 runtime 或本地设备。

未调整 demo、样式输出或 static 基线；未操作 IDE、登录态或共享服务。本地完整验收由主任务按新一轮预检单独执行，不受本次定向回归替代。后续须按新 head、attempt、设备身份和原始产物重新判断最早失败点，保留原异常，继续验证完整业务与清理链。因此总体维持 `partial`。

## 规则评估

不新增 AGENTS。现有固定预算、同提交有限复测、进程所有权和证据分层要求足够；本次通过负责模块的有界诊断与持久回归补齐覆盖，不把尚未证明的环境假设固化成规则。
