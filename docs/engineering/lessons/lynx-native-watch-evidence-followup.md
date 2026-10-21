---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: b40b3a1fb9c070c71869bc62b126d15647c63814
regressions:
  - scripts/ci/demo-matrix/rollup-file-identity.test.mjs
  - e2e/lynx-failure-evidence.test.ts
verification:
  - claim: 原生监听回归显式区分路径归属前提，并独立核对精确文件身份
    kind: integration
    status: passed
    sha: feb9f8ab887580bce4f6baabfe76960c03909432
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0；13 文件 151 项通过
    command: pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup --update=none
  - claim: 两端实际 reader 接受已登记主题诊断，继续拒绝任意路径和回执
    kind: integration
    status: passed
    sha: 645d4c14fe7e76091e7317e676b20889ea634f3a
    environment: macOS arm64，Node 24.18.0；iOS 文件容器与注入设备命令的 Android reader，4 文件 58 项通过
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-failure-evidence.test.ts e2e/lynx-native-failure.test.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-theme-overrides.test.ts --update=none
  - claim: b40 的 Lynx Android 运行工件经过完整摘要校验与正式 validator 独立重验
    kind: native
    status: passed
    sha: b40b3a1fb9c070c71869bc62b126d15647c63814
    environment: Android 11/API 30 x86_64，1080×1920，像素比 2.625
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39518561339/job/118957116162
  - claim: b40 的 Lynx iOS 在进入运行时断言前启动超时
    kind: native
    status: failed
    sha: b40b3a1fb9c070c71869bc62b126d15647c63814
    environment: hosted macOS arm64，Node 22.23.2；simctl launch 60 秒预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39518561339/job/118957116080
  - claim: 修复后的 Windows 原生监听以及当前源码 iOS 运行仍待验证
    kind: ci
    status: pending
    sha: 645d4c14fe7e76091e7317e676b20889ea634f3a
    environment: Windows Node 24 原生文件监听与 hosted iOS
    reason: 本地 macOS 合同不能代替 Windows 结果；诊断修复不能消除原始 iOS 启动超时
  - claim: 夹具退出等待当前构建及 bundle 关闭，并保留主体和清理异常
    kind: integration
    status: passed
    sha: 0cc9753cb30482cbc33e6e9c0b640c17275b23a9
    environment: macOS arm64，Node 24.18.0；14 文件 160 项通过
    command: pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup --update=none
  - claim: 本地全面流程在 static 阶段失败，后续阶段未执行
    kind: integration
    status: failed
    sha: b40b3a1fb9c070c71869bc62b126d15647c63814
    environment: 本轮扩展预检 c07a8131-7b1e-4e83-9c7a-30d7aef5309a 已验证、消费并收尾；57 阶段流程
    reason: 第 31 阶段四项失败；32 至 57 阶段及独立 Tailwind 15 目标未执行
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --preflight-report e2e/.artifacts/preflight/c07a8131-7b1e-4e83-9c7a-30d7aef5309a/report.json
---

# 监听身份前提与原生失败诊断合同

本记录接续 [完整资产渐变与原生退化](lynx-webpack-gradient-finalization.md)，保留历史失败；不是全面验收完成证明。

## 症状

准确 head `b40b3a1fb9c070c71869bc62b126d15647c63814` 的 Windows Node 24 Taro Vue watch 作业 `118957046099` 在前置 `test:demo:matrix` 失败，实际 watch round 尚未执行。路径归属测试期待旧 closer 调用一次，实际零次；其余 49 文件通过。

同 head 的 Lynx iOS job `118957116080` 在 `simctl launch --terminate-running-process` 超过 60 秒后退出。原始 ExecaError 的耗时约 60,076ms；命令诊断内部记录约 60,012ms，两者计时边界不同。尚无报告、PNG 或主题帧，不能计任何运行时效果通过。失败收集器额外出现 27 项白名单拒绝。

## 根因与纠正

路径归属测试依赖两次真实替换后 Number inode 必然不同，却没有断言此前提。生产路径会比较 inode，再决定是否释放和重绑；原失败没有充分信息区分身份复用、Number 精度或其它宿主条件，具体 Windows 条件仍 unknown。不能凭此添加生产 Windows 特判。

路径归属合同现在直接构造 changed/unchanged stats，覆盖 CJS/ESM 和 relative/Windows 回调路径，检查实际使用注册路径重绑、closer 唯一归属和最终恰好释放。真实 Rollup 原生 `fs.watch` 集成仍独立运行，覆盖 CJS/ESM 与共享依赖；不改为 mock 或 polling。

原子发布器在新旧文件同时存在时核对 BigInt dev+ino 不同，发布后核对目标仍是临时文件的精确身份；每轮输出与当前原生句柄再次对账。Number inode 与 safe-integer 标记只作为诊断。零 inode、Number 输入、发布错文件或相同新旧身份继续拒绝，设备号零值合法。历史非相邻 inode 可以复用。Windows 原子 rename 的冲突预算保持原有 21 次、100ms 间隔，不增加 CI 重跑。

失败诊断的代码根因则已确定：collector 请求媒体 7 文件和主题 27 文件，两个实际 reader 的白名单只含媒体。旧子进程测试注入自建 reader，因此绕过了实际白名单。现将两个端点与 collector 统一到同一固定、冻结文件清单；仍然精确匹配，不接受任意 geometry 正则、路径或通过回执。宿主 Java 和 Objective-C 的实际命名与合同一致，无需修改。

## 验证

Windows 测试修复的本地结果为 Rollup 相关 13 文件 151 项通过，涵盖生命周期、重建、共享依赖、路径归属及真实原生绑定。只有 macOS 结果，不证明 Windows 已恢复。ESLint 与 diff check 通过。

实际 iOS/Android reader 组合回归先得到 2 失败、7 通过，失败与远端相同：主题文件被白名单拒绝，原始错误变为双重聚合。共享清单修复后，相关 4 文件 58 项通过。逐字节核对全部 34 artifact 和 35 条 collection 记录；缺失情形保持 missing 和原始错误对象，Android 主题权限错误保留原始及诊断错误。POSIX、反斜杠、盘符、UNC、任意回执和未登记主题名称均在 IO 前拒绝。成功路径继续不采集失败文件，诊断目录保持 `diagnostic-only`，不能满足运行时门禁。

本批没有改 demo、样式或输出夹具，不需要重新生成 static；未放宽性能、截图、超时或支持预期。红绿日志在本任务忽略目录 `.tmp/lynx-failure-readers-{red,green-final}.log`，原生监听日志为 `.tmp/watch-identity-rollup-suite.log`，原始工件与核验记录为 `.tmp/ci-1314/b40-lynx-{android,ios}/`。

## 适用边界

Android 工件 `12311046312` 为 56,408,959 字节，SHA-256 `f36ecaa18bf4af12305092d384a11a8dd1911d02dd5d05b03ae0a5c1261489e7`。实际 checkout merge `df5a1202c4de90d6c1cfae5c1851aacb3c33ea22`，runId `306a97a0-53c6-4d1d-8f21-89b48ea45989`。正式 `readNativeReport` 严格重验通过：118 案例、54 支持、64 预声明拒绝，9 主题帧。`background-linear-gradient` 的 14 点蓝→绿→黄像素和 control 重算通过，probe PNG 已实际查看。没有使用 pending 或历史回执豁免。

iOS 失败工件 `12312316446` 为 1,511,291 字节，SHA-256 `09e123c876aada42f0369d1939b77e768f832dc65f1404db5fe9cfdd814674b3`，checkout 与 Android 相同。launch 期间诊断记录宿主 loadAverage 约 379、freeMemory 约 104MB，采样也超时；这不证明阻塞的具体根因。原始超时、8 项 missing 与 27 项白名单失败全部保留，没有重跑。

白名单在检查原生文件存在前就拒绝；修复后，启动失败期间尚未生成的主题文件应记为 missing，不能写成找回 27 份截图。该修复不解释或消除启动超时。Android 成功不替代 iOS、最新源码或全部注册能力的运行证据。

b40 的 Benchmark 五分片、Synthetic 与最终 Performance guard 已成功，旧 3bf 的正式性能失败仍保留，根因 unknown。新的成功不改写旧失败。当前 57 阶段全面流程与后续统一 Tailwind 15 目标仍须各自准确绑定源码和独立预检；合同、编码或 Android 成功均不能代替完整验收。

## 规则评估

没有新增或放宽 AGENTS 规则。以共享固定合同及实际 adapter 组合回归修正已有边界；不把单测成功提升为设备成功，也不重置微信登录态或模拟器。

## 后续失败与夹具资源边界

head `41ccc8d2eb22b03464908adc7a0a6b737829b1d8` 的 Windows job `118975013019` 在 `rollup-watch.test.mjs` 删除临时目录时出现 ENOTEMPTY。相同前置矩阵的 job `118975012654` 成功，不能替代失败作业。原 finally 可能覆盖主体异常，因此不能据日志宣称功能断言全部通过。

[Rollup 4.63.0 的 closeWatcher 合同](https://github.com/rollup/rollup/blob/v4.63.0/docs/plugin-development/index.md#closewatcher) 允许当前构建在 watcher 关闭后继续。夹具丢弃 `result.close()`，且把 `watcher.close()` 当成输出屏障，存在删除目录与写入重叠的窗口。纠正位于夹具：持有并返回 bundle 关闭任务，在 close 监听器等待本轮 START→END，再移除资源；关闭异常延后报告，避免截断 END。该关闭入口只用于用例主体退出，不能在构建事件内部等待自身。

CJS/ESM × generateBundle/closeBundle 的四个显式门闩回归在旧行为下全部失败，清理提前完成；修复后全部通过。审查再发现初始化尚未接管时的 close 占位函数；增加 CJS/ESM 两个首个 START 前退出的门闩回归，均先失败再通过。另验证 bundle 关闭失败、重复关闭共享同一 Promise，以及主体、关闭和删除错误全部保留。Rollup 相关 14 文件 160 项、ESLint 和 diff check 通过；不加 sleep、删除重试、超时或 CI 重跑。尚须 Windows 实际结果确认，不能把已复现的窗口直接写成原 ENOTEMPTY 的唯一原因。

同一 head 的 Lynx iOS job `118975427634` 仍在 simctl launch 的 60 秒预算失败；RN iOS job `118975308039` 在 10 秒宿主采集预算失败。Lynx 日志不再出现旧主题白名单聚合错误，但启动失败仍未消除；RN 日志未标明具体案例，不能套用旧 head 的案例归因。两个失败均保留，不重跑。

b40 全面流程已结束：前 30 阶段通过，其中单测 967 文件、10297 项通过，另有 5 文件、44 项跳过及 1 预期失败；网站三引擎 1989 通过、636 跳过。第 31 阶段 static 为 344 文件中 326 通过、3 失败、15 跳过，3550 项中 3508 通过、4 失败、38 跳过。Taro Webpack React H5 generator 对照的 snapshot 57 不符；Issue 1166 两目标各达 120 秒总预算；Issue 1241 watch 准备安装达 120 秒命令预算。32–57 阶段未执行，预检 lease 已消费，不能复用。

1241 的报告确认失败在 install，尚未创建 watch 工程；1166 Web 残留目录仅有 manifest，也未进入编译，Weapp 的具体阶段未知。pnpm 已复用若干包、downloaded/added 均为零，不能据此判断框架依赖解析完成或归因为扫描。后续须补齐安装阶段与取消证据、独立审查 CSS 差异并定向复验，保持 partial；上述失败不因后续成功而删除。

一次定向复验中，1166 两目标保持原 120 秒预算、上游 postcss-calc 8.2.4 与 Tailwind 4.3.3，分别约 1136/426ms 通过；1241 不设置依赖复用目录，准备约 2361ms 通过，同进程 20 阶段 watch 与逐阶段干净构建对照在约 70 秒通过。没有修改这两例的源码或预算；只能确认本次通过，不能解释首次安装停滞。命令分别为 `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1166-webpack-radius.test.ts --update=none` 和相同入口的 `e2e/issue-1241-watch.test.ts`；日志位于 `.tmp/issue-1166-targeted-5cf.log`、`.tmp/issue-1241-watch-targeted-5cf.log`。未发现原失败两个临时目录对应的残留进程。

head41 两份 iOS ZIP 均完整验证摘要：Lynx artifact 12313637402，1,551,634 字节，SHA-256 `6925989698689b65372d508138cbe7b201d03d54b016dad756e3e51f55c3c6e5`；RN artifact 12313122510，499,381 字节，SHA-256 `277370598ada78c90c916e3cd4bed0819c4af29150851bf9af62856005b619d0`。证据位于 `.tmp/ci-1314/head41-ios/`，身份标为 diagnostic-only。Lynx 采样停在 CoreSimulator 的 launch bridge/Mach 请求，3 核宿主 loadAverage 约 301、空闲内存约 90MiB；支持启动阻塞判断，具体资源根因未证实，35 项运行材料全部 missing。RN 是 baseline/layout-aspect/default：首帧约 6926ms 捕获，归档检查点为通过；第二帧约 7538ms 开始，10 秒预算耗尽仍无捕获回执，未重算成运行时成功。HTTP 500 是 reporter 返回采集超时的结果，不能另判 Metro 网络故障。

generator 对照原先在 README 断言后才保存 CSS，失败时缺少完整 actual。现在每项目在断言前归档独立目录，绑定源码 SHA、tracked diff、锁文件与旧预期摘要，使用序号文件保存全部规范化 CSS；状态固定为 generated-unverified。snapshot 断言和门禁不变，显式更新前仍保存旧预期摘要。限定 Taro Webpack React 项目的禁止更新复验再次出现相同 web 对照失败，weapp 对照通过；actual 留存在 `e2e/.artifacts/apps-generator-mode/generated/run-spiWEF/`，继续审查，不据数量变化直接更新基线。
