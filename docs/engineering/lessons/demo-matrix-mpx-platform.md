---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1170
baseline: d448f92fd8d4dac0c6d2226eeef612825bd7fd36
regressions:
  - scripts/ci/demo-matrix/mpx-target.test.mjs
  - scripts/ci/demo-matrix/process-diagnostic.test.mjs
---

# MPX 目标平台与验收产物归属

## 症状

PR #1172 的 Windows Node 24 MPX 矩阵在微信 add 阶段以退出码 0 结束 watch，
运行 34276981545、任务 102234958280 正确判定失败。复查同任务的其他产物发现：
标为 ali、swan、tt 的用例也全部生成了微信模板和样式，旧通过结果不能证明这些平台已经覆盖。

## 根因与纠正

Mpx CLI 2.2.30 的 `--mode` 选择环境，`--targets` 才选择平台。
真实 CLI 的 `getTargets({ _: ['serve'], mode: 'ali' })` 返回 wx；CLI 随后覆盖平台环境变量，
因此额外设置 `MPX_CURRENT_TARGET_MODE` 不能弥补错误参数。

生产和开发命令统一使用 `--targets`。回归调用实际安装的 minimist 和 Mpx 目标解析器，
六个 catalog 场景中非微信目标的 build/dev 解析在修复前失败，修复后通过。
产物验收只从目标平台的模板读取本轮标识和消费的类名，并从对应样式及其 import 图验证样式。
单独检测模板后缀还不够：支付宝模板加空 acss、旁边放正确 wxss，也曾被错误接受。
该混合产物反例在过滤前失败、过滤后通过，避免其他平台样式掩盖当前目标缺失。

## 验证

对 mpx-tailwindcss-v4 的 wx、ali、swan、tt、dd，以及 style-injector-mpx 的 wx，执行：

```sh
CI=1 pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd style-injector-mpx:wx --update --build-only
CI=1 DEMO_MATRIX_PROCESS_DIAGNOSTICS=1 pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd style-injector-mpx:wx
CI=1 pnpm test:demo:matrix
```

六份 static 基线增加真实 platform。钉钉构建额外保留 `0.25rem` spacing 声明，
对应实际 ddml/ddss 输出，不能继续沿用此前误生成的微信基线。
首轮 macOS 六场景生产、initial/replace/add/restore 全部通过；最终过滤实现再次运行相同完整验收，
禁止更新基线，六场景再次全部通过。日志保留在 `verify-1170-1144/mpx-platform-final-verify.log`。

本地曾把读取 demo 源码的矩阵单测与修改同一源码的 watch 验收并发执行，
单测读到了 add 阶段的临时探针而失败。这是验证调度冲突；等待 watch 完成并恢复源码后串行重跑，
不得修改探针断言来容纳这一冲突。

## 适用边界

平台参数缺陷与 Windows watch 提前退出是两项独立发现，不能把前者修复称为后者根因修复。
正常矩阵启用现有进程诊断：用文件 URL 注入以适应子进程 cwd、盘符和空格，
记录 start/beforeExit/exit 与活动资源，不注册保活句柄、不改变退出码。
诊断开关对应的真实 pnpm 子进程测试同时要求已经退出的进程仍被 ensureRunning 拒绝。
Windows watch 退出原因仍待最新 CI 证据，微信开发者工具与其他小程序设备未在本轮验收。

## 规则评估

不新增 AGENTS 规则。将已有真实平台与产物归属要求落实为实际 CLI 解析和反例测试。
