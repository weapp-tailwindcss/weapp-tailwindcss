---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 34894ffcd7e89d1b39fc593cfee8205da06d0102
regressions:
  - e2e/react-native-ios-screenshot.test.ts
  - e2e/react-native-ios-screenshot-streams.test.ts
  - e2e/react-native-ios-host-resources.test.ts
  - e2e/react-native-ios-screenshot-sample.test.ts
  - e2e/react-native-ios-screenshot-sample-lifecycle.test.ts
  - e2e/native-process-identity.test.ts
  - e2e/lynx-command-host.test.ts
  - e2e/lynx-command-observer.test.ts
  - e2e/react-native-native-wait.test.ts
  - e2e/react-native-runtime-artifacts.test.ts
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

### 后续命令的资源证据与绝对截止时间

作者 head `617d75866834e6d6dfc98e98218fb293f4b3215f` 的 [Expo iOS 首次运行](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40375892413/job/121762746736) 在 baseline `layout-position/default` 第一帧耗尽原预算。唯一采样机会此前已在 `layout-aspect` 使用；该次身份查询见到 `bash` 而按原白名单拒绝。失败的 position 命令没有自己的资源样本，不能挪用前一条命令或本机 Xcode wrapper 解释其迟滞。

每条截图命令现在分别记录启动、取消和 settled 时的同步主机数值，标明 `source: test-runner`，记录采集时刻与读取耗时。只读取现有 OS/Node API，不新增子进程、栈采样、重试或等待。取消快照的监听器在 execa 创建后登记；这只保证监听登记顺序，Execa 的实际 kill 在异步恢复后执行，不能据同步 mock 断言信号先于资源读取。读取异常独立记录，不覆盖截图结果。这些数值属于宿主及父进程，不能冒充截图子进程的资源或内核执行映像。

新增非零观察耗时回归还确认了独立的预算漏洞：`capture()` 在调用 `operation()` 后才安装完整 10000ms 计时器，使同步前奏不计入挂起路径的取消期限。旧实现对 100ms 与 10001ms 同步前奏的两项回归均失败。计时器现按本次原始 `started` 计算剩余预算，耗尽即取消；原 10000ms、真实操作锁、迟到错误及独立 5000ms drain 保持原语义。此回归证明截止时间记账缺陷，尚无证据证明它触发了上述 hosted 失败。

### 首次清理超时与最终归档

上述截止时间修复提交 `d12207253e2bcc53dcbe7a6eddc7b025e6b73bad` 的 [Expo iOS 首次运行](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40434227980/job/121959123056) 仍在 baseline `effect-shadow/default` 第二帧失败。第一帧的截图、解码、语义判断分别在 pair 的约 4450ms、6075ms、6974ms 完成，三项检查通过；第二帧约在 7126ms 开始，只剩约 2874ms。取消到 SIGTERM exit 约 68ms，exit 到 Execa settle 又约 9543ms，最终没有 ChildProcess close 或第二帧 PNG。日志同时保留独立的 `Native capture cleanup exceeded 5000ms`，不能由最终 `pending:false` 推断清理按时完成。

Execa 9.6.1 在根进程退出后仍等待所拥有的 stdio 完成；`forceKillAfterDelay` 约束根 PID 的终止，不是整个 Promise 的结束期限。当前原件缺少各条流的结束事件、失败 PID 的后代及句柄归属，不能直接归因为继承 pipe。69 次新增资源读取合计约 11.14ms，失败命令的三次读取合计约 1ms；这些父进程与主机数据不能解释为截图子进程的 CPU 或 OS 根因。

后续诊断仅订阅原 stdin 的 finish/close、stdout/stderr 的 end/close，分别保存命令开始、根进程 exit 和 Promise settle 时的流状态。观察器不读取、恢复、销毁或关闭流，不接管 error 事件，不增加子进程、采样、重试或等待；结束时移除本观察器的监听。独立 fixture 使用真实 Execa 与本任务 Node 父子进程，确认后代暂留输出 pipe 时，根进程退出并不等于 Execa 完成，释放自有 pipe 后才结束。它验证可能机制与观测点，不能证明上述 hosted 失败存在该后代。

组合回归确认了独立的报告缺口：首次 `drain()` 超时没有保存到 owner，操作随后成功结束时，最终归档可以写成 `status:settled`；操作迟到失败时，最终归档只记录晚错误。整个作业原有错误聚合已经保留首次超时，没有误放行，但独立归档缺少该历史。负责预算的 owner 现在保留首次清理超时；最终归档仍等待真实结束，随后交付同一超时，若存在晚拒绝则同时保留两个原始错误。重复或并发 drain 不复制等价超时，不改变原 10000ms / 5000ms、取消、进程终止或在途锁的边界。

## 验证

上述 `verification` 的历史定向命令已在诊断提交 `63d113218ee093e29993551b36f06661bd060c17` 上执行，8 文件、69 项全部通过；该阶段随后仅新增文档，没有重复运行这组测试。回归覆盖快命令零采样、一轮最多一次、原截图子进程退出/取消/PID 变化后拒绝迟到身份、身份超时仍保留快照、成功截图不等待诊断、flush 排空及失败保留。安装回归调用真实 `runIos` 入口并模拟外部服务，验证指定设备、原 120 秒预算、独立诊断路径以及安装失败立即阻断后续阶段，不把模拟命令视为真实设备通过。

持久回归路径在 frontmatter 中逐项登记；关键新增用例为 [采样所有权](../../../e2e/react-native-ios-screenshot-sample.test.ts)、[清理接线](../../../e2e/react-native-ios-screenshot-sample-lifecycle.test.ts)、[进程身份](../../../e2e/native-process-identity.test.ts) 和 [安装接线](../../../e2e/lynx-ios-install-diagnostics.test.ts)。诊断提交的定向 ESLint、严格 TypeScript（含 `exactOptionalPropertyTypes`）、`pnpm agents:check` 与差异检查均已通过。本文另执行规则与差异检查。

失败原件可从上列四个 job 下载：Expo 关注 `ios-screenshots.json`、对应 `.capture.json`、`.pair.json`、`capture-cleanup.json`；Lynx 关注 `boot-command.json`、`launch-command.json`、sample 和 host 记录，第二轮安装仅有原异常而无独立诊断。历史诊断提交的待验收记录不改写为成功；后续 d122 的官方原件已完整核验字节、SHA 与 ZIP CRC，实际 iOS 结果仍失败，不能用单测替代。

2026-10-27 随后提交为 d122 的资源与截止时间修复在 macOS arm64、Node 24.18.0 下通过 4 文件 33 项定向回归，命令为 `CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-screenshot.test.ts e2e/react-native-ios-host-resources.test.ts e2e/react-native-ios-screenshot-sample-lifecycle.test.ts e2e/react-native-native-wait.test.ts --update=none`。新增测试覆盖非零观察成本、取消监听登记顺序、资源读取失败后的原结果保真、后续命令独立资源以及同步前奏占用原截止时间；既有真实自有 Node 子进程取消和迟到错误回归也通过。新增资源回归接入本地兼容性入口及 iOS workflow；后续自然 CI 的真实失败见上节，不重置历史复测额度。

d122 的 iOS workflow 前置命令在本机与实际 hosted runner 均通过 14 文件 251 项，原生设备验收仍失败。该提交改动的 5 个 TypeScript 文件通过 `strict`、`exactOptionalPropertyTypes` 定向检查及 ESLint；规则与差异检查通过。历史原件、未定位的模拟器迟滞和完整本地验收失败均保留。

d122 之后的清理历史修复先运行 `CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-runtime-artifacts.test.ts --update=none -t 首次清理超时必须随最终归档保留`，旧实现的两项组合回归均失败。修复后截图、预算与归档的 3 文件 33 项通过；新增组合回归接入 iOS 前置命令，该完整命令在本机通过 15 文件 258 项。测试使用真实文件归档、固定计时器及受控 Promise，覆盖首次超时、重复与并发 drain、迟到成功/失败、最终恢复与归档，不启动设备或增加原生复测。

随后增加流状态观察与真实自有 Node 进程 fixture，对应截图与流的 2 文件 9 项通过。它保持原错误对象、根进程 exit 与流结束的独立语义；测试收尾通过专属 release 文件释放后代，并等待自有命令与 stdio close，不回收其他任务资源。

最终接入本地兼容性入口与 iOS workflow 的完整前置命令通过 16 文件 259 项。6 个截图、流观察与预算相关 TypeScript 文件通过严格类型检查（含 `exactOptionalPropertyTypes`）。归档组合测试的独立类型命令会牵引 112 项依赖诊断；用原始 d122 文件内容与当前内容分别创建相同 TypeScript program，诊断逐项相同，改动文件本身零诊断，因此不把该命令写成整体类型检查通过。

## 适用边界

本记录限于该作者 head、实际 merge tree 与上述四个 hosted job。Expo 使用 Node 24.20.0；第二轮 `ios-build-settings.json` 确认 Xcode 16.4、iOS 18.5 SDK。Lynx 日志确认为 Node 22.23.2、Darwin 24.6、Lynx 4.0.1；本复盘未独立确认其 Xcode 精确版本。两入口目标均为 iPhone 16 Pro / iOS 18.5，不能由此推广到其他 runtime 或本地设备。

未调整 demo、样式输出或 static 基线；未操作 IDE、登录态或共享服务。本地完整验收由主任务按新一轮预检单独执行，不受本次定向回归替代。后续须按新 head、attempt、设备身份和原始产物重新判断最早失败点，保留原异常，继续验证完整业务与清理链。因此总体维持 `partial`。

## 规则评估

不新增 AGENTS。现有固定预算、同提交有限复测、进程所有权和证据分层要求足够；本次通过负责模块的有界诊断与持久回归补齐覆盖，不把尚未证明的环境假设固化成规则。
