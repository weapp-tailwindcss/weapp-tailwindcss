---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 812bedaf515c22a1b4b157199dc4d24d0dd12a75
regressions:
  - e2e/react-native-ios-screenshot.test.ts
  - e2e/react-native-ios-screenshot-sample-lifecycle.test.ts
  - e2e/react-native-failure-capture.test.ts
  - e2e/react-native-pair-pixels.test.ts
  - e2e/react-native-startup-owner.test.ts
verification:
  - claim: 首次 iOS 在 TSX HMR 第二帧耗尽原十秒预算
    kind: ci
    status: failed
    sha: 812bedaf515c22a1b4b157199dc4d24d0dd12a75
    environment: macos-15-intel hosted x86_64，Xcode 26.3，iOS 18.5，attempt 1
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41922642214/job/126899595487
  - claim: 唯一同提交确认在另一 TSX HMR 用例第二帧再次耗尽原预算
    kind: ci
    status: failed
    sha: 812bedaf515c22a1b4b157199dc4d24d0dd12a75
    environment: macos-15-intel hosted x86_64，Xcode 26.3，iOS 18.5，attempt 2
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41922642214/job/126926169924
  - claim: 正式采集禁止主动身份查询与采样的回归在原实现失败
    kind: unit
    status: failed
    sha: 812bedaf515c22a1b4b157199dc4d24d0dd12a75
    environment: macOS arm64，Node 24.22.1，基于该提交加入未提交回归，生产实现仍为原版本
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-screenshot.test.ts --testNamePattern 'acceptance 截图只允许' --update=none --coverage.enabled=false
  - claim: 正式与诊断隔离及原预算、取消、像素回归十一文件一百零二项通过
    kind: unit
    status: passed
    sha: 812bedaf515c22a1b4b157199dc4d24d0dd12a75
    environment: macOS arm64，Node 24.22.1，基于该提交的未提交修复工作树；未操作设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-screenshot.test.ts e2e/react-native-ios-screenshot-streams.test.ts e2e/react-native-ios-host-resources.test.ts e2e/react-native-ios-screenshot-sample.test.ts e2e/react-native-ios-screenshot-sample-lifecycle.test.ts e2e/react-native-failure-capture.test.ts e2e/react-native-pair-pixels.test.ts e2e/react-native-frame-evidence.test.ts e2e/react-native-reporter-session.test.ts e2e/react-native-startup-owner.test.ts e2e/react-native-launch-wait.test.ts --update=none --coverage.enabled=false
---

# 正式计时与 profiling 边界

## 症状

`812bedaf` 的两次 iOS 均完成启动、readiness 与 baseline，但正式 TSX HMR 失败。首次 `type-tracking/default` 首帧 simctl 约 9486.7ms，PNG 解码约 252.5ms；第二帧在 pair 约 9845.9ms 才开始。确认轮的 `layout-overflow/default` 首帧 simctl 约 8496.2ms，解码结束在 pair 约 9643.6ms；第二帧约 9825.7ms 才开始。两次第二帧均被原十秒总预算取消，不能据截断后的约 189ms 命令时间推断正常截图成本。

首次 ZIP artifact `13371001322` 的 SHA256 为 `d3d54c6937530a1c9655658256290605fc5e8d73485bc83dfbdcc1fa206e4b74`；确认轮 artifact `13375035941` 为 `3129991d2b71a1dae7153dea4f25c81b86d2c6b730cb091d7599f965d7c5a2d2`。两轮已接受帧与失败首帧离线重算 geometry、pixel、control 均通过，但未完成后续 TSX/CSS 阶段，整轮仍失败。确认轮失败诊断在设备日志层耗尽原三十秒并正常收尾；没有把不完整诊断当作验收通过。

## 根因与纠正

Apple `sample(1)` 手册明确说明，该工具会按间隔暂停目标进程、记录调用栈、再恢复目标。原采集器在每条正式截图超过四秒后，对已核对属于当前 Node 的同一个 simctl PID 执行 `sample pid 2 10`。进程身份核验是必要的归属保护，但不能使主动暂停变成被动观测。

首次 target PID 73658、PPID 13074 等于本轮 hostPid，sample 操作窗口约为截图 4029.4–9172.2ms；确认轮 target PID 83661、PPID 17124 同样属于本轮，操作窗口约为 4036.5–8500.1ms。分别与正式截图重叠约 5142.8ms、4454.3ms。这些是工具操作窗口，不能称为目标精确暂停时长，也不能证明它造成最初四秒迟滞或解释全部八至九秒耗时。两轮其余成功截图最大约为 2.931s、2.381s，同样不足以单独确定 CoreSimulator 的全部根因。

### 实现边界

正式 `capture()` 继续执行原 xcrun 命令和 stat，只保留 spawn、exit、close、stdio、宿主资源与 event loop 的被动记录，绝不调用主动身份查询或 sample。独立 `captureDiagnostic()` 只在失败诊断 owner 内调用，返回 `Promise<void>`，不能直接接入要求 `Promise<string>` 的正式双帧采集。每条截图记录 purpose，诊断产物不能授予正式回执。

失败诊断还要求语义采集、iOS startup 和真实 native cleanup 均无在途任务。Metro 提前退出时，主等待可能先失败，但启动环境 Promise 仍在运行；因此不能只检查语义截图 pending。既有停止、取消、单次五秒排空和目录归属规则继续生效，未确认完成的操作不与新的诊断争用设备。

## 验证

新增回归先在原实现因正式采集发生一次主动身份查询而失败。修复后，超过四秒的正式截图身份查询和 sample 均为零次，失败诊断各一次；两条路径都仍执行一次原截图命令，且保存真实计时。原采样错误、迟到状态、外部取消和 drain 失败三项回归迁移到显式诊断入口。十一文件 102 项定向回归通过，包含真实自有 Node 子进程取消与部分 stdout/stderr 保留。

定向 ESLint、架构、AGENTS 与 diff 检查通过。同一组严格 TypeScript 选项，以六个修改文件作为入口并对照 HEAD 源码，相关诊断保持 38→38、零新增；该比较不代表全 e2e 类型检查通过，既有配置与类型错误仍保留。

## 适用边界

连续双帧十秒、完整 PNG/全像素、drain 五秒、startup 三十分钟绝对截止和 iOS job 五十分钟均未放宽，没有添加 case 内重试，也没有修改共享 native sample 或 Lynx 诊断。本轮未改 demo、夹具或生成样式，不更新 static 基线；未执行本地设备验收。移除计时污染仍需新 head 的 hosted iOS 确认，不能由本地回归推断全部截图迟滞已消除。

## 规则评估

不新增 AGENTS。现有准确 head、原预算、诊断不能替代正式回执及资源归属规则足够；用显式 API 和持久回归修正本次实现边界。
