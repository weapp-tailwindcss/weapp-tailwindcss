---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1313
baseline: 52ceaf28fdaef00a1ed40dc6f9372cd5b15a269c
regressions:
  - e2e/tailwind-web-starting-timeline.test.ts
  - e2e/tailwind-web-lifecycle.test.ts
  - e2e/tailwind-browser-serialization.test.ts
verification:
  - claim: WebKit 首帧被固定调度窗口误拒绝，原生事件、后续单调进度、像素及恢复均通过原合同
    kind: ci
    status: failed
    sha: 52ceaf28fdaef00a1ed40dc6f9372cd5b15a269c
    environment: GitHub Ubuntu 24.04，WebKit 27.2；run 39393736454 attempt 1
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39393736454/job/118533016617
  - claim: 自然时钟、生命周期、CLI 闭包和 CI 接线共 76 项定向回归通过，未执行本地全面验收
    kind: unit
    status: passed
    sha: 52ceaf28fdaef00a1ed40dc6f9372cd5b15a269c
    environment: macOS，Node 24.18.0 / pnpm 12.14.0；该提交基础上的未提交 starting 采集与判定改动
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-web-starting-timeline.test.ts e2e/tailwind-web-lifecycle.test.ts e2e/tailwind-web-lifecycle-runner.test.ts e2e/tailwind-browser-serialization.test.ts e2e/tailwind-capabilities-ci.test.ts --update=none
---

# Starting 生命周期的原生时钟证据

## 症状

PR #1313 的 WebKit 能力测试只在 `runtime/lifecycle-starting` 的 `natural/first` 失败。工件 `12251062824` 的原始记录显示：39ms 插入后，首次渲染采样在 67ms 到达，opacity 为 `0.023333`。原判定要求首次 rAF 的 opacity 不超过 `0.02`，等价于要求 1200ms 过渡在 24ms 内被首次采样。实际 28ms 的正常进度被拒绝，后续 74 次严格递增、完整原生事件、起中终像素和恢复均通过。

完整工件的三次有界下载超时后，先验证存储端响应，再通过 HTTP Range 读取 ZIP 目录和两份诊断 JSON，共 144,032 字节；逐项验证 ZIP CRC 和 JSON SHA-256。保存选择性读取回执，未声称验证完整 ZIP 的 API 摘要。没有重跑 CI 来替代首轮失败，也没有把其他断言通过推导成全部 Tailwind 能力有效。

## 根因与纠正

首个 rAF 的执行时刻受调度影响，不能单独证明 starting 样式的起点。现在每轮持有浏览器产生的唯一 opacity `CSSTransition`，同步保存原生引用身份、目标引用、document timeline、currentTime、startTime、时序参数和完整两端 keyframes。终帧即使从 `getAnimations()` 消失，仍读取原对象并验证结束状态。重插必须产生不同对象；暂停取证也必须继续使用自然采样时持有的同一对象。

独立 oracle 固定为 `0→1 / 1200ms linear`。每帧比较三个量：document timeline 减稳定 startTime 得到的进度、原生 currentTime 的进度、computed opacity；三者两两使用原有 `0.005` opacity 误差限。Firefox 157 的三个时间戳各自舍入，实测差值为 0.02ms，因此不另造微秒级时间门槛，也不串联扩大语义误差。速率、时长、零延迟、单次迭代、正常方向、linear 和 0/1 keyframes 仍严格检查。

原生 pending 仅允许出现在进入运行态之前，保留 null 时钟，禁止通过 `Number(null)` 或旧判定补齐证据。完整自然运行、多个严格递增、中间态、可信事件、起中终 PNG、无 class control 和恢复要求均保留。起点与中点截图仍暂停同一个真实 transition；没有新建替代动画，没有调整像素的 2 通道误差限或任何支持预期。

## 验证

新增独立时钟夹具先复现 25 项失败，再验证晚采样、缺时钟、错起止值、错误样式、快进、对象替换、倒退、改速、延迟、错误迭代和 pending 回退等边界。32 项时间线回归已加入 `pnpm e2e:tailwind:contract`。连同原有生命周期、浏览器闭包和 CI 接线，五文件 76 项以 frontmatter 的定向命令通过；未运行完整合同集。

本地额外仅调用生产 `runLifecycleWeb` 的 `runtime/lifecycle-starting` 单案例，后台逐个执行 Chromium 156.0.8078.4、Firefox 157.0、WebKit 27.2。诊断脚本只把首次采样回调延迟 60ms，不修改 CSS、原生时钟、动画对象或计算样式。最终三次均通过，首次自然采样分别已到约 83.34ms、83.4ms 和 81ms，原有所有断言仍满足。

三份本地报告的 run ID 分别为 `cd6502b2-6de8-4c99-a07f-149c4f048d5a`、`eb522bd4-5d62-4689-bf9f-c01f6df0f9fc`、`953e04c0-451b-40e9-a317-0848dae37154`，位于 `e2e/.artifacts/tailwind/`。每个 runner 关闭自己的 context 后检查剩余 context 为零，再关闭自己创建的 browser；无临时页面保留。首次真实 WebKit 检查暴露采样闭包内的 tsx `__name` helper，已移除该模块依赖，并由真实 tsx 隔离 realm 回归覆盖原生字段采集和终帧持有对象。

本次没有修改 CSS、demo、主题或样式输出，因此没有重生成 static 基线。新 head 的 hosted CI 结果需另行核对，不能由这些本地定向结果推断。

## 适用边界

验收继续为 `partial`。本地 extended 预检仍在 Harmony `uitest dumpLayout` 的 15 秒预算超时；全面 15 目标没有调度，不复用失败报告或绕过预检。RN 实际交付 bundle/HMR、Image/ScrollView、RN/Lynx 注册夹具、转换 oracle 和六类 Web variant 的既有缺口见 [能力证据记录](tailwind-capability-evidence.md)。

## 规则评估

通过采集边界、独立 oracle 和可执行负向回归修正测试，不新增或放宽 AGENTS 规则，不调整性能预算、证据门禁或平台支持表。
